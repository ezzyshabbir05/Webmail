"use client"

import React, { useState } from "react"
import { HStack, VStack, StackItem } from "@astryxdesign/core/Layout"
import { Text } from "@astryxdesign/core/Text"
import { Avatar } from "@astryxdesign/core/Avatar"
import { IconButton } from "@astryxdesign/core/IconButton"
import { Popover } from "@astryxdesign/core/Popover"
import { MetadataList, MetadataListItem } from "@astryxdesign/core/MetadataList"
import { StatusDot } from "@astryxdesign/core/StatusDot"
import { Link } from "@astryxdesign/core/Link"
import { DropdownMenu } from "@astryxdesign/core/DropdownMenu"
import {
  Star,
  Reply,
  ReplyAll,
  Forward,
  ChevronDown,
  ChevronUp,
  MoreVertical,
  Printer,
  Download,
  Lock,
  Paperclip,
} from "lucide-react"
import { HtmlEmailViewer } from "./html-email-viewer"
import { AttachmentChip, triggerAttachmentDownload } from "./attachment-chip"
import { formatGmailDate, formatGmailFullDate } from "./date-formatter"
import type { ThreadMessage, EmailAttachment } from "@/types/webmail"

interface ThreadMessageItemProps {
  message: ThreadMessage
  isExpanded: boolean
  isLatest: boolean
  isDarkMode?: boolean
  allowRemoteImages?: boolean
  onToggleExpand: () => void
  onToggleStar: (msgId: string) => void
  onReply: (mode: "reply" | "reply_all" | "forward") => void
  onPrint?: () => void
}

export function ThreadMessageItem({
  message,
  isExpanded,
  isLatest,
  isDarkMode = false,
  allowRemoteImages = false,
  onToggleExpand,
  onToggleStar,
  onReply,
  onPrint,
}: ThreadMessageItemProps) {
  const [isLightPaper, setIsLightPaper] = useState(false)

  const dateShort = formatGmailDate(message.isoDate || message.timestamp)
  const dateFull = formatGmailFullDate(message.isoDate || message.fullDate || message.timestamp)

  const snippet = message.body
    ? message.body.slice(0, 100).replace(/\s+/g, " ").trim()
    : ""

  const handleExportEml = () => {
    const emlContent = [
      `From: ${message.senderName} <${message.senderEmail}>`,
      `To: ${message.recipientEmail}`,
      message.ccEmails && message.ccEmails.length > 0 ? `Cc: ${message.ccEmails.join(", ")}` : "",
      `Date: ${dateFull}`,
      `Subject: Message Export`,
      `MIME-Version: 1.0`,
      `Content-Type: ${message.htmlBody ? "text/html" : "text/plain"}; charset="UTF-8"`,
      "",
      message.htmlBody || message.body,
    ]
      .filter(Boolean)
      .join("\n")

    const blob = new Blob([emlContent], { type: "message/rfc822" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${message.id}.eml`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // 1. Collapsed View: Compact Single Line Row
  if (!isExpanded) {
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

            {/* Recipient Details Popover */}
            <Popover
              label="Recipient details"
              placement="below"
              alignment="start"
              width={340}
              padding={3}
              content={
                <MetadataList label={{ position: "start", width: 68 }}>
                  <MetadataListItem label="from">
                    <Text type="body" size="sm">
                      {message.senderName} &lt;{message.senderEmail}&gt;
                    </Text>
                  </MetadataListItem>
                  <MetadataListItem label="to">
                    <Text type="body" size="sm">
                      {message.recipientEmail}
                    </Text>
                  </MetadataListItem>
                  {message.ccEmails && message.ccEmails.length > 0 && (
                    <MetadataListItem label="cc">
                      <Text type="body" size="sm">
                        {message.ccEmails.join(", ")}
                      </Text>
                    </MetadataListItem>
                  )}
                  <MetadataListItem label="date">
                    <Text type="body" size="sm">
                      {dateFull}
                    </Text>
                  </MetadataListItem>
                  <MetadataListItem label="security">
                    <HStack gap={1.5} vAlign="center">
                      <Lock size={12} />
                      <StatusDot
                        variant={message.spfStatus === "fail" ? "error" : "success"}
                        label={`SPF ${message.spfStatus || "pass"}`}
                      />
                      <StatusDot
                        variant={message.dkimStatus === "fail" ? "error" : "success"}
                        label={`DKIM ${message.dkimStatus || "pass"}`}
                      />
                      <StatusDot
                        variant={message.dmarcStatus === "fail" ? "error" : "success"}
                        label={`DMARC ${message.dmarcStatus || "pass"}`}
                      />
                    </HStack>
                  </MetadataListItem>
                </MetadataList>
              }
            >
              <Link
                label="to me"
                type="body"
                size="sm"
                color="secondary"
                hasUnderline={false}
              >
                to me <ChevronDown size={13} className="inline-block" />
              </Link>
            </Popover>
          </VStack>
        </HStack>

        {/* Header Right Action Tools */}
        <HStack gap={1} vAlign="center">
          <Text type="supporting" size="xsm" color="secondary">
            {dateShort}
          </Text>

          <IconButton
            label={message.isStarred ? "Starred" : "Star"}
            tooltip={message.isStarred ? "Starred" : "Star"}
            variant="ghost"
            size="sm"
            icon={
              <Star
                size={16}
                className={message.isStarred ? "fill-warning stroke-warning" : undefined}
              />
            }
            onClick={() => onToggleStar(message.id)}
          />

          <IconButton
            label="Reply"
            tooltip="Reply (r)"
            variant="ghost"
            size="sm"
            icon={<Reply size={16} />}
            onClick={() => onReply("reply")}
          />

          <IconButton
            label="Collapse message"
            tooltip="Collapse"
            variant="ghost"
            size="sm"
            icon={<ChevronUp size={16} />}
            onClick={onToggleExpand}
          />

          <DropdownMenu
            alignment="end"
            renderTrigger={(props) => (
              <IconButton
                label="Message actions"
                tooltip="More"
                variant="ghost"
                size="sm"
                icon={<MoreVertical size={16} />}
                {...props}
              />
            )}
            items={[
              { label: "Reply", icon: <Reply size={14} />, onClick: () => onReply("reply") },
              { label: "Reply all", icon: <ReplyAll size={14} />, onClick: () => onReply("reply_all") },
              { label: "Forward", icon: <Forward size={14} />, onClick: () => onReply("forward") },
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
          />
        ) : (
          <Text type="body" size="sm" className="whitespace-pre-wrap leading-relaxed">
            {message.body}
          </Text>
        )}

        {/* Real Binary Attachments Grid */}
        {message.attachments && message.attachments.length > 0 && (
          <VStack gap={2} width="100%" paddingBlockStart={2}>
            <HStack gap={1} vAlign="center">
              <Paperclip size={14} />
              <Text type="supporting" size="sm" weight="semibold">
                {message.attachments.length} Attachment
                {message.attachments.length > 1 ? "s" : ""}
              </Text>
            </HStack>

            <HStack gap={2} wrap="wrap" width="100%">
              {message.attachments.map((att) => (
                <AttachmentChip key={att.id} attachment={att} isDownloadable />
              ))}
            </HStack>
          </VStack>
        )}
      </VStack>
    </VStack>
  )
}
