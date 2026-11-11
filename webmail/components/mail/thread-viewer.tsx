"use client"

import React, { useState } from "react"
import { VStack, HStack, StackItem } from "@astryxdesign/core/Layout"
import { Text } from "@astryxdesign/core/Text"
import { IconButton } from "@astryxdesign/core/IconButton"
import { Button } from "@astryxdesign/core/Button"
import { Token } from "@astryxdesign/core/Token"
import { DropdownMenu } from "@astryxdesign/core/DropdownMenu"
import {
  ArrowLeft,
  Archive,
  AlertCircle,
  Trash2,
  Mail,
  Clock,
  FolderInput,
  Tag,
  Printer,
  ChevronsUpDown,
} from "lucide-react"
import { ThreadMessageItem } from "./thread-message-item"
import { InlineReplyBox } from "./inline-reply-box"
import type { EmailThread, CustomMailboxFolder } from "@/types/webmail"

interface ThreadViewerProps {
  email: EmailThread
  customFolders: CustomMailboxFolder[]
  isDarkMode?: boolean
  allowedRemoteImages: Set<string>
  onBack: () => void
  onArchive: () => void
  onReportSpam: () => void
  onDelete: () => void
  onMarkUnread: () => void
  onSnooze: (untilText: string) => void
  onMoveToFolder: (folderId: string) => void
  onApplyLabel: (label: string) => void
  onToggleStar: (msgId: string) => void
}

export function ThreadViewer({
  email,
  customFolders,
  isDarkMode = false,
  allowedRemoteImages,
  onBack,
  onArchive,
  onReportSpam,
  onDelete,
  onMarkUnread,
  onSnooze,
  onMoveToFolder,
  onApplyLabel,
  onToggleStar,
}: ThreadViewerProps) {
  const messages = email.messages && email.messages.length > 0
    ? email.messages
    : [
        {
          id: `msg_${email.id}`,
          senderName: email.senderName,
          senderEmail: email.senderEmail,
          recipientEmail: email.recipientEmail,
          body: email.body,
          htmlBody: email.htmlBody,
          timestamp: email.timestamp,
          fullDate: email.fullDate,
          isoDate: email.isoDate,
          attachments: email.attachments,
          isStarred: email.isStarred,
        },
      ]

  const total = messages.length
  const [expandedMap, setExpandedMap] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {}
    messages.forEach((m, idx) => {
      // Default: Expand the latest message, and expand single messages
      initial[m.id] = idx === total - 1
    })
    return initial
  })

  const [showAllMiddle, setShowAllMiddle] = useState(false)
  const [replyMode, setReplyMode] = useState<"reply" | "reply_all" | "forward" | null>(null)

  const allExpanded = Object.values(expandedMap).every(Boolean)

  const toggleExpand = (msgId: string) => {
    setExpandedMap((prev) => ({ ...prev, [msgId]: !prev[msgId] }))
  }

  const toggleExpandAll = () => {
    const nextState = !allExpanded
    const updated: Record<string, boolean> = {}
    messages.forEach((m) => {
      updated[m.id] = nextState
    })
    setExpandedMap(updated)
    setShowAllMiddle(true)
  }

  return (
    <VStack gap={0} width="100%" height="100%" className="overflow-y-auto">
      {/* 1. Thread Action Toolbar */}
      <HStack
        hAlign="between"
        vAlign="center"
        width="100%"
        paddingInline={4}
        paddingBlock={2}
        className="border-b border-border/50 sticky top-0 bg-background/95 backdrop-blur z-10"
      >
        <HStack gap={1} vAlign="center">
          <IconButton
            label="Back to messages"
            tooltip="Back to list (u)"
            variant="ghost"
            size="sm"
            icon={<ArrowLeft size={16} />}
            onClick={onBack}
          />

          <IconButton
            label="Archive"
            tooltip="Archive (e)"
            variant="ghost"
            size="sm"
            icon={<Archive size={16} />}
            onClick={onArchive}
          />
          <IconButton
            label="Report spam"
            tooltip="Report spam (!)"
            variant="ghost"
            size="sm"
            icon={<AlertCircle size={16} />}
            onClick={onReportSpam}
          />
          <IconButton
            label="Delete"
            tooltip="Delete (#)"
            variant="ghost"
            size="sm"
            icon={<Trash2 size={16} />}
            onClick={onDelete}
          />
          <IconButton
            label="Mark as unread"
            tooltip="Mark as unread"
            variant="ghost"
            size="sm"
            icon={<Mail size={16} />}
            onClick={onMarkUnread}
          />

          {/* Snooze */}
          <DropdownMenu
            alignment="start"
            renderTrigger={(props) => (
              <IconButton
                label="Snooze"
                tooltip="Snooze (b)"
                variant="ghost"
                size="sm"
                icon={<Clock size={16} />}
                {...props}
              />
            )}
            items={[
              { label: "Later today (6:00 PM)", onClick: () => onSnooze("Later today 6:00 PM") },
              { label: "Tomorrow morning (8:00 AM)", onClick: () => onSnooze("Tomorrow 8:00 AM") },
              { label: "This weekend", onClick: () => onSnooze("This weekend") },
              { label: "Next week", onClick: () => onSnooze("Next week") },
            ]}
          />

          {/* Move to folder */}
          <DropdownMenu
            alignment="start"
            renderTrigger={(props) => (
              <IconButton
                label="Move to folder"
                tooltip="Move to (v)"
                variant="ghost"
                size="sm"
                icon={<FolderInput size={16} />}
                {...props}
              />
            )}
            items={[
              { label: "Inbox", onClick: () => onMoveToFolder("inbox") },
              { label: "Archive", onClick: () => onMoveToFolder("archive") },
              { label: "Spam", onClick: () => onMoveToFolder("spam") },
              { label: "Trash", onClick: () => onMoveToFolder("trash") },
              ...(customFolders.length > 0 ? [{ type: "divider" as const }] : []),
              ...customFolders.map((f) => ({
                label: f.name,
                onClick: () => onMoveToFolder(f.id),
              })),
            ]}
          />

          {/* Labels */}
          <DropdownMenu
            alignment="start"
            renderTrigger={(props) => (
              <IconButton
                label="Labels"
                tooltip="Labels (l)"
                variant="ghost"
                size="sm"
                icon={<Tag size={16} />}
                {...props}
              />
            )}
            items={[
              { label: "Clients", onClick: () => onApplyLabel("Clients") },
              { label: "Invoices", onClick: () => onApplyLabel("Invoices") },
              { label: "Work", onClick: () => onApplyLabel("Work") },
              { label: "Personal", onClick: () => onApplyLabel("Personal") },
            ]}
          />
        </HStack>

        {/* Right side tools */}
        <HStack gap={1} vAlign="center">
          {total > 1 && (
            <IconButton
              label={allExpanded ? "Collapse all" : "Expand all"}
              tooltip={allExpanded ? "Collapse all" : "Expand all"}
              variant="ghost"
              size="sm"
              icon={<ChevronsUpDown size={16} />}
              onClick={toggleExpandAll}
            />
          )}

          <IconButton
            label="Print thread"
            tooltip="Print all"
            variant="ghost"
            size="sm"
            icon={<Printer size={16} />}
            onClick={() => window.print()}
          />
        </HStack>
      </HStack>

      {/* 2. Subject Title & Label Badges */}
      <HStack
        hAlign="between"
        vAlign="center"
        width="100%"
        paddingInline={4}
        paddingBlock={3}
        className="border-b border-border/40"
      >
        <HStack gap={2} vAlign="center" wrap="wrap">
          <Text type="large" size="xl" weight="bold">
            {email.subject || "(No Subject)"}
          </Text>

          {email.folder && email.folder !== "inbox" && (
            <Token
              label={email.folder.charAt(0).toUpperCase() + email.folder.slice(1)}
              size="sm"
              color="gray"
            />
          )}

          {email.label && (
            <Token
              label={email.label}
              size="sm"
              color={email.label === "Clients" ? "green" : email.label === "Work" ? "blue" : "purple"}
            />
          )}
        </HStack>
      </HStack>

      {/* 3. Conversation Message Stream */}
      <VStack gap={0} width="100%">
        {(() => {
          const shouldSuperCollapse = total >= 4 && !showAllMiddle
          return messages.map((msg, idx) => {
            const isHiddenMiddle = shouldSuperCollapse && idx > 0 && idx < total - 2
            if (isHiddenMiddle) {
              if (idx === 1) {
                return (
                  <HStack
                    key="supercollapse"
                    vAlign="center"
                    hAlign="center"
                    width="100%"
                    paddingBlock={2}
                    className="border-b border-border/40 bg-neutral-subtle/20"
                  >
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={<ChevronsUpDown size={14} />}
                      label={`${total - 3} older messages`}
                      onClick={() => setShowAllMiddle(true)}
                    />
                  </HStack>
                )
              }
              return null
            }

            return (
              <ThreadMessageItem
                key={msg.id}
                message={msg}
                isExpanded={Boolean(expandedMap[msg.id])}
                isLatest={idx === total - 1}
                isDarkMode={isDarkMode}
                allowRemoteImages={Boolean(
                  email.remoteImagesAllowed || allowedRemoteImages.has(email.id)
                )}
                onToggleExpand={() => toggleExpand(msg.id)}
                onToggleStar={onToggleStar}
                onReply={(mode) => setReplyMode(mode)}
                onPrint={() => window.print()}
              />
            )
          })
        })()}
      </VStack>

      {/* 4. Bottom Inline Reply Area */}
      <VStack width="100%" paddingInline={4} paddingBlock={3}>
        {replyMode ? (
          <InlineReplyBox
            threadId={email.id}
            latestMessage={messages[messages.length - 1]}
            initialMode={replyMode}
            onClose={() => setReplyMode(null)}
          />
        ) : (
          <HStack gap={2} vAlign="center" paddingBlockStart={1}>
            <Button
              label="Reply"
              icon={<ArrowLeft size={14} />}
              variant="secondary"
              size="sm"
              onClick={() => setReplyMode("reply")}
            />
            <Button
              label="Forward"
              variant="secondary"
              size="sm"
              onClick={() => setReplyMode("forward")}
            />
          </HStack>
        )}
      </VStack>
    </VStack>
  )
}
