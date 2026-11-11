"use client"

import React, { useState } from "react"
import { HStack, VStack, StackItem } from "@astryxdesign/core/Layout"
import { Text } from "@astryxdesign/core/Text"
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput"
import { IconButton } from "@astryxdesign/core/IconButton"
import { Token } from "@astryxdesign/core/Token"
import { HoverCard } from "@astryxdesign/core/HoverCard"
import { Avatar } from "@astryxdesign/core/Avatar"
import { Button } from "@astryxdesign/core/Button"
import { DropdownMenu } from "@astryxdesign/core/DropdownMenu"
import {
  Star,
  Archive,
  Trash2,
  Mail,
  MailOpen,
  Clock,
} from "lucide-react"
import { AttachmentChip } from "./attachment-chip"
import { formatGmailDate } from "./date-formatter"
import type { EmailThread, EmailFolder } from "@/types/webmail"

interface MailThreadRowProps {
  item: EmailThread
  isSelected: boolean
  isFocused: boolean
  activeFolder: EmailFolder
  searchQuery: string
  onSelect: (id: string) => void
  onToggleStar: (id: string, e: React.MouseEvent) => void
  onOpen: (id: string) => void
  onArchive: (id: string) => void
  onDelete: (id: string) => void
  onToggleRead: (id: string) => void
  onSnooze: (id: string, untilText: string) => void
  onQuickCompose?: (to: string) => void
}

export function MailThreadRow({
  item,
  isSelected,
  isFocused,
  activeFolder,
  searchQuery,
  onSelect,
  onToggleStar,
  onOpen,
  onArchive,
  onDelete,
  onToggleRead,
  onSnooze,
  onQuickCompose,
}: MailThreadRowProps) {
  const [isHovered, setIsHovered] = useState(false)

  const rawDate = item.isoDate || item.timestamp || ""
  const dateDisplay = formatGmailDate(typeof rawDate === "string" ? rawDate : "")

  return (
    <HStack
      gap={2}
      vAlign="center"
      width="100%"
      paddingInline={3}
      paddingBlock={1.5}
      minHeight={40}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => onOpen(item.id)}
      className={`cursor-pointer select-none transition-colors border-b border-border/40 ${
        isSelected
          ? "bg-primary-subtle/30"
          : isFocused
          ? "bg-neutral-subtle/50 ring-1 ring-inset ring-primary/40"
          : isHovered
          ? "bg-neutral-subtle/30 shadow-sm"
          : item.isUnread
          ? "bg-background font-semibold"
          : "bg-background/80"
      }`}
    >
      {/* 1. Selection Checkbox and Star */}
      <StackItem size="static">
        <HStack gap={1} vAlign="center" onClick={(e) => e.stopPropagation()}>
          <CheckboxInput
            label={`Select ${item.senderName}`}
            isLabelHidden
            size="sm"
            value={isSelected}
            onChange={() => onSelect(item.id)}
          />
          <IconButton
            label={item.isStarred ? "Starred" : "Not starred"}
            tooltip={item.isStarred ? "Starred" : "Star"}
            variant="ghost"
            size="sm"
            icon={
              <Star
                size={16}
                className={item.isStarred ? "fill-warning stroke-warning" : undefined}
              />
            }
            onClick={(e) => onToggleStar(item.id, e)}
          />
        </HStack>
      </StackItem>

      {/* 2. Sender Name with Hover Card */}
      <StackItem size="static">
        <HStack gap={1} vAlign="center" width={160} className="overflow-hidden">
          <HoverCard
            placement="below"
            alignment="start"
            label={`Contact details for ${item.senderName}`}
            content={
              <VStack gap={2} padding={3} width={260} onClick={(e) => e.stopPropagation()}>
                <HStack gap={2} vAlign="center">
                  <Avatar name={item.senderName} size={36} />
                  <VStack gap={0.5}>
                    <Text type="body" weight="semibold" size="sm" maxLines={1}>
                      {item.senderName}
                    </Text>
                    <Text type="supporting" color="secondary" size="xsm" maxLines={1}>
                      {item.senderEmail || item.senderName}
                    </Text>
                  </VStack>
                </HStack>
                {onQuickCompose && (
                  <HStack gap={1.5} hAlign="end">
                    <Button
                      label="Send email"
                      variant="primary"
                      size="sm"
                      onClick={() => onQuickCompose(item.senderEmail)}
                    />
                  </HStack>
                )}
              </VStack>
            }
          >
            <Text
              type="body"
              size="sm"
              weight={item.isUnread ? "semibold" : "normal"}
              maxLines={1}
              className="truncate cursor-pointer hover:underline"
            >
              {item.senderName}
            </Text>
          </HoverCard>

          {item.threadCount && item.threadCount > 1 ? (
            <Text type="supporting" size="xsm" color="secondary">
              ({item.threadCount})
            </Text>
          ) : null}
        </HStack>
      </StackItem>

      {/* 3. Subject and Snippet & Attachment Pills */}
      <StackItem size="fill">
        <HStack gap={1.5} vAlign="center" width="100%" className="overflow-hidden">
          {item.label && (
            <Token
              label={item.label}
              size="sm"
              color={
                item.label === "Clients"
                  ? "green"
                  : item.label === "Invoices"
                  ? "orange"
                  : item.label === "Personal"
                  ? "purple"
                  : "blue"
              }
            />
          )}

          <Text
            type="body"
            size="sm"
            weight={item.isUnread ? "semibold" : "normal"}
            maxLines={1}
            className="flex-shrink-0"
          >
            {item.subject || "(no subject)"}
          </Text>

          <Text type="supporting" size="sm" color="secondary" className="flex-shrink-0">
            –
          </Text>

          <Text
            type="body"
            size="sm"
            color="secondary"
            weight={item.isUnread ? "medium" : "normal"}
            maxLines={1}
            className="truncate flex-1"
          >
            {item.snippet}
          </Text>

          {/* Attachment Chips Preview */}
          {item.attachments && item.attachments.length > 0 && (
            <HStack
              gap={1}
              vAlign="center"
              className="flex-shrink-0 hidden md:flex"
              onClick={(e) => e.stopPropagation()}
            >
              {item.attachments.slice(0, 2).map((att) => (
                <AttachmentChip
                  key={att.id}
                  attachment={att}
                  readOnly
                />
              ))}
              {item.attachments.length > 2 && (
                <Token
                  label={`+${item.attachments.length - 2}`}
                  size="sm"
                  color="gray"
                />
              )}
            </HStack>
          )}
        </HStack>
      </StackItem>

      {/* 4. Right side: Timestamp OR Hover Quick Actions */}
      <StackItem size="static">
        <HStack gap={1} hAlign="end" vAlign="center" width={110} onClick={(e) => e.stopPropagation()}>
          {isHovered ? (
            <HStack gap={0.5} vAlign="center">
              <IconButton
                label="Archive"
                tooltip="Archive"
                variant="ghost"
                size="sm"
                icon={<Archive size={15} />}
                onClick={() => onArchive(item.id)}
              />
              <IconButton
                label="Delete"
                tooltip="Delete"
                variant="ghost"
                size="sm"
                icon={<Trash2 size={15} />}
                onClick={() => onDelete(item.id)}
              />
              <IconButton
                label={item.isUnread ? "Mark as read" : "Mark as unread"}
                tooltip={item.isUnread ? "Mark as read" : "Mark as unread"}
                variant="ghost"
                size="sm"
                icon={item.isUnread ? <MailOpen size={15} /> : <Mail size={15} />}
                onClick={() => onToggleRead(item.id)}
              />
              <DropdownMenu
                alignment="end"
                renderTrigger={(triggerProps) => (
                  <IconButton
                    label="Snooze"
                    tooltip="Snooze"
                    variant="ghost"
                    size="sm"
                    icon={<Clock size={15} />}
                    {...triggerProps}
                  />
                )}
                items={[
                  { label: "Later today", onClick: () => onSnooze(item.id, "Later today") },
                  { label: "Tomorrow", onClick: () => onSnooze(item.id, "Tomorrow") },
                  { label: "This weekend", onClick: () => onSnooze(item.id, "This weekend") },
                  { label: "Next week", onClick: () => onSnooze(item.id, "Next week") },
                ]}
              />
            </HStack>
          ) : (
            <Text
              type="supporting"
              size="xsm"
              color={item.isUnread ? "primary" : "secondary"}
              weight={item.isUnread ? "bold" : "normal"}
              textWrap="nowrap"
            >
              {dateDisplay}
            </Text>
          )}
        </HStack>
      </StackItem>
    </HStack>
  )
}
