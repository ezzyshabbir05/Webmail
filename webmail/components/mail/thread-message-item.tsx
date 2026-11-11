"use client"

import React, { useState } from "react"
import { VStack, HStack, StackItem } from "@astryxdesign/core/Layout"
import { Text } from "@astryxdesign/core/Text"
import { Avatar } from "@astryxdesign/core/Avatar"
import { IconButton } from "@astryxdesign/core/IconButton"
import { Button } from "@astryxdesign/core/Button"
import { Token } from "@astryxdesign/core/Token"
import { DropdownMenu } from "@astryxdesign/core/DropdownMenu"
import {
  Star,
  Reply,
  ReplyAll,
  Forward,
  MoreVertical,
  Paperclip,
  Printer,
  Download,
  Info,
  CheckCircle,
  XCircle,
  AlertTriangle,
} from "lucide-react"
import { HtmlEmailViewer } from "./html-email-viewer"
import { AttachmentChip } from "./attachment-chip"
import { formatGmailFullDate } from "./date-formatter"
import type { ThreadMessage } from "@/types/webmail"

interface ThreadMessageItemProps {
  message: ThreadMessage
  isExpanded: boolean
  isStarred: boolean
  isDarkMode?: boolean
  isLightPaper?: boolean
  allowRemoteImages: boolean
  onToggleExpand: () => void
  onToggleStar: () => void
  onReply: (message: ThreadMessage) => void
  onReplyAll: (message: ThreadMessage) => void
  onForward: (message: ThreadMessage) => void
  onAllowRemoteImages?: () => void
  onPrint?: () => void
}

export function ThreadMessageItem({
  message,
  isExpanded,
  isStarred,
  isDarkMode = false,
  isLightPaper = false,
  allowRemoteImages,
  onToggleExpand,
  onToggleStar,
  onReply,
  onReplyAll,
  onForward,
  onAllowRemoteImages,
  onPrint,
}: ThreadMessageItemProps) {
  const [showDetailsPopover, setShowDetailsPopover] = useState(false)

  const dateDisplay = formatGmailFullDate(message.isoDate || message.timestamp)
  const dateShort = message.timestamp || "Recently"

  const handleExportEml = () => {
    const emlContent = `From: "${message.senderName}" <${message.senderEmail}>\nTo: <${message.recipientEmail}>\nDate: ${dateDisplay}\nSubject: Email Export\nMIME-Version: 1.0\nContent-Type: text/plain; charset=UTF-8\n\n${message.body}`
    const blob = new Blob([emlContent], { type: "message/rfc822" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${message.senderName.replace(/\s+/g, "_")}_message.eml`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // 1. Collapsed View: Compact 1-line strip
  if (!isExpanded) {
    const snippet = message.body
      ? message.body.slice(0, 120).replace(/\s+/g, " ")
      : "(Empty message)"

    return (
      <HStack
        gap={3}
        vAlign="center"
        width="100%"
        paddingInline={4}
        paddingBlock={2}
        className="cursor-pointer border-b border-border/40 hover:bg-neutral-subtle/30 transition-colors"
        onClick={onToggleExpand}
      >
        <StackItem size="static">
          <Avatar name={message.senderName} size={24} />
        </StackItem>

        <StackItem size="static">
          <Text type="body" size="sm" weight="semibold" maxLines={1} className="w-36">
            {message.senderName}
          </Text>
        </StackItem>

        <StackItem size="fill">
          <Text type="body" size="sm" color="secondary" maxLines={1} className="truncate">
            {snippet}
          </Text>
        </StackItem>

        {message.attachments && message.attachments.length > 0 && (
          <StackItem size="static">
            <HStack gap={1} vAlign="center">
              <Paperclip size={13} className="text-secondary" />
              <Text type="supporting" size="xsm" color="secondary">
                {message.attachments.length}
              </Text>
            </HStack>
          </StackItem>
        )}

        <StackItem size="static">
          <Text type="supporting" size="xsm" color="secondary" textWrap="nowrap">
            {dateShort}
          </Text>
        </StackItem>
      </HStack>
    )
  }

  // 2. Expanded View: Full Message Body, Details Popover & Attachments
  return (
    <VStack
      gap={3}
      width="100%"
      paddingInline={4}
      paddingBlock={3}
      className="border-b border-border/50 bg-background"
    >
      {/* Message Header Bar */}
      <HStack hAlign="between" vAlign="start" width="100%">
        <HStack gap={2} vAlign="start">
          <Avatar name={message.senderName} size={36} />

          <VStack gap={0.5}>
            <HStack gap={1.5} vAlign="center">
              <Text type="body" size="sm" weight="semibold">
                {message.senderName}
              </Text>
              <Text type="supporting" size="xsm" color="secondary">
                &lt;{message.senderEmail}&gt;
              </Text>
            </HStack>

            {/* Recipient summary line with Details toggle */}
            <HStack gap={1} vAlign="center">
              <Text type="supporting" size="xsm" color="secondary">
                to {message.recipientEmail}
              </Text>
              <IconButton
                label="Message details"
                tooltip="Security details & RFC headers"
                variant="ghost"
                size="sm"
                icon={<Info size={12} />}
                onClick={() => setShowDetailsPopover(!showDetailsPopover)}
              />
            </HStack>

            {/* Security Audit Details Popover (RFC 8601 SPF / DKIM / DMARC) */}
            {showDetailsPopover && (
              <VStack
                gap={1.5}
                padding={3}
                width={340}
                className="rounded border border-border/70 bg-background shadow-lg mt-2 text-xs"
              >
                <HStack hAlign="between" vAlign="center" className="border-b border-border/40 pb-1">
                  <Text type="body" size="sm" weight="semibold">
                    Authentication Details
                  </Text>
                  <IconButton
                    label="Close"
                    variant="ghost"
                    size="sm"
                    icon={<XCircle size={14} />}
                    onClick={() => setShowDetailsPopover(false)}
                  />
                </HStack>

                <HStack hAlign="between" vAlign="center">
                  <Text type="supporting" size="xsm">From:</Text>
                  <Text type="body" size="sm">{message.senderName} &lt;{message.senderEmail}&gt;</Text>
                </HStack>

                <HStack hAlign="between" vAlign="center">
                  <Text type="supporting" size="xsm">To:</Text>
                  <Text type="body" size="sm">{message.recipientEmail}</Text>
                </HStack>

                <HStack hAlign="between" vAlign="center">
                  <Text type="supporting" size="xsm">Date:</Text>
                  <Text type="body" size="sm">{dateDisplay}</Text>
                </HStack>

                <HStack hAlign="between" vAlign="center" className="pt-1 border-t border-border/30">
                  <Text type="supporting" size="xsm">SPF:</Text>
                  <HStack gap={1} vAlign="center">
                    {message.spfStatus === "pass" ? (
                      <Token label="PASS" color="green" size="sm" icon={<CheckCircle size={11} />} />
                    ) : (
                      <Token label={message.spfStatus || "NEUTRAL"} color="orange" size="sm" icon={<AlertTriangle size={11} />} />
                    )}
                  </HStack>
                </HStack>

                <HStack hAlign="between" vAlign="center">
                  <Text type="supporting" size="xsm">DKIM:</Text>
                  <HStack gap={1} vAlign="center">
                    {message.dkimStatus === "pass" ? (
                      <Token label="PASS" color="green" size="sm" icon={<CheckCircle size={11} />} />
                    ) : (
                      <Token label={message.dkimStatus || "NONE"} color="gray" size="sm" />
                    )}
                  </HStack>
                </HStack>

                <HStack hAlign="between" vAlign="center">
                  <Text type="supporting" size="xsm">DMARC:</Text>
                  <HStack gap={1} vAlign="center">
                    {message.dmarcStatus === "pass" ? (
                      <Token label="PASS" color="green" size="sm" icon={<CheckCircle size={11} />} />
                    ) : (
                      <Token label={message.dmarcStatus || "NONE"} color="gray" size="sm" />
                    )}
                  </HStack>
                </HStack>
              </VStack>
            )}
          </VStack>
        </HStack>

        {/* Right side controls: Date, Star, Reply, More options */}
        <HStack gap={1} vAlign="center">
          <Text type="supporting" size="xsm" color="secondary" textWrap="nowrap" className="mr-2">
            {dateDisplay}
          </Text>

          <IconButton
            label={isStarred ? "Starred" : "Star"}
            tooltip={isStarred ? "Starred" : "Star"}
            variant="ghost"
            size="sm"
            icon={
              <Star
                size={16}
                className={isStarred ? "fill-warning stroke-warning" : undefined}
              />
            }
            onClick={onToggleStar}
          />

          <IconButton
            label="Reply"
            tooltip="Reply (r)"
            variant="ghost"
            size="sm"
            icon={<Reply size={16} />}
            onClick={() => onReply(message)}
          />

          <IconButton
            label="Reply all"
            tooltip="Reply all (a)"
            variant="ghost"
            size="sm"
            icon={<ReplyAll size={16} />}
            onClick={() => onReplyAll(message)}
          />

          <IconButton
            label="Forward"
            tooltip="Forward (f)"
            variant="ghost"
            size="sm"
            icon={<Forward size={16} />}
            onClick={() => onForward(message)}
          />

          <DropdownMenu
            alignment="end"
            renderTrigger={(triggerProps) => (
              <IconButton
                label="More message options"
                tooltip="More"
                variant="ghost"
                size="sm"
                icon={<MoreVertical size={16} />}
                {...triggerProps}
              />
            )}
            items={[
              { label: "Reply", icon: <Reply size={14} />, onClick: () => onReply(message) },
              { label: "Reply all", icon: <ReplyAll size={14} />, onClick: () => onReplyAll(message) },
              { label: "Forward", icon: <Forward size={14} />, onClick: () => onForward(message) },
              { type: "divider" as const },
              { label: "Export as .eml", icon: <Download size={14} />, onClick: handleExportEml },
              ...(onPrint ? [{ label: "Print message", icon: <Printer size={14} />, onClick: onPrint }] : []),
            ]}
          />
        </HStack>
      </HStack>

      {/* Message Body */}
      <VStack width="100%" paddingInlineStart={10} gap={3}>
        {message.htmlBody ? (
          <HtmlEmailViewer
            html={message.htmlBody}
            allowRemoteImages={allowRemoteImages}
            isLightPaper={isLightPaper}
            isDarkMode={isDarkMode}
            attachments={message.attachments}
            onAllowRemoteImages={onAllowRemoteImages}
          />
        ) : (
          <Text type="body" size="sm" className="whitespace-pre-wrap leading-relaxed">
            {message.body}
          </Text>
        )}

        {/* Real Attachments Grid (Audit #1) */}
        {message.attachments && message.attachments.length > 0 && (
          <VStack gap={1.5} width="100%" className="pt-2 border-t border-border/30 mt-2">
            <HStack gap={1.5} vAlign="center">
              <Paperclip size={14} className="text-secondary" />
              <Text type="body" size="sm" weight="semibold">
                Attachments ({message.attachments.length})
              </Text>
            </HStack>

            <HStack gap={2} wrap="wrap" width="100%">
              {message.attachments.map((att) => (
                <AttachmentChip
                  key={att.id}
                  attachment={att}
                  readOnly
                />
              ))}
            </HStack>
          </VStack>
        )}
      </VStack>
    </VStack>
  )
}
