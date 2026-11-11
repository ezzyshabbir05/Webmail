"use client"

import React, { useState, useRef } from "react"
import { VStack, HStack, StackItem } from "@astryxdesign/core/Layout"
import { Text } from "@astryxdesign/core/Text"
import { Button } from "@astryxdesign/core/Button"
import { IconButton } from "@astryxdesign/core/IconButton"
import { TextInput } from "@astryxdesign/core/TextInput"
import { TextArea } from "@astryxdesign/core/TextArea"
import { Card } from "@astryxdesign/core/Card"
import { DropdownMenu } from "@astryxdesign/core/DropdownMenu"
import {
  Reply,
  ReplyAll,
  Forward,
  Paperclip,
  Send,
  Trash2,
  Sparkles,
} from "lucide-react"
import { AttachmentChip } from "./attachment-chip"
import { useMail } from "@/context/mail-context"
import type { ThreadMessage, EmailAttachment } from "@/types/webmail"

interface InlineReplyBoxProps {
  threadId: string
  latestMessage: ThreadMessage
  initialMode?: "reply" | "reply_all" | "forward"
  onClose?: () => void
}

export function InlineReplyBox({
  threadId,
  latestMessage,
  initialMode = "reply",
  onClose,
}: InlineReplyBoxProps) {
  const {
    identities,
    activeIdentity,
    setActiveIdentity,
    cannedResponses,
    replyToEmail,
    uploadAttachment,
  } = useMail()

  const [mode, setMode] = useState<"reply" | "reply_all" | "forward">(initialMode)
  const [toInput, setToInput] = useState<string>(() => {
    if (initialMode === "forward") return ""
    return latestMessage.senderEmail || latestMessage.recipientEmail || ""
  })
  const [ccInput, setCcInput] = useState<string>(() => {
    if (initialMode === "reply_all" && latestMessage.ccEmails) {
      return latestMessage.ccEmails.join(", ")
    }
    return ""
  })
  const [bccInput, setBccInput] = useState("")
  const [showCcBcc, setShowCcBcc] = useState(initialMode === "reply_all")
  const [bodyText, setBodyText] = useState("")
  const [attachments, setAttachments] = useState<EmailAttachment[]>([])
  const [isUploading, setIsUploading] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleModeSwitch = (newMode: "reply" | "reply_all" | "forward") => {
    setMode(newMode)
    if (newMode === "forward") {
      setToInput("")
      setCcInput("")
      setShowCcBcc(false)
    } else if (newMode === "reply_all") {
      setToInput(latestMessage.senderEmail || latestMessage.recipientEmail || "")
      if (latestMessage.ccEmails && latestMessage.ccEmails.length > 0) {
        setCcInput(latestMessage.ccEmails.join(", "))
        setShowCcBcc(true)
      }
    } else {
      setToInput(latestMessage.senderEmail || latestMessage.recipientEmail || "")
      setCcInput("")
      setShowCcBcc(false)
    }
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    setIsUploading(true)
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const uploaded = await uploadAttachment(file)
        const newAtt: EmailAttachment = {
          id: uploaded.blobId,
          name: file.name,
          size: `${Math.round(file.size / 1024)} KB`,
          type: file.type.includes("image")
            ? "image"
            : file.type.includes("pdf")
            ? "pdf"
            : file.type.includes("sheet")
            ? "spreadsheet"
            : "document",
          downloadUrl: `/api/blob/${encodeURIComponent(uploaded.blobId)}/${encodeURIComponent(file.name)}`,
        }
        setAttachments((prev) => [...prev, newAtt])
      }
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  const handleSend = () => {
    if (!bodyText.trim() || !toInput.trim()) return

    const ccList = ccInput
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)

    replyToEmail(threadId, bodyText.trim(), {
      mode,
      to: toInput.trim(),
      cc: ccList,
      attachments: attachments.length > 0 ? attachments : undefined,
    })

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
              onClick={() => handleModeSwitch("reply")}
            />
            <Button
              label="Reply all"
              icon={<ReplyAll size={14} />}
              variant={mode === "reply_all" ? "primary" : "ghost"}
              size="sm"
              onClick={() => handleModeSwitch("reply_all")}
            />
            <Button
              label="Forward"
              icon={<Forward size={14} />}
              variant={mode === "forward" ? "primary" : "ghost"}
              size="sm"
              onClick={() => handleModeSwitch("forward")}
            />
          </HStack>

          {/* Sender Identity Dropdown */}
          <HStack gap={1} vAlign="center">
            <Text type="supporting" size="xsm" color="secondary">
              From:
            </Text>
            <DropdownMenu
              alignment="end"
              renderTrigger={(props) => (
                <Button
                  label={`${activeIdentity.name} <${activeIdentity.email}>`}
                  variant="ghost"
                  size="sm"
                  {...props}
                />
              )}
              items={identities.map((ident) => ({
                label: `${ident.name} <${ident.email}>`,
                onClick: () => setActiveIdentity(ident),
              }))}
            />
          </HStack>
        </HStack>

        {/* Recipient inputs */}
        <VStack gap={1.5} width="100%">
          <HStack gap={2} vAlign="center" width="100%">
            <TextInput
              label="To"
              isLabelHidden
              placeholder="To: recipient@example.com"
              value={toInput}
              onChange={(val) => setToInput(val)}
              width="100%"
              size="sm"
            />
            <Button
              label={showCcBcc ? "Hide Cc/Bcc" : "Cc / Bcc"}
              variant="ghost"
              size="sm"
              onClick={() => setShowCcBcc((prev) => !prev)}
            />
          </HStack>

          {showCcBcc && (
            <HStack gap={2} width="100%">
              <TextInput
                label="Cc"
                isLabelHidden
                placeholder="Cc: ..."
                value={ccInput}
                onChange={(val) => setCcInput(val)}
                width="50%"
                size="sm"
              />
              <TextInput
                label="Bcc"
                isLabelHidden
                placeholder="Bcc: ..."
                value={bccInput}
                onChange={(val) => setBccInput(val)}
                width="50%"
                size="sm"
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
          onChange={handleFileSelect}
        />

        {/* Bottom Actions Bar */}
        <HStack hAlign="between" vAlign="center" width="100%" paddingBlockStart={1}>
          <HStack gap={1} vAlign="center">
            <IconButton
              label="Attach files"
              tooltip="Attach files"
              variant="ghost"
              size="sm"
              icon={<Paperclip size={16} />}
              onClick={() => fileInputRef.current?.click()}
              isDisabled={isUploading}
            />

            {cannedResponses.length > 0 && (
              <DropdownMenu
                alignment="start"
                renderTrigger={(props) => (
                  <Button
                    label="Templates"
                    variant="ghost"
                    size="sm"
                    icon={<Sparkles size={14} />}
                    {...props}
                  />
                )}
                items={cannedResponses.map((cr) => ({
                  label: cr.title,
                  onClick: () => setBodyText((prev) => `${prev}\n\n${cr.body}`),
                }))}
              />
            )}
          </HStack>

          <HStack gap={1.5} vAlign="center">
            {onClose && (
              <IconButton
                label="Discard draft"
                tooltip="Discard"
                variant="ghost"
                size="sm"
                icon={<Trash2 size={16} />}
                onClick={onClose}
              />
            )}

            <Button
              label={mode === "forward" ? "Forward" : "Send"}
              variant="primary"
              size="sm"
              icon={<Send size={14} />}
              isDisabled={!bodyText.trim() || !toInput.trim() || isUploading}
              onClick={handleSend}
            />
          </HStack>
        </HStack>
      </VStack>
    </Card>
  )
}
