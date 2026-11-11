"use client"

import React, { useState } from "react"
import { VStack, HStack, StackItem, Layout, LayoutHeader, LayoutContent } from "@astryxdesign/core/Layout"
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
          id: email.id,
          senderName: email.senderName,
          senderEmail: email.senderEmail,
          recipientEmail: email.recipientEmail,
          ccEmails: email.ccEmails,
          replyToEmail: email.replyToEmail,
          body: email.body,
          htmlBody: email.htmlBody,
          timestamp: email.timestamp,
          fullDate: email.fullDate,
          isoDate: email.isoDate,
          isStarred: email.isStarred,
          attachments: email.attachments,
          spfStatus: "pass" as const,
          dkimStatus: "pass" as const,
          dmarcStatus: "pass" as const,
        },
      ]

  // Track expanded state for each message (last message is expanded by default)
  const [expandedMap, setExpandedMap] = useState<Record<string, boolean>>(() => {
    const map: Record<string, boolean> = {}
    messages.forEach((m, idx) => {
      map[m.id] = idx === messages.length - 1
    })
    return map
  })

  // Collapsed middle messages toggle
  const [showAllMiddle, setShowAllMiddle] = useState(false)
  const [isReplying, setIsReplying] = useState(false)
  const [replyMode, setReplyMode] = useState<"reply" | "reply_all" | "forward">("reply")
  const [activeReplyMessage, setActiveReplyMessage] = useState(messages[messages.length - 1])

  const toggleExpand = (msgId: string) => {
    setExpandedMap((prev) => ({ ...prev, [msgId]: !prev[msgId] }))
  }

  const expandAll = () => {
    const next: Record<string, boolean> = {}
    messages.forEach((m) => {
      next[m.id] = true
    })
    setExpandedMap(next)
    setShowAllMiddle(true)
  }

  const collapseAll = () => {
    const next: Record<string, boolean> = {}
    messages.forEach((m, idx) => {
      next[m.id] = idx === messages.length - 1
    })
    setExpandedMap(next)
  }

  const handleStartReply = (msg: typeof messages[0], mode: "reply" | "reply_all" | "forward") => {
    setActiveReplyMessage(msg)
    setReplyMode(mode)
    setIsReplying(true)
  }

  const handlePrintThread = () => {
    window.print()
  }

  // Super-collapsing logic: if > 3 messages, collapse middle messages into count pill
  const hasMiddleCollapse = messages.length > 3 && !showAllMiddle
  const firstMessage = messages[0]
  const lastMessage = messages[messages.length - 1]
  const middleMessages = messages.slice(1, messages.length - 1)

  return (
    <Layout
      height="fill"
      padding={0}
      header={
        <LayoutHeader padding={0} hasDivider label="Thread controls">
          <HStack hAlign="between" vAlign="center" width="100%" paddingInline={4} paddingBlock={2}>
            {/* Left toolbar actions */}
            <HStack gap={1} vAlign="center">
              <IconButton
                label="Back to messages"
                tooltip="Back (u)"
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
                tooltip="Mark as unread (Shift+U)"
                variant="ghost"
                size="sm"
                icon={<Mail size={16} />}
                onClick={onMarkUnread}
              />

              {/* Snooze Dropdown */}
              <DropdownMenu
                alignment="start"
                renderTrigger={(triggerProps) => (
                  <IconButton
                    label="Snooze"
                    tooltip="Snooze"
                    variant="ghost"
                    size="sm"
                    icon={<Clock size={16} />}
                    {...triggerProps}
                  />
                )}
                items={[
                  { label: "Later today (6:00 PM)", onClick: () => onSnooze("Later today") },
                  { label: "Tomorrow (8:00 AM)", onClick: () => onSnooze("Tomorrow") },
                  { label: "This weekend (Saturday)", onClick: () => onSnooze("This weekend") },
                  { label: "Next week (Monday 8:00 AM)", onClick: () => onSnooze("Next week") },
                ]}
              />

              {/* Move to custom folder */}
              {customFolders.length > 0 && (
                <DropdownMenu
                  alignment="start"
                  renderTrigger={(triggerProps) => (
                    <IconButton
                      label="Move to folder"
                      tooltip="Move to"
                      variant="ghost"
                      size="sm"
                      icon={<FolderInput size={16} />}
                      {...triggerProps}
                    />
                  )}
                  items={customFolders.map((f) => ({
                    label: f.name,
                    onClick: () => onMoveToFolder(f.id),
                  }))}
                />
              )}

              {/* Apply Label */}
              <DropdownMenu
                alignment="start"
                renderTrigger={(triggerProps) => (
                  <IconButton
                    label="Apply label"
                    tooltip="Labels"
                    variant="ghost"
                    size="sm"
                    icon={<Tag size={16} />}
                    {...triggerProps}
                  />
                )}
                items={[
                  { label: "Important", onClick: () => onApplyLabel("Important") },
                  { label: "Work", onClick: () => onApplyLabel("Work") },
                  { label: "Finance", onClick: () => onApplyLabel("Finance") },
                  { label: "Personal", onClick: () => onApplyLabel("Personal") },
                ]}
              />
            </HStack>

            {/* Right toolbar actions */}
            <HStack gap={1} vAlign="center">
              <IconButton
                label="Expand or collapse messages"
                tooltip="Toggle expand all"
                variant="ghost"
                size="sm"
                icon={<ChevronsUpDown size={16} />}
                onClick={() => {
                  const anyCollapsed = Object.values(expandedMap).some((v) => !v)
                  if (anyCollapsed) expandAll()
                  else collapseAll()
                }}
              />

              <IconButton
                label="Print conversation"
                tooltip="Print (p)"
                variant="ghost"
                size="sm"
                icon={<Printer size={16} />}
                onClick={handlePrintThread}
              />
            </HStack>
          </HStack>
        </LayoutHeader>
      }
      content={
        <LayoutContent padding={0} isScrollable label="Conversation content">
          <VStack gap={0} width="100%">
            {/* Subject Title & Labels Header */}
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
                    color={
                      email.label === "Clients"
                        ? "green"
                        : email.label === "Invoices"
                        ? "orange"
                        : email.label === "Personal"
                        ? "purple"
                        : "blue"
                    }
                  />
                )}
              </HStack>
            </HStack>

            {/* Conversation Stream */}
            <VStack gap={0} width="100%">
              {hasMiddleCollapse ? (
                <>
                  {/* First Message */}
                  <ThreadMessageItem
                    key={firstMessage.id}
                    message={firstMessage}
                    isExpanded={Boolean(expandedMap[firstMessage.id])}
                    isStarred={Boolean(email.isStarred)}
                    isDarkMode={isDarkMode}
                    allowRemoteImages={allowedRemoteImages.has(email.id)}
                    onToggleExpand={() => toggleExpand(firstMessage.id)}
                    onToggleStar={() => onToggleStar(firstMessage.id)}
                    onReply={(m) => handleStartReply(m, "reply")}
                    onReplyAll={(m) => handleStartReply(m, "reply_all")}
                    onForward={(m) => handleStartReply(m, "forward")}
                    onPrint={handlePrintThread}
                  />

                  {/* Super-collapsed middle pill */}
                  <HStack
                    hAlign="center"
                    width="100%"
                    paddingBlock={2}
                    className="border-b border-border/30 bg-neutral-subtle/20"
                  >
                    <Button
                      label={`${middleMessages.length} older messages`}
                      variant="secondary"
                      size="sm"
                      onClick={() => setShowAllMiddle(true)}
                    />
                  </HStack>

                  {/* Last Message */}
                  <ThreadMessageItem
                    key={lastMessage.id}
                    message={lastMessage}
                    isExpanded={Boolean(expandedMap[lastMessage.id])}
                    isStarred={Boolean(email.isStarred)}
                    isDarkMode={isDarkMode}
                    allowRemoteImages={allowedRemoteImages.has(email.id)}
                    onToggleExpand={() => toggleExpand(lastMessage.id)}
                    onToggleStar={() => onToggleStar(lastMessage.id)}
                    onReply={(m) => handleStartReply(m, "reply")}
                    onReplyAll={(m) => handleStartReply(m, "reply_all")}
                    onForward={(m) => handleStartReply(m, "forward")}
                    onPrint={handlePrintThread}
                  />
                </>
              ) : (
                messages.map((msg) => (
                  <ThreadMessageItem
                    key={msg.id}
                    message={msg}
                    isExpanded={Boolean(expandedMap[msg.id])}
                    isStarred={Boolean(email.isStarred)}
                    isDarkMode={isDarkMode}
                    allowRemoteImages={allowedRemoteImages.has(email.id)}
                    onToggleExpand={() => toggleExpand(msg.id)}
                    onToggleStar={() => onToggleStar(msg.id)}
                    onReply={(m) => handleStartReply(m, "reply")}
                    onReplyAll={(m) => handleStartReply(m, "reply_all")}
                    onForward={(m) => handleStartReply(m, "forward")}
                    onPrint={handlePrintThread}
                  />
                ))
              )}
            </VStack>

            {/* Inline Reply Box (Docked below message stream) */}
            <VStack width="100%" paddingInline={4} paddingBlock={3}>
              {isReplying ? (
                <InlineReplyBox
                  threadId={email.id}
                  activeMessage={activeReplyMessage}
                  initialMode={replyMode}
                  onClose={() => setIsReplying(false)}
                />
              ) : (
                <HStack gap={2} vAlign="center" width="100%" className="pt-2">
                  <Button
                    label="Reply"
                    variant="secondary"
                    size="md"
                    onClick={() => handleStartReply(messages[messages.length - 1], "reply")}
                  />
                  <Button
                    label="Forward"
                    variant="ghost"
                    size="md"
                    onClick={() => handleStartReply(messages[messages.length - 1], "forward")}
                  />
                </HStack>
              )}
            </VStack>
          </VStack>
        </LayoutContent>
      }
    />
  )
}
