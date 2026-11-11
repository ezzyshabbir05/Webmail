"use client"

import React, { useState, useRef } from "react"
import { VStack, HStack, StackItem } from "@astryxdesign/core/Layout"
import { Text } from "@astryxdesign/core/Text"
import { Card } from "@astryxdesign/core/Card"
import { TextArea } from "@astryxdesign/core/TextArea"
import { TextInput } from "@astryxdesign/core/TextInput"
import { Button } from "@astryxdesign/core/Button"
import { IconButton } from "@astryxdesign/core/IconButton"
import { DropdownMenu } from "@astryxdesign/core/DropdownMenu"
import {
  Reply,
  ReplyAll,
  Forward,
  Paperclip,
  Send,
  Trash2,
  Sparkles,
  X,
} from "lucide-react"
import { AttachmentChip } from "./attachment-chip"
import { useMail } from "@/context/mail-context"
import type { EmailAttachment, ThreadMessage } from "@/types/webmail"

interface InlineReplyBoxProps {
  threadId: string
  activeMessage: ThreadMessage
  initialMode?: "reply" | "reply_all" | "forward"
  onClose?: () => void
}

export function InlineReplyBox({
  threadId,
  activeMessage,
  initialMode = "reply",
  onClose,
}: InlineReplyBoxProps) {
  const { replyToEmail, cannedResponses, activeIdentity, uploadAttachment } = useMail()

  const [mode, setMode] = useState<"reply" | "reply_all" | "forward">(initialMode)
  const [toInput, setToInput] = useState(
    initialMode === "forward" ? "" : activeMessage.senderEmail
  )
  const [ccInput, setCcInput] = useState(
    initialMode === "reply_all" && activeMessage.ccEmails
      ? activeMessage.ccEmails.join(", ")
      : ""
  )
  const [bccInput, setBccInput] = useState("")
  const [showCc, setShowCc] = useState(initialMode === "reply_all" && Boolean(activeMessage.ccEmails?.length))
  const [showBcc, setShowBcc] = useState(false)
  const [bodyText, setBodyText] = useState("")
  const [attachments, setAttachments] = useState<EmailAttachment[]>([])
  const [isUploading, setIsUploading] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleModeChange = (newMode: "reply" | "reply_all" | "forward") => {
    setMode(newMode)
    if (newMode === "reply") {
      setToInput(activeMessage.senderEmail)
      setCcInput("")
      setShowCc(false)
    } else if (newMode === "reply_all") {
      setToInput(activeMessage.senderEmail)
      const ccs = activeMessage.ccEmails || []
      setCcInput(ccs.join(", "))
      setShowCc(ccs.length > 0)
    } else if (newMode === "forward") {
      setToInput("")
      setCcInput("")
      setShowCc(false)
      const forwardHeader = `\n\n---------- Forwarded message ---------\nFrom: ${activeMessage.senderName} <${activeMessage.senderEmail}>\nDate: ${activeMessage.fullDate}\nSubject: Re: email\nTo: ${activeMessage.recipientEmail}\n\n${activeMessage.body}`
      setBodyText(forwardHeader)
    }
  }

  const handleFileAttach = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    setIsUploading(true)
    const newAttachments: EmailAttachment[] = []

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      try {
        const uploaded = await uploadAttachment(file)
        const formatBytes = (bytes: number) => {
          if (bytes < 1024) return `${bytes} B`
          if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
          return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
        }
        const getFileType = (name: string): EmailAttachment["type"] => {
          const ext = name.split(".").pop()?.toLowerCase() || ""
          if (["png", "jpg", "jpeg", "webp", "gif", "svg"].includes(ext)) return "image"
          if (ext === "pdf") return "pdf"
          if (["xls", "xlsx", "csv"].includes(ext)) return "spreadsheet"
          if (["doc", "docx", "txt", "md"].includes(ext)) return "document"
          if (["zip", "tar", "gz"].includes(ext)) return "archive"
          return "binary"
        }

        newAttachments.push({
          id: uploaded.blobId,
          name: file.name,
          size: formatBytes(uploaded.size),
          type: getFileType(file.name),
          downloadUrl: `/api/blob/${encodeURIComponent(uploaded.blobId)}/${encodeURIComponent(file.name)}`,
        })
      } catch (err) {
        console.error("Failed to upload attachment:", err)
      }
    }

    setAttachments((prev) => [...prev, ...newAttachments])
    setIsUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const handleSend = () => {
    if (!bodyText.trim() && attachments.length === 0) return

    const ccList = ccInput
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean)

    const bccList = bccInput
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean)

    replyToEmail(threadId, bodyText, {
      mode,
      to: toInput.trim(),
      cc: ccList,
      bcc: bccList,
      attachments,
    })

    setBodyText("")
    setAttachments([])
    if (onClose) onClose()
  }

  const handleDiscard = () => {
    setBodyText("")
    setAttachments([])
    if (onClose) onClose()
  }

  return (
    <Card variant="default" padding={3} width="100%" className="border border-border/60 shadow-sm mt-3">
      <VStack gap={2} width="100%">
        {/* Top Controls: Mode pills & Sender Identity */}
        <HStack hAlign="between" vAlign="center" width="100%">
          <HStack gap={1} vAlign="center">
            <Button
              label="Reply"
              icon={<Reply size={14} />}
              variant={mode === "reply" ? "primary" : "ghost"}
              size="sm"
              onClick={() => handleModeChange("reply")}
            />
            <Button
              label="Reply all"
              icon={<ReplyAll size={14} />}
              variant={mode === "reply_all" ? "primary" : "ghost"}
              size="sm"
              onClick={() => handleModeChange("reply_all")}
            />
            <Button
              label="Forward"
              icon={<Forward size={14} />}
              variant={mode === "forward" ? "primary" : "ghost"}
              size="sm"
              onClick={() => handleModeChange("forward")}
            />
          </HStack>

          <Text type="supporting" size="xsm" color="secondary">
            Sending as: <span className="font-semibold">{activeIdentity.email}</span>
          </Text>
        </HStack>

        {/* Recipient inputs (Forward or modified recipients) */}
        <VStack gap={1.5} width="100%" className="pt-1">
          <HStack gap={1.5} vAlign="center" width="100%">
            <Text type="supporting" size="xsm" color="secondary" className="w-12 flex-shrink-0">
              {mode === "forward" ? "Forward to:" : "To:"}
            </Text>
            <StackItem size="fill">
              <TextInput
                label="Reply to recipient"
                isLabelHidden
                placeholder="recipient@example.com"
                value={toInput}
                onChange={(val) => setToInput(val)}
                width="100%"
                size="sm"
              />
            </StackItem>
            <HStack gap={0.5} vAlign="center" className="flex-shrink-0">
              {!showCc && (
                <Button
                  label="Cc"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowCc(true)}
                />
              )}
              {!showBcc && (
                <Button
                  label="Bcc"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowBcc(true)}
                />
              )}
            </HStack>
          </HStack>

          {showCc && (
            <HStack gap={1.5} vAlign="center" width="100%">
              <Text type="supporting" size="xsm" color="secondary" className="w-12 flex-shrink-0">
                Cc:
              </Text>
              <StackItem size="fill">
                <TextInput
                  label="Cc recipients"
                  isLabelHidden
                  placeholder="comma separated emails..."
                  value={ccInput}
                  onChange={(val) => setCcInput(val)}
                  width="100%"
                  size="sm"
                />
              </StackItem>
              <IconButton
                label="Hide Cc"
                variant="ghost"
                size="sm"
                icon={<X size={13} />}
                onClick={() => {
                  setShowCc(false)
                  setCcInput("")
                }}
              />
            </HStack>
          )}

          {showBcc && (
            <HStack gap={1.5} vAlign="center" width="100%">
              <Text type="supporting" size="xsm" color="secondary" className="w-12 flex-shrink-0">
                Bcc:
              </Text>
              <StackItem size="fill">
                <TextInput
                  label="Bcc recipients"
                  isLabelHidden
                  placeholder="comma separated emails..."
                  value={bccInput}
                  onChange={(val) => setBccInput(val)}
                  width="100%"
                  size="sm"
                />
              </StackItem>
              <IconButton
                label="Hide Bcc"
                variant="ghost"
                size="sm"
                icon={<X size={13} />}
                onClick={() => {
                  setShowBcc(false)
                  setBccInput("")
                }}
              />
            </HStack>
          )}
        </VStack>

        {/* Text Area Body */}
        <TextArea
          label="Reply message"
          isLabelHidden
          placeholder={`Write your ${mode === "forward" ? "forwarded message" : "reply"} here (Ctrl+Enter to send)...`}
          value={bodyText}
          onChange={(val) => setBodyText(val)}
          rows={5}
          width="100%"
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
              e.preventDefault()
              handleSend()
            }
          }}
        />

        {/* Attachment chips preview */}
        {attachments.length > 0 && (
          <HStack gap={1.5} wrap="wrap" width="100%">
            {attachments.map((att) => (
              <AttachmentChip
                key={att.id}
                attachment={att}
                onRemove={() => setAttachments((prev) => prev.filter((a) => a.id !== att.id))}
              />
            ))}
          </HStack>
        )}

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileAttach}
        />

        {/* Bottom Actions Bar */}
        <HStack hAlign="between" vAlign="center" width="100%" className="pt-2 border-t border-border/30">
          <HStack gap={2} vAlign="center">
            <Button
              label={isUploading ? "Uploading..." : "Send"}
              variant="primary"
              size="md"
              icon={<Send size={14} />}
              isDisabled={(!bodyText.trim() && attachments.length === 0) || isUploading}
              onClick={handleSend}
            />

            <IconButton
              label="Attach files"
              tooltip="Attach files"
              variant="ghost"
              size="md"
              icon={<Paperclip size={16} />}
              isDisabled={isUploading}
              onClick={() => fileInputRef.current?.click()}
            />

            {cannedResponses.length > 0 && (
              <DropdownMenu
                alignment="start"
                renderTrigger={(triggerProps) => (
                  <IconButton
                    label="Insert canned template"
                    tooltip="Templates"
                    variant="ghost"
                    size="md"
                    icon={<Sparkles size={16} />}
                    {...triggerProps}
                  />
                )}
                items={cannedResponses.map((cr) => ({
                  label: cr.title,
                  onClick: () => {
                    setBodyText((prev) => (prev ? `${prev}\n\n${cr.body}` : cr.body))
                  },
                }))}
              />
            )}
          </HStack>

          <IconButton
            label="Discard reply"
            tooltip="Discard"
            variant="ghost"
            size="md"
            icon={<Trash2 size={16} />}
            onClick={handleDiscard}
          />
        </HStack>
      </VStack>
    </Card>
  )
}
