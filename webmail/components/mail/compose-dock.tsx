"use client"

import React, { useState, useRef, useEffect } from "react"
import { VStack, HStack, StackItem } from "@astryxdesign/core/Layout"
import { Text } from "@astryxdesign/core/Text"
import { Card } from "@astryxdesign/core/Card"
import { TextInput } from "@astryxdesign/core/TextInput"
import { TextArea } from "@astryxdesign/core/TextArea"
import { Button } from "@astryxdesign/core/Button"
import { IconButton } from "@astryxdesign/core/IconButton"
import { DropdownMenu } from "@astryxdesign/core/DropdownMenu"
import {
  SquarePen,
  Minus,
  Maximize2,
  Minimize2,
  X,
  Paperclip,
  Send,
  Trash2,
  Sparkles,
  ChevronDown,
} from "lucide-react"
import { AttachmentChip } from "./attachment-chip"
import { useMail } from "@/context/mail-context"
import type { EmailAttachment, MailContact } from "@/types/webmail"

type ComposerMode = "docked" | "minimized" | "maximized"

export function ComposeDock() {
  const {
    isComposeOpen,
    closeCompose,
    composeInitialData,
    identities,
    activeIdentity,
    setActiveIdentity,
    cannedResponses,
    contacts,
    sendEmail,
    saveDraft,
    uploadAttachment,
  } = useMail()

  const [composerMode, setComposerMode] = useState<ComposerMode>("docked")
  const [toInput, setToInput] = useState("")
  const [ccInput, setCcInput] = useState("")
  const [bccInput, setBccInput] = useState("")
  const [showCc, setShowCc] = useState(false)
  const [showBcc, setShowBcc] = useState(false)
  const [subjectInput, setSubjectInput] = useState("")
  const [bodyInput, setBodyInput] = useState("")
  const [attachments, setAttachments] = useState<EmailAttachment[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [contactSuggestions, setContactSuggestions] = useState<MailContact[]>([])

  const fileInputRef = useRef<HTMLInputElement>(null)

  // Populate initial compose data when opening
  useEffect(() => {
    if (composeInitialData) {
      if (composeInitialData.to) setToInput(composeInitialData.to)
      if (composeInitialData.subject) setSubjectInput(composeInitialData.subject)
      if (composeInitialData.body) setBodyInput(composeInitialData.body)
      setComposerMode("docked")
    }
  }, [composeInitialData])

  // Reset fields on close
  const handleClose = () => {
    // Auto-save draft if content exists
    if (toInput.trim() || subjectInput.trim() || bodyInput.trim()) {
      saveDraft(toInput, subjectInput, bodyInput, attachments)
    }
    setToInput("")
    setCcInput("")
    setBccInput("")
    setShowCc(false)
    setShowBcc(false)
    setSubjectInput("")
    setBodyInput("")
    setAttachments([])
    setContactSuggestions([])
    closeCompose()
  }

  const handleDiscard = () => {
    setToInput("")
    setCcInput("")
    setBccInput("")
    setShowCc(false)
    setShowBcc(false)
    setSubjectInput("")
    setBodyInput("")
    setAttachments([])
    setContactSuggestions([])
    closeCompose()
  }

  // Contact Autocomplete (Audit #11)
  const handleToChange = (val: string) => {
    setToInput(val)
    if (val.trim().length >= 2) {
      const q = val.toLowerCase().trim()
      const matches = contacts
        .filter((c) => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q))
        .slice(0, 5)
      setContactSuggestions(matches)
    } else {
      setContactSuggestions([])
    }
  }

  const handleSelectContact = (contact: MailContact) => {
    setToInput(contact.email)
    setContactSuggestions([])
  }

  // Real Binary Attachment Streaming (Audit #2)
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
          if (["zip", "tar", "gz", "rar"].includes(ext)) return "archive"
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

  const handleSend = async () => {
    if (!toInput.trim()) return
    await sendEmail(
      toInput.trim(),
      subjectInput.trim(),
      bodyInput.trim(),
      attachments,
      activeIdentity.id
    )
    handleDiscard()
  }

  if (!isComposeOpen) return null

  // 1. Minimized Mode (Audit #12): 280px pill docked to bottom right
  if (composerMode === "minimized") {
    return (
      <Card
        variant="default"
        padding={2}
        className="fixed bottom-0 right-6 z-50 w-72 shadow-xl border border-border/80 bg-background rounded-t-lg cursor-pointer"
        onClick={() => setComposerMode("docked")}
      >
        <HStack hAlign="between" vAlign="center" width="100%">
          <HStack gap={1.5} vAlign="center">
            <SquarePen size={15} className="text-primary flex-shrink-0" />
            <Text type="body" size="sm" weight="semibold" maxLines={1} className="max-w-[170px]">
              {subjectInput.trim() || "New Message"}
            </Text>
          </HStack>

          <HStack gap={0.5} vAlign="center" onClick={(e) => e.stopPropagation()}>
            <IconButton
              label="Expand composer"
              tooltip="Expand"
              variant="ghost"
              size="sm"
              icon={<Maximize2 size={13} />}
              onClick={() => setComposerMode("docked")}
            />
            <IconButton
              label="Close composer"
              tooltip="Close"
              variant="ghost"
              size="sm"
              icon={<X size={13} />}
              onClick={handleClose}
            />
          </HStack>
        </HStack>
      </Card>
    )
  }

  // 2. Docked & Maximized Mode: Full Modern Composer
  const isMaximized = composerMode === "maximized"

  return (
    <>
      {/* Optional backdrop when maximized */}
      {isMaximized && (
        <VStack
          className="fixed inset-0 z-40 bg-background/70 backdrop-blur-sm"
          onClick={() => setComposerMode("docked")}
        />
      )}

      <Card
        variant="default"
        padding={3}
        className={`fixed z-50 flex flex-col shadow-2xl border border-border/80 bg-background transition-all duration-150 ${
          isMaximized
            ? "inset-4 md:inset-10 rounded-lg max-w-5xl mx-auto"
            : "bottom-0 right-6 w-[580px] h-[540px] rounded-t-lg"
        }`}
      >
        <VStack gap={2} width="100%" height="100%" className="overflow-hidden">
          {/* Header Bar */}
          <HStack hAlign="between" vAlign="center" width="100%" className="border-b border-border/40 pb-2">
            <HStack gap={1.5} vAlign="center">
              <SquarePen size={16} className="text-primary flex-shrink-0" />
              <Text type="body" size="sm" weight="semibold">
                {subjectInput.trim() || "New Message"}
              </Text>
            </HStack>

            <HStack gap={0.5} vAlign="center">
              <IconButton
                label="Minimize composer"
                tooltip="Minimize"
                variant="ghost"
                size="sm"
                icon={<Minus size={14} />}
                onClick={() => setComposerMode("minimized")}
              />
              <IconButton
                label={isMaximized ? "Exit full screen" : "Full screen"}
                tooltip={isMaximized ? "Exit full screen" : "Full screen"}
                variant="ghost"
                size="sm"
                icon={isMaximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                onClick={() => setComposerMode(isMaximized ? "docked" : "maximized")}
              />
              <IconButton
                label="Save & close"
                tooltip="Close"
                variant="ghost"
                size="sm"
                icon={<X size={14} />}
                onClick={handleClose}
              />
            </HStack>
          </HStack>

          {/* Sender Identity selector */}
          {identities.length > 1 && (
            <HStack gap={1.5} vAlign="center" width="100%" className="border-b border-border/40 pb-1.5">
              <Text type="supporting" size="xsm" color="secondary" className="w-12">
                From:
              </Text>
              <DropdownMenu
                alignment="start"
                renderTrigger={(triggerProps) => (
                  <Button
                    label={`${activeIdentity.name} <${activeIdentity.email}>`}
                    variant="ghost"
                    size="sm"
                    icon={<ChevronDown size={13} />}
                    {...triggerProps}
                  />
                )}
                items={identities.map((id) => ({
                  label: `${id.name} <${id.email}>`,
                  onClick: () => setActiveIdentity(id),
                }))}
              />
            </HStack>
          )}

          {/* Recipient Input with Floating Autocomplete (Audit #11) */}
          <VStack gap={0} width="100%" className="relative border-b border-border/40 pb-1.5">
            <HStack gap={1.5} vAlign="center" width="100%">
              <Text type="supporting" size="xsm" color="secondary" className="w-12 flex-shrink-0">
                To:
              </Text>
              <StackItem size="fill">
                <TextInput
                  label="Recipients"
                  isLabelHidden
                  placeholder="Recipients (email addresses)..."
                  value={toInput}
                  onChange={handleToChange}
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

            {/* Floating Autocomplete Dropdown - Absolute overlay (never shifts layout) */}
            {contactSuggestions.length > 0 && (
              <VStack
                gap={0}
                padding={1}
                width="100%"
                className="absolute left-0 top-full mt-1 z-50 rounded border border-border/80 bg-background shadow-xl backdrop-blur max-h-48 overflow-y-auto"
              >
                {contactSuggestions.map((contact) => (
                  <HStack
                    key={contact.id}
                    gap={2}
                    vAlign="center"
                    paddingInline={2}
                    paddingBlock={1.5}
                    className="cursor-pointer hover:bg-neutral-subtle/50 rounded transition-colors"
                    onClick={() => handleSelectContact(contact)}
                  >
                    <Text type="body" size="sm" weight="semibold">
                      {contact.name}
                    </Text>
                    <Text type="supporting" size="xsm" color="secondary">
                      &lt;{contact.email}&gt;
                    </Text>
                  </HStack>
                ))}
              </VStack>
            )}
          </VStack>

          {/* CC Field */}
          {showCc && (
            <HStack gap={1.5} vAlign="center" width="100%" className="border-b border-border/40 pb-1.5">
              <Text type="supporting" size="xsm" color="secondary" className="w-12 flex-shrink-0">
                Cc:
              </Text>
              <StackItem size="fill">
                <TextInput
                  label="Cc recipients"
                  isLabelHidden
                  placeholder="Cc recipients..."
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

          {/* BCC Field */}
          {showBcc && (
            <HStack gap={1.5} vAlign="center" width="100%" className="border-b border-border/40 pb-1.5">
              <Text type="supporting" size="xsm" color="secondary" className="w-12 flex-shrink-0">
                Bcc:
              </Text>
              <StackItem size="fill">
                <TextInput
                  label="Bcc recipients"
                  isLabelHidden
                  placeholder="Bcc recipients..."
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

          {/* Subject Field */}
          <HStack gap={1.5} vAlign="center" width="100%" className="border-b border-border/40 pb-1.5">
            <Text type="supporting" size="xsm" color="secondary" className="w-12 flex-shrink-0">
              Subject:
            </Text>
            <StackItem size="fill">
              <TextInput
                label="Email subject"
                isLabelHidden
                placeholder="Subject"
                value={subjectInput}
                onChange={(val) => setSubjectInput(val)}
                width="100%"
                size="sm"
              />
            </StackItem>
          </HStack>

          {/* Message Body */}
          <TextArea
            label="Message body"
            isLabelHidden
            placeholder="Write your email here (Ctrl+Enter to send)..."
            value={bodyInput}
            onChange={(val) => setBodyInput(val)}
            rows={isMaximized ? 20 : 9}
            width="100%"
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                e.preventDefault()
                handleSend()
              }
            }}
          />

          {/* Real Attachment Chips (Audit #2) */}
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

          {/* Hidden File Input */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileAttach}
          />

          {/* Bottom Action Bar */}
          <HStack hAlign="between" vAlign="center" width="100%" className="pt-2 border-t border-border/40 mt-auto">
            <HStack gap={2} vAlign="center">
              <Button
                label={isUploading ? "Uploading..." : "Send"}
                variant="primary"
                size="md"
                icon={<Send size={15} />}
                isDisabled={!toInput.trim() || isUploading}
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
                      label="Insert template"
                      tooltip="Insert template"
                      variant="ghost"
                      size="md"
                      icon={<Sparkles size={16} />}
                      {...triggerProps}
                    />
                  )}
                  items={cannedResponses.map((cr) => ({
                    label: cr.title,
                    onClick: () => {
                      setBodyInput((prev) => (prev ? `${prev}\n\n${cr.body}` : cr.body))
                      if (cr.subject && !subjectInput) setSubjectInput(cr.subject)
                    },
                  }))}
                />
              )}
            </HStack>

            <IconButton
              label="Discard draft"
              tooltip="Discard draft"
              variant="ghost"
              size="md"
              icon={<Trash2 size={16} />}
              onClick={handleDiscard}
            />
          </HStack>
        </VStack>
      </Card>
    </>
  )
}
