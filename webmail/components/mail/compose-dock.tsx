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
  ChevronUp,
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
  const [showCcBcc, setShowCcBcc] = useState(false)
  const [subjectInput, setSubjectInput] = useState("")
  const [bodyInput, setBodyInput] = useState("")
  const [attachments, setAttachments] = useState<EmailAttachment[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [contactSuggestions, setContactSuggestions] = useState<MailContact[]>([])

  const fileInputRef = useRef<HTMLInputElement>(null)

  // Populate initial data if opened via reply or draft
  useEffect(() => {
    if (composeInitialData) {
      if (composeInitialData.to) setToInput(composeInitialData.to)
      if (composeInitialData.subject) setSubjectInput(composeInitialData.subject)
      if (composeInitialData.body) setBodyInput(composeInitialData.body)
    }
  }, [composeInitialData])

  if (!isComposeOpen) return null

  // 1. Minimized View: Gmail-style collapsed pill tab docked to bottom right
  if (composerMode === "minimized") {
    return (
      <div className="fixed bottom-0 right-6 z-50">
        <Card
          variant="default"
          padding={2}
          className="w-72 shadow-xl rounded-t-lg border-b-0 cursor-pointer hover:bg-neutral-subtle/40 transition-colors"
          onClick={() => setComposerMode("docked")}
        >
          <HStack hAlign="between" vAlign="center" width="100%">
            <HStack gap={1.5} vAlign="center" className="overflow-hidden">
              <SquarePen size={14} className="text-primary shrink-0" />
              <Text type="body" size="sm" weight="semibold" maxLines={1} className="truncate">
                {subjectInput.trim() || "New Message"}
              </Text>
            </HStack>

            <HStack gap={0.5} vAlign="center" onClick={(e) => e.stopPropagation()}>
              <IconButton
                label="Expand composer"
                tooltip="Expand"
                variant="ghost"
                size="sm"
                icon={<ChevronUp size={14} />}
                onClick={() => setComposerMode("docked")}
              />
              <IconButton
                label="Close composer"
                tooltip="Close"
                variant="ghost"
                size="sm"
                icon={<X size={14} />}
                onClick={closeCompose}
              />
            </HStack>
          </HStack>
        </Card>
      </div>
    )
  }

  // 2. Contact Autocomplete Filter
  const handleToChange = (val: string) => {
    setToInput(val)
    if (val.trim().length > 1) {
      const q = val.toLowerCase()
      const matches = contacts.filter(
        (c) =>
          c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q)
      )
      setContactSuggestions(matches.slice(0, 5))
    } else {
      setContactSuggestions([])
    }
  }

  const handleSelectContact = (email: string) => {
    setToInput(email)
    setContactSuggestions([])
  }

  // 3. Binary Attachment Upload via JMAP /api/upload
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
    if (!toInput.trim()) return
    sendEmail(
      toInput.trim(),
      subjectInput.trim() || "(No subject)",
      bodyInput,
      attachments.length > 0 ? attachments : undefined,
      activeIdentity.id
    )
    closeCompose()
  }

  const handleSaveDraft = () => {
    saveDraft(toInput, subjectInput, bodyInput, attachments)
    closeCompose()
  }

  const isMaximized = composerMode === "maximized"

  return (
    <div
      className={
        isMaximized
          ? "fixed inset-4 sm:inset-10 z-50 flex flex-col shadow-2xl rounded-xl overflow-hidden"
          : "fixed bottom-0 right-6 z-50 w-[560px] max-w-[95vw] shadow-2xl rounded-t-xl overflow-hidden"
      }
    >
      <Card
        variant="default"
        padding={3}
        className="w-full h-full flex flex-col border border-border/70 bg-background"
      >
        <VStack gap={2} width="100%" height="100%" className="overflow-hidden">
          {/* Header Titlebar with Window Controls */}
          <HStack hAlign="between" vAlign="center" width="100%" className="border-b border-border/40 pb-2">
            <HStack gap={1.5} vAlign="center">
              <SquarePen size={16} className="text-primary" />
              <Text type="body" size="sm" weight="semibold">
                {subjectInput.trim() || "New Message"}
              </Text>
            </HStack>

            <HStack gap={0.5} vAlign="center">
              <IconButton
                label="Minimize"
                tooltip="Minimize"
                variant="ghost"
                size="sm"
                icon={<Minus size={14} />}
                onClick={() => setComposerMode("minimized")}
              />
              <IconButton
                label={isMaximized ? "Restore" : "Maximize"}
                tooltip={isMaximized ? "Exit full screen" : "Full screen"}
                variant="ghost"
                size="sm"
                icon={isMaximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                onClick={() => setComposerMode(isMaximized ? "docked" : "maximized")}
              />
              <IconButton
                label="Close"
                tooltip="Save & close"
                variant="ghost"
                size="sm"
                icon={<X size={14} />}
                onClick={handleSaveDraft}
              />
            </HStack>
          </HStack>

          {/* Sender Identity Selector */}
          <HStack gap={2} vAlign="center" width="100%">
            <Text type="supporting" size="xsm" color="secondary">
              From:
            </Text>
            <DropdownMenu
              alignment="start"
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

          {/* Recipients Row with Floating Autocomplete Popover */}
          <div className="relative w-full">
            <HStack gap={2} vAlign="center" width="100%">
              <TextInput
                label="Recipients (To)"
                isLabelHidden
                placeholder="To: recipient@example.com"
                value={toInput}
                onChange={handleToChange}
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

            {/* Floating Suggestions Overlay (Doesn't distort the form!) */}
            {contactSuggestions.length > 0 && (
              <div className="absolute top-full left-0 right-16 z-20 mt-1 shadow-lg rounded-md overflow-hidden bg-background border border-border">
                <VStack gap={0} width="100%">
                  {contactSuggestions.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className="w-full text-left px-3 py-2 text-sm hover:bg-neutral-subtle/50 transition-colors flex items-center justify-between"
                      onClick={() => handleSelectContact(c.email)}
                    >
                      <span className="font-semibold">{c.name}</span>
                      <span className="text-secondary text-xs">{c.email}</span>
                    </button>
                  ))}
                </VStack>
              </div>
            )}
          </div>

          {/* Collapsible CC / BCC */}
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

          {/* Subject Field */}
          <TextInput
            label="Subject"
            isLabelHidden
            placeholder="Subject"
            value={subjectInput}
            onChange={(val) => setSubjectInput(val)}
            width="100%"
            size="sm"
          />

          {/* Text Area Body */}
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

          {/* Attachment Preview Chips */}
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
            onChange={handleFileSelect}
          />

          {/* Bottom Actions Bar */}
          <HStack hAlign="between" vAlign="center" width="100%" className="border-t border-border/40 pt-2">
            <HStack gap={1} vAlign="center">
              <Button
                label="Send"
                variant="primary"
                size="sm"
                icon={<Send size={14} />}
                isDisabled={!toInput.trim() || isUploading}
                onClick={handleSend}
              />

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
                    <IconButton
                      label="Insert template"
                      tooltip="Templates"
                      variant="ghost"
                      size="sm"
                      icon={<Sparkles size={16} />}
                      {...props}
                    />
                  )}
                  items={cannedResponses.map((cr) => ({
                    label: cr.title,
                    onClick: () => {
                      setBodyInput((prev) => `${prev}\n\n${cr.body}`)
                      if (cr.subject && !subjectInput) setSubjectInput(cr.subject)
                    },
                  }))}
                />
              )}
            </HStack>

            <HStack gap={1} vAlign="center">
              <Button
                label="Save Draft"
                variant="ghost"
                size="sm"
                onClick={handleSaveDraft}
              />
              <IconButton
                label="Discard draft"
                tooltip="Discard draft"
                variant="ghost"
                size="sm"
                icon={<Trash2 size={16} />}
                onClick={closeCompose}
              />
            </HStack>
          </HStack>
        </VStack>
      </Card>
    </div>
  )
}
