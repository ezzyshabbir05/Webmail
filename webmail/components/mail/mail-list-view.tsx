"use client"

import React, { useState, useEffect, useMemo, useCallback } from "react"
import { Layout, LayoutHeader, LayoutContent, VStack } from "@astryxdesign/core/Layout"
import { Center } from "@astryxdesign/core/Center"
import { EmptyState } from "@astryxdesign/core/EmptyState"
import { Button } from "@astryxdesign/core/Button"
import { Inbox, SquarePen, Search, AlertCircle, Trash2, Star } from "lucide-react"
import { MailToolbar } from "./mail-toolbar"
import { MailCategoryTabs } from "./mail-category-tabs"
import { MailThreadRow } from "./mail-thread-row"
import { useMail } from "@/context/mail-context"
import type { EmailThread } from "@/types/webmail"

const PAGE_SIZE = 50

interface MailListViewProps {
  onOpenShortcuts?: () => void
}

export function MailListView({ onOpenShortcuts }: MailListViewProps) {
  const {
    emails,
    activeFolder,
    activeCategory,
    selectedIds,
    searchQuery,
    unreadCounts,
    customFolders,
    openEmail,
    toggleStar,
    toggleSelect,
    selectAll,
    archiveSelected,
    deleteSelected,
    reportSpam,
    markSelectedAsRead,
    markSelectedAsUnread,
    toggleEmailRead,
    snoozeEmails,
    moveEmailsToFolder,
    applyThreadLabel,
    emptyTrash,
    markAllAsRead,
    refreshMailbox,
    openCompose,
    setActiveCategory,
    setSearchQuery,
  } = useMail()

  // Pagination state
  const [pageIndex, setPageIndex] = useState(0)
  const [focusedIndex, setFocusedIndex] = useState(0)

  // Reset page when filter changes
  useEffect(() => {
    setPageIndex(0)
    setFocusedIndex(0)
  }, [activeFolder, activeCategory, searchQuery])

  // Filter emails based on folder, category, and search query
  const filteredEmails = useMemo(() => {
    return emails.filter((email) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        return (
          email.subject.toLowerCase().includes(q) ||
          email.senderName.toLowerCase().includes(q) ||
          email.senderEmail.toLowerCase().includes(q) ||
          email.snippet.toLowerCase().includes(q)
        )
      }

      if (activeFolder === "starred") {
        return email.isStarred
      }

      if (activeFolder === "inbox") {
        return (
          email.folder === "inbox" &&
          (activeCategory === "primary"
            ? !email.category || email.category === "primary"
            : email.category === activeCategory)
        )
      }

      return email.folder === activeFolder
    })
  }, [emails, activeFolder, activeCategory, searchQuery])

  const totalFiltered = filteredEmails.length
  const totalPages = Math.ceil(totalFiltered / PAGE_SIZE) || 1
  const pageStart = totalFiltered === 0 ? 0 : pageIndex * PAGE_SIZE + 1
  const pageEnd = Math.min((pageIndex + 1) * PAGE_SIZE, totalFiltered)

  const paginatedEmails = useMemo(() => {
    return filteredEmails.slice(pageIndex * PAGE_SIZE, (pageIndex + 1) * PAGE_SIZE)
  }, [filteredEmails, pageIndex])

  const isAllSelected =
    paginatedEmails.length > 0 && paginatedEmails.every((e) => selectedIds.has(e.id))

  // Keyboard navigation shortcuts
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const activeEl = document.activeElement
      const isTyping =
        activeEl?.tagName === "INPUT" ||
        activeEl?.tagName === "TEXTAREA" ||
        (activeEl as HTMLElement)?.isContentEditable

      if (isTyping) {
        return
      }

      // Single-key shortcuts
      switch (e.key) {
        case "j":
        case "ArrowDown": {
          e.preventDefault()
          setFocusedIndex((prev) => Math.min(prev + 1, paginatedEmails.length - 1))
          break
        }
        case "k":
        case "ArrowUp": {
          e.preventDefault()
          setFocusedIndex((prev) => Math.max(prev - 1, 0))
          break
        }
        case "x": {
          e.preventDefault()
          const current = paginatedEmails[focusedIndex]
          if (current) {
            toggleSelect(current.id)
          }
          break
        }
        case "Enter":
        case "o": {
          e.preventDefault()
          const current = paginatedEmails[focusedIndex]
          if (current) {
            openEmail(current.id)
          }
          break
        }
        case "e": {
          e.preventDefault()
          if (selectedIds.size > 0) {
            archiveSelected()
          } else {
            const current = paginatedEmails[focusedIndex]
            if (current) {
              archiveSelected([current.id])
            }
          }
          break
        }
        case "#": {
          e.preventDefault()
          if (selectedIds.size > 0) {
            deleteSelected()
          } else {
            const current = paginatedEmails[focusedIndex]
            if (current) {
              deleteSelected([current.id])
            }
          }
          break
        }
        case "s": {
          e.preventDefault()
          const current = paginatedEmails[focusedIndex]
          if (current) {
            toggleStar(current.id)
          }
          break
        }
        case "c": {
          e.preventDefault()
          openCompose()
          break
        }
        case "/": {
          e.preventDefault()
          const searchInput = document.querySelector<HTMLInputElement>('input[type="search"]')
          if (searchInput) {
            searchInput.focus()
            searchInput.select()
          }
          break
        }
        case "?": {
          e.preventDefault()
          onOpenShortcuts?.()
          break
        }
        default:
          break
      }
    },
    [
      paginatedEmails,
      focusedIndex,
      selectedIds,
      toggleSelect,
      openEmail,
      archiveSelected,
      deleteSelected,
      toggleStar,
      openCompose,
      onOpenShortcuts,
    ]
  )

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [handleKeyDown])

  const handlePrevPage = () => {
    setPageIndex((prev) => Math.max(prev - 1, 0))
  }

  const handleNextPage = () => {
    setPageIndex((prev) => Math.min(prev + 1, totalPages - 1))
  }

  const handleArchiveSingle = (id: string) => {
    archiveSelected([id])
  }

  const handleDeleteSingle = (id: string) => {
    deleteSelected([id])
  }

  const handleSnoozeSingle = (id: string, untilText: string) => {
    snoozeEmails([id], untilText)
  }

  const handleQuickCompose = (to: string) => {
    openCompose({ to })
  }

  const showCategoryTabs = activeFolder === "inbox" && !searchQuery.trim()

  const getEmptyStateProps = () => {
    if (searchQuery.trim()) {
      return {
        icon: <Search size={40} className="text-secondary" />,
        title: "No matching messages",
        description: `No messages match your search "${searchQuery}".`,
        actions: (
          <Button
            label="Clear Search"
            variant="secondary"
            size="md"
            onClick={() => setSearchQuery("")}
          />
        ),
      }
    }

    if (activeFolder === "inbox") {
      const categoryNames: Record<string, string> = {
        primary: "Primary",
        promotions: "Promotions",
        social: "Social",
        updates: "Updates",
      }
      const catLabel = categoryNames[activeCategory] || "Primary"
      return {
        icon: <Inbox size={40} className="text-secondary" />,
        title: `Your ${catLabel} tab is empty`,
        description: `No messages in ${catLabel}. When new emails arrive, they'll show up here.`,
        actions: (
          <Button
            label="Compose Email"
            variant="primary"
            size="md"
            icon={<SquarePen size={16} />}
            onClick={() => openCompose()}
          />
        ),
      }
    }

    if (activeFolder === "starred") {
      return {
        icon: <Star size={40} className="text-secondary" />,
        title: "No starred messages",
        description: "Stars let you give messages a special status to make them easy to find.",
        actions: undefined,
      }
    }

    if (activeFolder === "trash") {
      return {
        icon: <Trash2 size={40} className="text-secondary" />,
        title: "Trash is empty",
        description: "Messages that have been in Trash more than 30 days are automatically deleted.",
        actions: undefined,
      }
    }

    if (activeFolder === "spam") {
      return {
        icon: <AlertCircle size={40} className="text-secondary" />,
        title: "Hooray, no spam here!",
        description: "Messages that have been in Spam more than 30 days are automatically deleted.",
        actions: undefined,
      }
    }

    return {
      icon: <Inbox size={40} className="text-secondary" />,
      title: `No messages in ${activeFolder}`,
      description: "This folder contains no messages.",
      actions: (
        <Button
          label="Compose Email"
          variant="primary"
          size="md"
          icon={<SquarePen size={16} />}
          onClick={() => openCompose()}
        />
      ),
    }
  }

  const emptyProps = getEmptyStateProps()

  return (
    <Layout
      height="fill"
      padding={0}
      header={
        <LayoutHeader padding={0} hasDivider={!showCategoryTabs} label="Mailbox controls">
          <VStack gap={0} width="100%">
            <MailToolbar
              selectedCount={selectedIds.size}
              totalCount={filteredEmails.length}
              isAllSelected={isAllSelected}
              activeFolder={activeFolder}
              pageStart={pageStart}
              pageEnd={pageEnd}
              totalFiltered={totalFiltered}
              pageIndex={pageIndex}
              totalPages={totalPages}
              customFolders={customFolders}
              onSelectAll={selectAll}
              onRefresh={refreshMailbox}
              onArchive={() => archiveSelected()}
              onReportSpam={() => reportSpam()}
              onDelete={() => deleteSelected()}
              onMarkRead={markSelectedAsRead}
              onMarkUnread={markSelectedAsUnread}
              onSnooze={(until) => snoozeEmails(Array.from(selectedIds), until)}
              onMoveToFolder={(folderId) =>
                moveEmailsToFolder(Array.from(selectedIds), folderId as any)
              }
              onApplyLabel={(label) => applyThreadLabel(Array.from(selectedIds), label)}
              onEmptyTrash={emptyTrash}
              onMarkAllAsRead={() => markAllAsRead()}
              onPrevPage={handlePrevPage}
              onNextPage={handleNextPage}
            />

            {showCategoryTabs && (
              <MailCategoryTabs
                activeCategory={activeCategory}
                onCategoryChange={setActiveCategory}
                unreadCounts={{
                  primary: unreadCounts.primary,
                  promotions: unreadCounts.promotions,
                  social: unreadCounts.social,
                  updates: unreadCounts.updates,
                }}
              />
            )}
          </VStack>
        </LayoutHeader>
      }
      content={
        <LayoutContent padding={0} isScrollable label="Message list">
          {paginatedEmails.length > 0 ? (
            <VStack gap={0} width="100%">
              {paginatedEmails.map((item, index) => (
                <MailThreadRow
                  key={item.id}
                  item={item}
                  isSelected={selectedIds.has(item.id)}
                  isFocused={focusedIndex === index}
                  activeFolder={activeFolder}
                  searchQuery={searchQuery}
                  onSelect={toggleSelect}
                  onToggleStar={toggleStar}
                  onOpen={openEmail}
                  onArchive={handleArchiveSingle}
                  onDelete={handleDeleteSingle}
                  onToggleRead={toggleEmailRead}
                  onSnooze={handleSnoozeSingle}
                  onQuickCompose={handleQuickCompose}
                />
              ))}
            </VStack>
          ) : (
            <Center minHeight={400} width="100%">
              <EmptyState
                icon={emptyProps.icon}
                title={emptyProps.title}
                description={emptyProps.description}
                actions={emptyProps.actions}
              />
            </Center>
          )}
        </LayoutContent>
      }
    />
  )
}
