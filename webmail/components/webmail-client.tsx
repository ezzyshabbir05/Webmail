"use client"

import React, { useState } from "react"
import { AppShell } from "@astryxdesign/core/AppShell"
import { TopNav, TopNavHeading } from "@astryxdesign/core/TopNav"
import { SideNav, SideNavSection, SideNavItem } from "@astryxdesign/core/SideNav"
import { Button } from "@astryxdesign/core/Button"
import { IconButton } from "@astryxdesign/core/IconButton"
import { TextInput } from "@astryxdesign/core/TextInput"
import { DropdownMenu } from "@astryxdesign/core/DropdownMenu"
import { Avatar } from "@astryxdesign/core/Avatar"
import { Badge } from "@astryxdesign/core/Badge"
import { ProgressBar } from "@astryxdesign/core/ProgressBar"
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog"
import { Layout, LayoutContent, LayoutFooter, VStack, HStack } from "@astryxdesign/core/Layout"
import { Text } from "@astryxdesign/core/Text"
import {
  Inbox,
  Star,
  Clock,
  Send,
  FileText,
  Archive,
  AlertCircle,
  Trash2,
  Folder,
  Plus,
  Search,
  Keyboard,
  Calendar,
  Users,
  Filter,
  Settings,
  LogOut,
  SquarePen,
} from "lucide-react"

import { useThemeMode } from "@/components/theme-provider"
import { ThemeToggle } from "@/components/theme-toggle"
import { useMail } from "@/context/mail-context"
import { MailListView } from "./mail/mail-list-view"
import { ThreadViewer } from "./mail/thread-viewer"
import { ComposeDock } from "./mail/compose-dock"
import { ShortcutsDialog } from "./mail/shortcuts-dialog"

export function WebmailClient() {
  const { mode } = useThemeMode()
  const {
    activeEmailId,
    activeEmail,
    activeFolder,
    searchQuery,
    unreadCounts,
    customFolders,
    createCustomFolder,
    activeIdentity,
    quotaInfo,
    closeEmail,
    archiveSelected,
    deleteSelected,
    reportSpam,
    markSelectedAsUnread,
    snoozeEmails,
    moveEmailsToFolder,
    applyThreadLabel,
    toggleStar,
    openCompose,
    setActiveFolder,
    setSearchQuery,
    allowedRemoteImages,
    logout,
  } = useMail()

  // Dialog states
  const [isFolderDialogOpen, setIsFolderDialogOpen] = useState(false)
  const [newFolderName, setNewFolderName] = useState("")
  const [isShortcutsDialogOpen, setIsShortcutsDialogOpen] = useState(false)

  // Storage quota calculations (Audit #22)
  const formatStorage = (bytes: number) => {
    const gb = bytes / (1024 * 1024 * 1024)
    if (gb >= 1) return `${gb.toFixed(1)} GB`
    const mb = bytes / (1024 * 1024)
    return `${mb.toFixed(0)} MB`
  }
  const storageUsedStr = formatStorage(quotaInfo.usedBytes)
  const storageTotalStr = formatStorage(quotaInfo.totalBytes)

  // Handle custom folder creation
  const handleCreateFolder = () => {
    if (!newFolderName.trim()) return
    createCustomFolder(newFolderName.trim())
    setNewFolderName("")
    setIsFolderDialogOpen(false)
  }

  return (
    <AppShell
      variant="elevated"
      contentPadding={0}
      height="fill"
      topNav={
        <TopNav
          label="Webmail navigation"
          heading={
            <TopNavHeading
              heading="Postarc Webmail"
              headingHref="/mail"
            />
          }
          centerContent={
            <TextInput
              label="Search mail"
              isLabelHidden
              type="search"
              placeholder="Search mail (from, to, subject, keywords)..."
              value={searchQuery}
              onChange={(val) => setSearchQuery(val)}
              startIcon={<Search size={16} />}
              hasClear
              width={480}
              size="md"
            />
          }
          endContent={
            <HStack gap={2} vAlign="center">
              <IconButton
                label="Keyboard shortcuts"
                tooltip="Keyboard shortcuts (?)"
                variant="ghost"
                size="sm"
                icon={<Keyboard size={17} />}
                onClick={() => setIsShortcutsDialogOpen(true)}
              />
              <ThemeToggle />
              <DropdownMenu
                alignment="end"
                header={
                  <VStack gap={0.5} padding={2} width="100%">
                    <Text type="body" size="sm" weight="semibold">
                      {activeIdentity.name}
                    </Text>
                    <Text type="supporting" size="xsm" color="secondary">
                      {activeIdentity.email}
                    </Text>
                  </VStack>
                }
                renderTrigger={(triggerProps) => (
                  <Avatar
                    name={activeIdentity.name}
                    size={32}
                    tooltip={`${activeIdentity.name} (${activeIdentity.email})`}
                    {...triggerProps}
                  />
                )}
                items={[
                  {
                    label: "Calendar",
                    href: "/mail/calendar",
                    icon: <Calendar size={16} />,
                  },
                  {
                    label: "Contacts",
                    href: "/mail/contacts",
                    icon: <Users size={16} />,
                  },
                  {
                    label: "Sieve Mail Rules",
                    href: "/mail/filters",
                    icon: <Filter size={16} />,
                  },
                  { type: "divider" as const },
                  {
                    label: "Mailbox Settings",
                    href: "/mail/settings",
                    icon: <Settings size={16} />,
                  },
                  { type: "divider" as const },
                  {
                    label: "Sign out",
                    variant: "destructive",
                    icon: <LogOut size={16} />,
                    onClick: () => {
                      logout()
                    },
                  },
                ]}
              />
            </HStack>
          }
        />
      }
      sideNav={
        <SideNav
          aria-label="Mailbox folders"
          resizable={{
            defaultWidth: 230,
            minWidth: 180,
            maxWidth: 380,
          }}
          topContent={
            <VStack width="100%" padding={1}>
              <Button
                label="Compose"
                variant="primary"
                size="md"
                icon={<SquarePen size={16} />}
                width="100%"
                onClick={() => openCompose()}
              />
            </VStack>
          }
          footer={
            <VStack gap={1} width="100%" padding={2}>
              <HStack hAlign="between" vAlign="center">
                <Text type="supporting" color="secondary" size="xsm">
                  Storage
                </Text>
                <Text type="supporting" color="secondary" size="xsm" weight="medium">
                  {storageUsedStr} / {storageTotalStr} ({quotaInfo.percent}%)
                </Text>
              </HStack>
              <ProgressBar
                label="Storage quota"
                isLabelHidden
                value={quotaInfo.percent}
                max={100}
                variant={quotaInfo.percent >= 80 ? "error" : "accent"}
              />
            </VStack>
          }
        >
          {/* Main Mailbox Folders */}
          <SideNavSection title="Mail" isHeaderHidden>
            <SideNavItem
              label="Inbox"
              icon={<Inbox size={18} />}
              isSelected={activeFolder === "inbox"}
              onClick={() => {
                setActiveFolder("inbox")
                closeEmail()
              }}
              endContent={
                unreadCounts.inbox > 0 ? (
                  <Badge label={String(unreadCounts.inbox)} variant="neutral" />
                ) : undefined
              }
            />
            <SideNavItem
              label="Starred"
              icon={<Star size={18} />}
              isSelected={activeFolder === "starred"}
              onClick={() => {
                setActiveFolder("starred")
                closeEmail()
              }}
              endContent={
                unreadCounts.starred > 0 ? (
                  <Badge label={String(unreadCounts.starred)} variant="neutral" />
                ) : undefined
              }
            />
            <SideNavItem
              label="Snoozed"
              icon={<Clock size={18} />}
              isSelected={activeFolder === "snoozed"}
              onClick={() => {
                setActiveFolder("snoozed")
                closeEmail()
              }}
            />
            <SideNavItem
              label="Sent"
              icon={<Send size={18} />}
              isSelected={activeFolder === "sent"}
              onClick={() => {
                setActiveFolder("sent")
                closeEmail()
              }}
            />
            <SideNavItem
              label="Drafts"
              icon={<FileText size={18} />}
              isSelected={activeFolder === "drafts"}
              onClick={() => {
                setActiveFolder("drafts")
                closeEmail()
              }}
              endContent={
                unreadCounts.drafts > 0 ? (
                  <Badge label={String(unreadCounts.drafts)} variant="neutral" />
                ) : undefined
              }
            />
            <SideNavItem
              label="Archive"
              icon={<Archive size={18} />}
              isSelected={activeFolder === "archive"}
              onClick={() => {
                setActiveFolder("archive")
                closeEmail()
              }}
            />
            <SideNavItem
              label="Spam"
              icon={<AlertCircle size={18} />}
              isSelected={activeFolder === "spam"}
              onClick={() => {
                setActiveFolder("spam")
                closeEmail()
              }}
              endContent={
                unreadCounts.spam > 0 ? (
                  <Badge label={String(unreadCounts.spam)} variant="neutral" />
                ) : undefined
              }
            />
            <SideNavItem
              label="Trash"
              icon={<Trash2 size={18} />}
              isSelected={activeFolder === "trash"}
              onClick={() => {
                setActiveFolder("trash")
                closeEmail()
              }}
            />
          </SideNavSection>

          {/* Custom Folders Section */}
          <SideNavSection title="Folders">
            {customFolders.map((folder) => (
              <SideNavItem
                key={folder.id}
                label={folder.name}
                icon={<Folder size={18} color={folder.color || "currentColor"} />}
                isSelected={activeFolder === folder.id}
                onClick={() => {
                  setActiveFolder(folder.id)
                  closeEmail()
                }}
                endContent={
                  folder.unreadCount > 0 ? (
                    <Badge label={String(folder.unreadCount)} variant="neutral" />
                  ) : undefined
                }
              />
            ))}
            <SideNavItem
              label="New Folder"
              icon={<Plus size={18} />}
              onClick={() => setIsFolderDialogOpen(true)}
            />
          </SideNavSection>
        </SideNav>
      }
    >
      {/* Main Mail Area: Thread Viewer or Mail List View */}
      {activeEmailId && activeEmail ? (
        <ThreadViewer
          email={activeEmail}
          customFolders={customFolders}
          isDarkMode={mode === "dark"}
          allowedRemoteImages={allowedRemoteImages}
          onBack={closeEmail}
          onArchive={() => archiveSelected([activeEmail.id])}
          onReportSpam={() => reportSpam([activeEmail.id])}
          onDelete={() => deleteSelected([activeEmail.id])}
          onMarkUnread={() => markSelectedAsUnread()}
          onSnooze={(untilText) => snoozeEmails([activeEmail.id], untilText)}
          onMoveToFolder={(folderId) => moveEmailsToFolder([activeEmail.id], folderId as any)}
          onApplyLabel={(label) => applyThreadLabel([activeEmail.id], label)}
          onToggleStar={() => toggleStar(activeEmail.id)}
        />
      ) : (
        <MailListView onOpenShortcuts={() => setIsShortcutsDialogOpen(true)} />
      )}

      {/* Floating Gmail-Style Docked Composer (Audit #11 & #12) */}
      <ComposeDock />

      {/* Dialog: Create New Folder */}
      <Dialog
        isOpen={isFolderDialogOpen}
        onOpenChange={setIsFolderDialogOpen}
        width={420}
        aria-label="Create New Folder"
      >
        <Layout
          header={
            <DialogHeader
              title="Create New Folder"
              subtitle="Organize your messages with a dedicated mailbox folder"
              onOpenChange={setIsFolderDialogOpen}
            />
          }
          content={
            <LayoutContent padding={4}>
              <VStack gap={3} width="100%">
                <TextInput
                  label="Folder Name"
                  placeholder="e.g. Invoices, Projects, Travel"
                  value={newFolderName}
                  onChange={(val) => setNewFolderName(val)}
                  hasAutoFocus
                />
              </VStack>
            </LayoutContent>
          }
          footer={
            <LayoutFooter padding={3}>
              <HStack gap={2} hAlign="end" width="100%">
                <Button
                  label="Cancel"
                  variant="ghost"
                  onClick={() => setIsFolderDialogOpen(false)}
                />
                <Button
                  label="Create"
                  variant="primary"
                  isDisabled={!newFolderName.trim()}
                  onClick={handleCreateFolder}
                />
              </HStack>
            </LayoutFooter>
          }
        />
      </Dialog>

      {/* Dialog: Keyboard Shortcuts Guide */}
      <ShortcutsDialog
        isOpen={isShortcutsDialogOpen}
        onOpenChange={setIsShortcutsDialogOpen}
      />
    </AppShell>
  )
}
