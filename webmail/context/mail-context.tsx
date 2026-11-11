"use client"

import React, { createContext, useContext, useState, useMemo, useEffect, useCallback } from "react"
import { useToast } from "@astryxdesign/core/Toast"
import { Button } from "@astryxdesign/core/Button"
import { PostarcAuth } from "@/components/postarc-auth"
import { postarcClient } from "@/lib/jmap/client"
import type { JmapEmail, JmapMailbox } from "@/lib/jmap/types"
import type {
  EmailThread,
  ThreadMessage,
  EmailCategory,
  EmailFolder,
  EmailAttachment,
  CustomMailboxFolder,
  MailIdentity,
  CannedResponse,
  MailContact,
  QuotaInfo,
} from "@/types/webmail"

interface MailContextType {
  emails: EmailThread[]
  activeEmailId: string | null
  activeEmail: EmailThread | null
  activeCategory: EmailCategory
  activeFolder: EmailFolder
  selectedIds: Set<string>
  isComposeOpen: boolean
  searchQuery: string
  unreadCounts: {
    primary: number
    promotions: number
    social: number
    updates: number
    inbox: number
    starred: number
    drafts: number
    spam: number
    trash: number
  }
  // Folder management
  customFolders: CustomMailboxFolder[]
  createCustomFolder: (name: string, color?: string) => void
  deleteCustomFolder: (id: string) => void
  moveEmailsToFolder: (ids: string[], targetFolder: EmailFolder) => void
  // Undo support
  undoLastAction: () => void
  // Identities
  identities: MailIdentity[]
  activeIdentity: MailIdentity
  setActiveIdentity: (identity: MailIdentity) => void
  // Templates / Canned Responses
  cannedResponses: CannedResponse[]
  addCannedResponse: (title: string, body: string, subject?: string) => void
  deleteCannedResponse: (id: string) => void
  // Contacts
  contacts: MailContact[]
  // Privacy & Remote Images
  allowedRemoteImages: Set<string>
  allowRemoteImagesForEmail: (emailId: string) => void
  // Quota
  quotaInfo: QuotaInfo
  // Standard Actions
  openEmail: (id: string) => void
  closeEmail: () => void
  toggleStar: (id: string, e?: React.MouseEvent) => void
  toggleSelect: (id: string) => void
  selectAll: (mode?: "all" | "none" | "read" | "unread" | "starred") => void
  archiveSelected: (overrideIds?: string[]) => void
  deleteSelected: (overrideIds?: string[]) => void
  reportSpam: (overrideIds?: string[]) => void
  markSelectedAsRead: () => void
  markSelectedAsUnread: () => void
  toggleEmailRead: (id: string) => void
  snoozeEmails: (ids: string[], untilText: string) => void
  replyToEmail: (
    threadId: string,
    replyText: string,
    options?: {
      mode?: "reply" | "reply_all" | "forward"
      to?: string
      cc?: string[]
      attachments?: EmailAttachment[]
    }
  ) => void
  removeThreadLabel: (threadId: string) => void
  applyThreadLabel: (threadIds: string[], label: string, color?: string) => void
  importEmlMessage: (data: {
    subject: string
    senderName: string
    senderEmail: string
    body: string
    htmlBody?: string
    date?: string
    attachments?: EmailAttachment[]
  }) => void
  emptyTrash: () => void
  markAllAsRead: (targetFolder?: EmailFolder) => void
  addIdentity: (ident: Omit<MailIdentity, "id">) => void
  deleteIdentity: (id: string) => void
  vacationSettings: { isEnabled: boolean; subject: string; body: string }
  saveVacationSettings: (settings: { isEnabled: boolean; subject: string; body: string }) => void
  composeInitialData: { to?: string; subject?: string; body?: string } | null
  openCompose: (options?: { to?: string; subject?: string; body?: string }) => void
  closeCompose: () => void
  clearComposeInitialData: () => void
  refreshMailbox: () => Promise<void>
  sendEmail: (
    to: string,
    subject: string,
    body: string,
    attachments?: EmailAttachment[],
    identityId?: string
  ) => Promise<void>
  saveDraft: (to: string, subject: string, body: string, attachments?: EmailAttachment[]) => void
  setActiveCategory: (category: EmailCategory) => void
  setActiveFolder: (folder: EmailFolder) => void
  setSearchQuery: (query: string) => void
  logout: () => Promise<void>
  isAuthenticated: boolean
}

const MailContext = createContext<MailContextType | null>(null)

function mapJmapEmailToThread(
  email: JmapEmail,
  roleMap?: Record<string, string>
): EmailThread {
  const isUnread = !email.keywords?.["$seen"]
  const isStarred = Boolean(email.keywords?.["$flagged"])
  const sender = email.from?.[0] || { name: "Unknown", email: "unknown@postarc.local" }
  const recipient = email.to?.[0]?.email || "me@postarc.local"

  const fullDate = email.receivedAt ? new Date(email.receivedAt).toLocaleString() : "Recently"
  const timestamp = email.receivedAt
    ? new Date(email.receivedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "Now"

  // Determine folder from mailboxIds or mapped mailbox roles
  let folder: EmailFolder = "inbox"
  for (const [mbId] of Object.entries(email.mailboxIds || {})) {
    const role = (roleMap?.[mbId] || mbId).toLowerCase()
    if (role === "trash") {
      folder = "trash"
      break
    } else if (role === "spam" || role === "junk") {
      folder = "spam"
      break
    } else if (role === "sent") {
      folder = "sent"
      break
    } else if (role === "drafts" || role === "draft") {
      folder = "drafts"
      break
    } else if (role === "archive") {
      folder = "archive"
      break
    }
  }

  const textBodyVal = Object.values(email.bodyValues || {})[0]?.value || email.preview || ""
  const htmlBodyVal = Object.values(email.bodyValues || {}).find((b) => b.value.includes("<"))?.value

  const attachments: EmailAttachment[] = (email.attachments || []).map((att) => ({
    id: att.partId || att.blobId || Math.random().toString(),
    name: att.name || "attachment",
    size: `${Math.round((att.size || 0) / 1024)} KB`,
    type: att.type?.includes("image") ? "image" : att.type?.includes("pdf") ? "pdf" : "document",
    downloadUrl: `#`,
  }))

  return {
    id: email.id,
    senderName: sender.name || sender.email.split("@")[0],
    senderEmail: sender.email,
    recipientEmail: recipient,
    subject: email.subject || "(No Subject)",
    snippet: email.preview || textBodyVal.slice(0, 80),
    body: textBodyVal,
    htmlBody: htmlBodyVal,
    timestamp,
    fullDate,
    isoDate: email.receivedAt,
    category: "primary",
    folder,
    isUnread,
    isStarred,
    threadCount: 1,
    attachments: attachments.length > 0 ? attachments : undefined,
    messages: [
      {
        id: `msg_${email.id}`,
        senderName: sender.name || sender.email.split("@")[0],
        senderEmail: sender.email,
        recipientEmail: recipient,
        body: textBodyVal,
        htmlBody: htmlBodyVal,
        timestamp,
        fullDate,
        isoDate: email.receivedAt,
        attachments: attachments.length > 0 ? attachments : undefined,
        spfStatus: "pass",
        dkimStatus: "pass",
        dmarcStatus: "pass",
      },
    ],
  }
}

export function MailProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)
  const [emails, setEmails] = useState<EmailThread[]>([])
  const [activeEmailId, setActiveEmailId] = useState<string | null>(null)
  const [activeCategory, setActiveCategory] = useState<EmailCategory>("primary")
  const [activeFolder, setActiveFolder] = useState<EmailFolder>("inbox")
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isComposeOpen, setIsComposeOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")

  const getInitialIdentity = (): MailIdentity => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("postarc_user")
        if (stored) {
          const data = JSON.parse(stored)
          if (data.email) {
            return {
              id: data.accountId || data.email,
              name: data.username || data.email.split("@")[0] || "User",
              email: data.email,
              isDefault: true,
            }
          }
        }
      } catch {
        // ignore
      }
    }
    return {
      id: "id_default",
      name: "User",
      email: "",
      isDefault: true,
    }
  }

  const [identities, setIdentities] = useState<MailIdentity[]>([getInitialIdentity()])
  const [activeIdentity, setActiveIdentity] = useState<MailIdentity>(getInitialIdentity())

  const [vacationSettings, setVacationSettings] = useState({
    isEnabled: false,
    subject: "Out of Office Auto-reply",
    body: "I am currently away with limited access to email. I will respond to your message upon my return.",
  })

  const [composeInitialData, setComposeInitialData] = useState<{
    to?: string
    subject?: string
    body?: string
  } | null>(null)

  const [cannedResponses, setCannedResponses] = useState<CannedResponse[]>([])
  const [contacts, setContacts] = useState<MailContact[]>([])
  const [customFolders, setCustomFolders] = useState<CustomMailboxFolder[]>([])
  const [allowedRemoteImages, setAllowedRemoteImages] = useState<Set<string>>(new Set())

  const [quotaInfo, setQuotaInfo] = useState<QuotaInfo>({
    usedBytes: 1024 * 1024 * 250,
    totalBytes: 1024 * 1024 * 1024 * 10,
    percent: 2.5,
  })

  const toast = useToast()

  // 1. Check Authentication on Mount
  const checkAuth = useCallback(async () => {
    try {
      if (typeof window !== "undefined") {
        const token = localStorage.getItem("postarc_token")
        const stored = localStorage.getItem("postarc_user")
        if (token && stored) {
          const data = JSON.parse(stored)
          if (data.email) {
            const userEmail = data.email
            const accountId = data.accountId || userEmail.split("@")[0] || "admin"
            postarcClient.setAccountId(accountId)
            setIdentities([
              {
                id: accountId,
                name: data.username || userEmail.split("@")[0] || "Admin",
                email: userEmail,
                isDefault: true,
              },
            ])
            setActiveIdentity({
              id: accountId,
              name: data.username || userEmail.split("@")[0] || "Admin",
              email: userEmail,
              isDefault: true,
            })
            setIsAuthenticated(true)
            return true
          }
        }
      }
    } catch {
      // offline / not authenticated
    }

    setIsAuthenticated(false)
    return false
  }, [])

  // 2. Fetch Live JMAP Data
  const refreshMailbox = useCallback(async () => {
    try {
      // Fetch Mailboxes
      const mailboxes: JmapMailbox[] = await postarcClient.getMailboxes()
      const roleMap: Record<string, string> = {}
      for (const m of mailboxes) {
        if (m.role) {
          roleMap[m.id] = m.role.toLowerCase()
        } else if (m.name) {
          roleMap[m.id] = m.name.toLowerCase()
        }
      }

      const customOnes: CustomMailboxFolder[] = mailboxes
        .filter((m) => !m.role)
        .map((m) => ({
          id: m.id,
          name: m.name,
          totalCount: m.totalEmails,
          unreadCount: m.unreadEmails,
        }))
      setCustomFolders(customOnes)

      // Fetch Emails
      const { emails: jmapEmails } = await postarcClient.getEmails({
        searchQuery: searchQuery || undefined,
        limit: 100,
      })

      const mappedThreads = jmapEmails.map((e) => mapJmapEmailToThread(e, roleMap))
      setEmails(mappedThreads)

      // Fetch Identities
      const idents = await postarcClient.getIdentities()
      if (idents.length > 0) {
        const mappedIdents: MailIdentity[] = idents.map((i, idx) => ({
          id: i.id,
          name: i.name,
          email: i.email,
          replyTo: i.replyTo?.[0]?.email,
          textSignature: i.textSignature,
          htmlSignature: i.htmlSignature,
          isDefault: idx === 0,
        }))
        setIdentities(mappedIdents)
        setActiveIdentity(mappedIdents[0])
      }

      // Fetch Vacation Response
      const vac = await postarcClient.getVacationResponse()
      if (vac) {
        setVacationSettings({
          isEnabled: vac.isEnabled,
          subject: vac.subject || "Out of office",
          body: vac.textBody || "",
        })
      }

      // Fetch Quota
      const q = await postarcClient.getQuota()
      if (q && q.limit > 0) {
        setQuotaInfo({
          usedBytes: q.used,
          totalBytes: q.limit,
          percent: Math.min(100, Math.round((q.used / q.limit) * 100)),
        })
      }

      // Fetch Contacts
      const contactCards = await postarcClient.getContactCards()
      if (contactCards.length > 0) {
        const mappedContacts: MailContact[] = contactCards.map((c) => ({
          id: c.id,
          name: c.name?.full || "Contact",
          email: Object.values(c.emails || {})[0]?.address || "",
          phone: Object.values(c.phones || {})[0]?.number,
          company: Object.values(c.organizations || {})[0]?.name,
          jobTitle: Object.values(c.organizations || {})[0]?.title,
          group: "Work",
        }))
        setContacts(mappedContacts)
      }
    } catch (err) {
      console.error("Failed to refresh mailbox from Postarc:", err)
    }
  }, [searchQuery])

  useEffect(() => {
    checkAuth().then((authed) => {
      if (authed) {
        refreshMailbox()
      }
    })
  }, [checkAuth, refreshMailbox])

  const logout = async () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("postarc_token")
      localStorage.removeItem("postarc_user")
      localStorage.removeItem("postarc_emails")
      localStorage.removeItem("postarc_mailboxes")
      window.location.reload()
    }
    setIsAuthenticated(false)
    setEmails([])
  }

  const activeEmail = useMemo(() => {
    return emails.find((e) => e.id === activeEmailId) || null
  }, [emails, activeEmailId])

  const unreadCounts = useMemo(() => {
    const counts = {
      primary: 0,
      promotions: 0,
      social: 0,
      updates: 0,
      inbox: 0,
      starred: 0,
      drafts: 0,
      spam: 0,
      trash: 0,
    }

    emails.forEach((email) => {
      if (email.isUnread && email.folder === "inbox") {
        counts.inbox++
        if (email.category in counts) {
          counts[email.category]++
        }
      }
      if (email.isStarred) counts.starred++
      if (email.folder === "drafts") counts.drafts++
      if (email.isUnread && email.folder === "spam") counts.spam++
      if (email.isUnread && email.folder === "trash") counts.trash++
    })

    return counts
  }, [emails])

  const openEmail = (id: string) => {
    setActiveEmailId(id)
    setEmails((prev) =>
      prev.map((e) => (e.id === id ? { ...e, isUnread: false } : e))
    )
    postarcClient.setEmailProperties(id, { keywords: { $seen: true } }).catch(() => {})
  }

  const closeEmail = () => {
    setActiveEmailId(null)
  }

  const toggleStar = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    const target = emails.find((item) => item.id === id)
    const newStarred = !target?.isStarred
    setEmails((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, isStarred: newStarred } : item
      )
    )
    postarcClient.setEmailProperties(id, { keywords: { $flagged: newStarred } }).catch(() => {})
  }

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const selectAll = (mode: "all" | "none" | "read" | "unread" | "starred" = "all") => {
    if (mode === "none") {
      setSelectedIds(new Set())
      return
    }

    const matching = emails.filter((e) => {
      if (activeFolder === "starred") return e.isStarred
      if (activeFolder !== e.folder) return false
      if (mode === "read") return !e.isUnread
      if (mode === "unread") return e.isUnread
      if (mode === "starred") return e.isStarred
      return true
    })

    setSelectedIds(new Set(matching.map((e) => e.id)))
  }

  const [previousSnapshot, setPreviousSnapshot] = useState<EmailThread[] | null>(null)

  const undoLastAction = () => {
    if (previousSnapshot) {
      setEmails(previousSnapshot)
      setPreviousSnapshot(null)
      toast({ body: "Action undone" })
    }
  }

  const archiveSelected = (overrideIds?: string[]) => {
    const targets =
      overrideIds && overrideIds.length > 0
        ? overrideIds
        : selectedIds.size > 0
        ? Array.from(selectedIds)
        : activeEmailId
        ? [activeEmailId]
        : []
    if (targets.length === 0) return

    const snapshot = [...emails]
    setPreviousSnapshot(snapshot)
    setEmails((prev) =>
      prev.map((e) =>
        targets.includes(e.id) ? { ...e, folder: "archive" } : e
      )
    )
    setSelectedIds((prev) => {
      const next = new Set(prev)
      targets.forEach((id) => next.delete(id))
      return next
    })
    if (activeEmailId && targets.includes(activeEmailId)) {
      setActiveEmailId(null)
    }

    // Live JMAP update
    targets.forEach((id) => {
      postarcClient.setEmailProperties(id, { mailboxIds: { archive: true } }).catch(() => {})
    })

    toast({
      body: `Archived ${targets.length} conversation${targets.length > 1 ? "s" : ""}`,
      endContent: (
        <Button
          label="Undo"
          variant="ghost"
          size="sm"
          onClick={() => setEmails(snapshot)}
        />
      ),
    })
  }

  const deleteSelected = (overrideIds?: string[]) => {
    const targets =
      overrideIds && overrideIds.length > 0
        ? overrideIds
        : selectedIds.size > 0
        ? Array.from(selectedIds)
        : activeEmailId
        ? [activeEmailId]
        : []
    if (targets.length === 0) return

    const snapshot = [...emails]
    setPreviousSnapshot(snapshot)
    setEmails((prev) =>
      prev
        .map((e) => {
          if (targets.includes(e.id)) {
            return { ...e, folder: e.folder === "trash" ? "deleted" : "trash" }
          }
          return e
        })
        .filter((e) => e.folder !== "deleted")
    )
    setSelectedIds((prev) => {
      const next = new Set(prev)
      targets.forEach((id) => next.delete(id))
      return next
    })
    if (activeEmailId && targets.includes(activeEmailId)) {
      setActiveEmailId(null)
    }

    // Live JMAP delete
    postarcClient.destroyEmails(targets).catch(() => {})

    toast({
      body: `Moved ${targets.length} to Trash`,
      endContent: (
        <Button
          label="Undo"
          variant="ghost"
          size="sm"
          onClick={() => setEmails(snapshot)}
        />
      ),
    })
  }

  const reportSpam = (overrideIds?: string[]) => {
    const targets =
      overrideIds && overrideIds.length > 0
        ? overrideIds
        : selectedIds.size > 0
        ? Array.from(selectedIds)
        : activeEmailId
        ? [activeEmailId]
        : []
    if (targets.length === 0) return

    setEmails((prev) =>
      prev.map((e) => (targets.includes(e.id) ? { ...e, folder: "spam" } : e))
    )
    setSelectedIds((prev) => {
      const next = new Set(prev)
      targets.forEach((id) => next.delete(id))
      return next
    })
    if (activeEmailId && targets.includes(activeEmailId)) {
      setActiveEmailId(null)
    }
    targets.forEach((id) => {
      postarcClient.setEmailProperties(id, { mailboxIds: { spam: true } }).catch(() => {})
    })
    toast({ body: "Reported as spam and moved to Junk" })
  }

  const markSelectedAsRead = () => {
    const targets = selectedIds.size > 0 ? Array.from(selectedIds) : activeEmailId ? [activeEmailId] : []
    if (targets.length === 0) return

    setEmails((prev) =>
      prev.map((e) => (targets.includes(e.id) ? { ...e, isUnread: false } : e))
    )
    setSelectedIds(new Set())
    targets.forEach((id) => {
      postarcClient.setEmailProperties(id, { keywords: { $seen: true } }).catch(() => {})
    })
  }

  const markSelectedAsUnread = () => {
    const targets = selectedIds.size > 0 ? Array.from(selectedIds) : activeEmailId ? [activeEmailId] : []
    if (targets.length === 0) return

    setEmails((prev) =>
      prev.map((e) => (targets.includes(e.id) ? { ...e, isUnread: true } : e))
    )
    setSelectedIds(new Set())
    if (activeEmailId && targets.includes(activeEmailId)) {
      setActiveEmailId(null)
    }
    targets.forEach((id) => {
      postarcClient.setEmailProperties(id, { keywords: { $seen: false } }).catch(() => {})
    })
  }

  const toggleEmailRead = (id: string) => {
    const target = emails.find((e) => e.id === id)
    const newUnread = !target?.isUnread
    setEmails((prev) =>
      prev.map((e) => (e.id === id ? { ...e, isUnread: newUnread } : e))
    )
    postarcClient.setEmailProperties(id, { keywords: { $seen: !newUnread } }).catch(() => {})
  }

  const snoozeEmails = (ids: string[], untilText: string) => {
    setEmails((prev) =>
      prev.map((e) => (ids.includes(e.id) ? { ...e, folder: "snoozed" } : e))
    )
    setSelectedIds(new Set())
    if (activeEmailId && ids.includes(activeEmailId)) {
      setActiveEmailId(null)
    }
    toast({ body: `Snoozed until ${untilText}` })
  }

  const moveEmailsToFolder = (ids: string[], targetFolder: EmailFolder) => {
    setEmails((prev) =>
      prev.map((e) => (ids.includes(e.id) ? { ...e, folder: targetFolder } : e))
    )
    setSelectedIds(new Set())
    if (activeEmailId && ids.includes(activeEmailId)) {
      setActiveEmailId(null)
    }
    ids.forEach((id) => {
      postarcClient.setEmailProperties(id, { mailboxIds: { [targetFolder]: true } }).catch(() => {})
    })
    toast({ body: `Moved to ${targetFolder}` })
  }

  const allowRemoteImagesForEmail = (emailId: string) => {
    setAllowedRemoteImages((prev) => new Set([...prev, emailId]))
  }

  const replyToEmail = (
    threadId: string,
    replyText: string,
    options?: {
      mode?: "reply" | "reply_all" | "forward"
      to?: string
      cc?: string[]
      attachments?: EmailAttachment[]
    }
  ) => {
    if (!replyText.trim()) return

    const targetThread = emails.find((e) => e.id === threadId)
    const recipient = options?.to?.trim() || targetThread?.senderEmail || "recipient@example.com"

    const newMessage: ThreadMessage = {
      id: `msg_reply_${Date.now()}`,
      senderName: activeIdentity.name,
      senderEmail: activeIdentity.email,
      recipientEmail: recipient,
      body: replyText,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      fullDate: new Date().toLocaleString(),
      isFromMe: true,
      spfStatus: "pass",
      dkimStatus: "pass",
      dmarcStatus: "pass",
    }

    setEmails((prev) =>
      prev.map((e) =>
        e.id === threadId
          ? {
              ...e,
              messages: [...(e.messages || []), newMessage],
              threadCount: (e.threadCount || 1) + 1,
            }
          : e
      )
    )

    postarcClient
      .sendEmail({
        identityId: activeIdentity.id,
        from: { name: activeIdentity.name, email: activeIdentity.email },
        to: [{ email: recipient }],
        cc: options?.cc?.map((email) => ({ email })),
        subject: targetThread ? `Re: ${targetThread.subject}` : "Reply",
        body: replyText,
      })
      .then(() => {
        toast({
          body:
            options?.mode === "forward"
              ? "Message forwarded"
              : options?.mode === "reply_all"
              ? "Reply sent to all recipients"
              : "Reply sent",
        })
      })
      .catch((err) => {
        toast({ body: `Failed to send reply: ${err.message}` })
      })
  }

  const removeThreadLabel = (threadId: string) => {
    setEmails((prev) =>
      prev.map((e) => (e.id === threadId ? { ...e, label: undefined, labelColor: undefined } : e))
    )
    toast({ body: "Label removed" })
  }

  const applyThreadLabel = (threadIds: string[], label: string, color?: string) => {
    const assignedColor =
      color ||
      (label === "Clients"
        ? "#059669"
        : label === "Invoices"
        ? "#d97706"
        : label === "Personal"
        ? "#8b5cf6"
        : "#2563eb")
    setEmails((prev) =>
      prev.map((e) =>
        threadIds.includes(e.id) ? { ...e, label, labelColor: assignedColor } : e
      )
    )
    toast({
      body: `Applied "${label}" to ${threadIds.length} ${
        threadIds.length === 1 ? "thread" : "threads"
      }`,
    })
  }

  const importEmlMessage = (data: {
    subject: string
    senderName: string
    senderEmail: string
    body: string
    htmlBody?: string
    date?: string
    attachments?: EmailAttachment[]
  }) => {
    const newId = `imported_${Date.now()}`
    const newThread: EmailThread = {
      id: newId,
      senderName: data.senderName || "Unknown Sender",
      senderEmail: data.senderEmail || "unknown@domain.com",
      recipientEmail: activeIdentity.email,
      subject: data.subject || "(No Subject)",
      snippet: data.body ? data.body.slice(0, 100).replace(/\n/g, " ") : "Imported RFC 822 email",
      body: data.body || "",
      htmlBody: data.htmlBody,
      timestamp: "Just now",
      fullDate: data.date || "Imported message",
      isoDate: new Date().toISOString(),
      category: "primary",
      folder: "inbox",
      isUnread: true,
      isStarred: false,
      threadCount: 1,
      attachments: data.attachments,
    }
    setEmails((prev) => [newThread, ...prev])
    toast({ body: `Imported message: "${newThread.subject}"` })
  }

  const emptyTrash = () => {
    const trashEmails = emails.filter((e) => e.folder === "trash")
    if (trashEmails.length === 0) {
      toast({ body: "Trash is already empty" })
      return
    }
    const ids = trashEmails.map((e) => e.id)
    setEmails((prev) => prev.filter((e) => e.folder !== "trash"))
    postarcClient.destroyEmails(ids).catch(() => {})
    toast({ body: `Permanently removed ${ids.length} deleted messages` })
  }

  const markAllAsRead = (targetFolder: EmailFolder = activeFolder) => {
    setEmails((prev) =>
      prev.map((e) => (e.folder === targetFolder ? { ...e, isUnread: false } : e))
    )
    toast({ body: `All messages in ${targetFolder} marked as read` })
  }

  const addIdentity = (ident: Omit<MailIdentity, "id">) => {
    postarcClient
      .setIdentity({
        create: {
          newIdent: {
            name: ident.name,
            email: ident.email,
            textSignature: ident.textSignature || "",
            htmlSignature: ident.htmlSignature || "",
          },
        },
      })
      .then(() => {
        refreshMailbox()
        toast({ body: `Identity "${ident.name}" added` })
      })
  }

  const deleteIdentity = (id: string) => {
    postarcClient
      .setIdentity({
        destroy: [id],
      })
      .then(() => {
        setIdentities((prev) => prev.filter((i) => i.id !== id))
        toast({ body: "Identity deleted" })
      })
  }

  const saveVacationSettings = (settings: { isEnabled: boolean; subject: string; body: string }) => {
    setVacationSettings(settings)
    postarcClient
      .setVacationResponse({
        isEnabled: settings.isEnabled,
        subject: settings.subject,
        textBody: settings.body,
      })
      .then(() => {
        toast({ body: "Vacation auto-responder settings saved" })
      })
      .catch((err) => {
        toast({ body: `Failed to save vacation settings: ${err.message}` })
      })
  }

  const openCompose = (options?: { to?: string; subject?: string; body?: string }) => {
    if (options) {
      setComposeInitialData(options)
    }
    setIsComposeOpen(true)
  }

  const closeCompose = () => {
    setIsComposeOpen(false)
    setComposeInitialData(null)
  }

  const clearComposeInitialData = () => {
    setComposeInitialData(null)
  }

  const sendEmail = async (
    to: string,
    subject: string,
    body: string,
    attachments?: EmailAttachment[],
    identityId?: string
  ) => {
    const ident = identities.find((i) => i.id === identityId) || activeIdentity

    try {
      await postarcClient.sendEmail({
        identityId: ident.id,
        from: { name: ident.name, email: ident.email },
        to: [{ email: to }],
        subject: subject || "(No subject)",
        body,
        attachments: attachments?.map((att) => ({
          blobId: att.id,
          name: att.name,
          type: "application/octet-stream",
          size: 1024,
        })),
      })

      setIsComposeOpen(false)
      toast({ body: "Message sent successfully via Postarc" })
      refreshMailbox()
    } catch (err) {
      toast({ body: `Failed to send email: ${err instanceof Error ? err.message : "Error"}` })
    }
  }

  const saveDraft = (to: string, subject: string, body: string, attachments?: EmailAttachment[]) => {
    if (!to && !subject && !body) return
    toast({ body: "Draft saved" })
  }

  const createCustomFolder = (name: string) => {
    postarcClient
      .setMailbox({
        create: {
          newBox: {
            name,
          },
        },
      })
      .then(() => {
        refreshMailbox()
        toast({ body: `Folder "${name}" created` })
      })
  }

  const deleteCustomFolder = (id: string) => {
    postarcClient
      .setMailbox({
        destroy: [id],
      })
      .then(() => {
        setCustomFolders((prev) => prev.filter((f) => f.id !== id))
        if (activeFolder === id) setActiveFolder("inbox")
        toast({ body: "Folder removed" })
      })
  }

  const addCannedResponse = (title: string, body: string, subject?: string) => {
    const newCr: CannedResponse = {
      id: `cr_${Date.now()}`,
      title,
      body,
      subject,
      updatedAt: new Date().toISOString().split("T")[0],
    }
    setCannedResponses((prev) => [newCr, ...prev])
    toast({ body: "Template saved" })
  }

  const deleteCannedResponse = (id: string) => {
    setCannedResponses((prev) => prev.filter((cr) => cr.id !== id))
    toast({ body: "Template removed" })
  }

  // If checking authentication
  if (isAuthenticated === null) {
    return null
  }

  // If not authenticated, display Astryx Postarc Sign-in Screen
  if (!isAuthenticated) {
    return (
      <PostarcAuth
        onSuccess={() => {
          checkAuth().then((authed) => {
            if (authed) {
              refreshMailbox()
            }
          })
        }}
      />
    )
  }

  return (
    <MailContext.Provider
      value={{
        emails,
        activeEmailId,
        activeEmail,
        activeCategory,
        activeFolder,
        selectedIds,
        isComposeOpen,
        searchQuery,
        unreadCounts,
        customFolders,
        createCustomFolder,
        deleteCustomFolder,
        moveEmailsToFolder,
        identities,
        activeIdentity,
        setActiveIdentity,
        cannedResponses,
        addCannedResponse,
        deleteCannedResponse,
        contacts,
        allowedRemoteImages,
        allowRemoteImagesForEmail,
        quotaInfo,
        undoLastAction,
        openEmail,
        closeEmail,
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
        replyToEmail,
        removeThreadLabel,
        applyThreadLabel,
        importEmlMessage,
        emptyTrash,
        markAllAsRead,
        addIdentity,
        deleteIdentity,
        vacationSettings,
        saveVacationSettings,
        composeInitialData,
        openCompose,
        closeCompose,
        clearComposeInitialData,
        refreshMailbox,
        sendEmail,
        saveDraft,
        setActiveCategory,
        setActiveFolder,
        setSearchQuery,
        logout,
        isAuthenticated,
      }}
    >
      {children}
    </MailContext.Provider>
  )
}

export function useMail() {
  const context = useContext(MailContext)
  if (!context) {
    throw new Error("useMail must be used within a MailProvider")
  }
  return context
}
