"use client"

import React, { useState } from "react"
import { Toolbar } from "@astryxdesign/core/Toolbar"
import { HStack } from "@astryxdesign/core/Layout"
import { IconButton } from "@astryxdesign/core/IconButton"
import { Button } from "@astryxdesign/core/Button"
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput"
import { DropdownMenu } from "@astryxdesign/core/DropdownMenu"
import { Text } from "@astryxdesign/core/Text"
import {
  ChevronDown,
  RotateCw,
  Archive,
  AlertCircle,
  Trash2,
  Mail,
  MailOpen,
  Clock,
  FolderInput,
  Tag,
  ChevronLeft,
  ChevronRight,
  MoreVertical,
} from "lucide-react"
import type { CustomMailboxFolder, EmailFolder } from "@/types/webmail"

interface MailToolbarProps {
  selectedCount: number
  totalCount: number
  isAllSelected: boolean
  activeFolder: EmailFolder
  pageStart: number
  pageEnd: number
  totalFiltered: number
  pageIndex: number
  totalPages: number
  customFolders: CustomMailboxFolder[]
  onSelectAll: (mode: "all" | "none" | "read" | "unread" | "starred") => void
  onRefresh: () => void
  onArchive: () => void
  onReportSpam: () => void
  onDelete: () => void
  onMarkRead: () => void
  onMarkUnread: () => void
  onSnooze: (untilText: string) => void
  onMoveToFolder: (folderId: string) => void
  onApplyLabel: (label: string) => void
  onEmptyTrash?: () => void
  onMarkAllAsRead?: () => void
  onPrevPage: () => void
  onNextPage: () => void
}

export function MailToolbar({
  selectedCount,
  totalCount,
  isAllSelected,
  activeFolder,
  pageStart,
  pageEnd,
  totalFiltered,
  pageIndex,
  totalPages,
  customFolders,
  onSelectAll,
  onRefresh,
  onArchive,
  onReportSpam,
  onDelete,
  onMarkRead,
  onMarkUnread,
  onSnooze,
  onMoveToFolder,
  onApplyLabel,
  onEmptyTrash,
  onMarkAllAsRead,
  onPrevPage,
  onNextPage,
}: MailToolbarProps) {
  const [isRefreshing, setIsRefreshing] = useState(false)
  const hasSelection = selectedCount > 0

  const handleRefreshClick = () => {
    setIsRefreshing(true)
    onRefresh()
    setTimeout(() => setIsRefreshing(false), 600)
  }

  return (
    <Toolbar
      label="Mailbox actions"
      variant="transparent"
      size="sm"
      startContent={
        <HStack gap={1} vAlign="center">
          {/* Selection Checkbox & Dropdown */}
          <HStack gap={0} vAlign="center">
            <CheckboxInput
              label="Select all conversations"
              isLabelHidden
              size="sm"
              value={isAllSelected}
              onChange={() => onSelectAll(isAllSelected ? "none" : "all")}
            />
            <DropdownMenu
              alignment="start"
              renderTrigger={(triggerProps) => (
                <IconButton
                  label="Select options"
                  tooltip="Select options"
                  variant="ghost"
                  size="sm"
                  icon={<ChevronDown size={14} />}
                  {...triggerProps}
                />
              )}
              items={[
                { label: "All", onClick: () => onSelectAll("all") },
                { label: "None", onClick: () => onSelectAll("none") },
                { label: "Read", onClick: () => onSelectAll("read") },
                { label: "Unread", onClick: () => onSelectAll("unread") },
                { label: "Starred", onClick: () => onSelectAll("starred") },
              ]}
            />
          </HStack>

          {hasSelection ? (
            <>
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
                label="Mark as read"
                tooltip="Mark as read (Shift+I)"
                variant="ghost"
                size="sm"
                icon={<MailOpen size={16} />}
                onClick={onMarkRead}
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

              {/* Move to folder */}
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
            </>
          ) : (
            <>
              <IconButton
                label="Refresh mailbox"
                tooltip="Refresh (u)"
                variant="ghost"
                size="sm"
                icon={
                  <RotateCw
                    size={16}
                    className={isRefreshing ? "animate-spin" : undefined}
                  />
                }
                onClick={handleRefreshClick}
              />

              {activeFolder === "trash" && onEmptyTrash && totalCount > 0 && (
                <Button
                  label="Empty Trash now"
                  variant="destructive"
                  size="sm"
                  onClick={onEmptyTrash}
                />
              )}

              {onMarkAllAsRead && totalCount > 0 && (
                <DropdownMenu
                  alignment="start"
                  renderTrigger={(props) => (
                    <IconButton
                      label="More mailbox actions"
                      tooltip="More actions"
                      variant="ghost"
                      size="sm"
                      icon={<MoreVertical size={16} />}
                      {...props}
                    />
                  )}
                  items={[
                    { label: "Mark all as read", onClick: onMarkAllAsRead },
                  ]}
                />
              )}
            </>
          )}
        </HStack>
      }
      endContent={
        <HStack gap={2} vAlign="center">
          {totalFiltered > 0 && (
            <Text type="supporting" size="sm" color="secondary">
              {pageStart}–{pageEnd} of {totalFiltered}
            </Text>
          )}
          <HStack gap={0.5} vAlign="center">
            <IconButton
              label="Older"
              tooltip="Older"
              variant="ghost"
              size="sm"
              icon={<ChevronLeft size={16} />}
              isDisabled={pageIndex === 0}
              onClick={onPrevPage}
            />
            <IconButton
              label="Newer"
              tooltip="Newer"
              variant="ghost"
              size="sm"
              icon={<ChevronRight size={16} />}
              isDisabled={pageIndex >= totalPages - 1}
              onClick={onNextPage}
            />
          </HStack>
        </HStack>
      }
    />
  )
}
