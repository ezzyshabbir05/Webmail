/**
 * Postarc JMAP Client SDK - Pure Frontend Edition
 * Compliant with RFC 8620 (JMAP Core) & RFC 8621 (JMAP Mail)
 * Self-contained client-side state engine with localStorage persistence.
 */

import type {
  JmapSession,
  JmapRequest,
  JmapResponse,
  JmapMailbox,
  JmapEmail,
  JmapIdentity,
  JmapVacationResponse,
  JmapCalendarEvent,
  JmapContactCard,
  JmapQuota,
} from "./types"

// Default initial dataset
const INITIAL_MAILBOXES: JmapMailbox[] = [
  {
    id: "inbox",
    name: "Inbox",
    parentId: null,
    role: "inbox",
    sortOrder: 1,
    totalEmails: 0,
    unreadEmails: 0,
    totalThreads: 0,
    unreadThreads: 0,
    myRights: {
      mayReadItems: true,
      mayAddItems: true,
      mayRemoveItems: true,
      maySetSeen: true,
      maySetKeywords: true,
      mayCreateChild: true,
      mayRename: false,
      mayDelete: false,
      maySubmit: true,
    },
    isSubscribed: true,
  },
  {
    id: "starred",
    name: "Starred",
    parentId: null,
    role: "starred",
    sortOrder: 2,
    totalEmails: 0,
    unreadEmails: 0,
    totalThreads: 0,
    unreadThreads: 0,
    myRights: {
      mayReadItems: true,
      mayAddItems: true,
      mayRemoveItems: true,
      maySetSeen: true,
      maySetKeywords: true,
      mayCreateChild: false,
      mayRename: false,
      mayDelete: false,
      maySubmit: false,
    },
    isSubscribed: true,
  },
  {
    id: "sent",
    name: "Sent",
    parentId: null,
    role: "sent",
    sortOrder: 3,
    totalEmails: 0,
    unreadEmails: 0,
    totalThreads: 0,
    unreadThreads: 0,
    myRights: {
      mayReadItems: true,
      mayAddItems: true,
      mayRemoveItems: true,
      maySetSeen: true,
      maySetKeywords: true,
      mayCreateChild: false,
      mayRename: false,
      mayDelete: false,
      maySubmit: true,
    },
    isSubscribed: true,
  },
  {
    id: "drafts",
    name: "Drafts",
    parentId: null,
    role: "drafts",
    sortOrder: 4,
    totalEmails: 0,
    unreadEmails: 0,
    totalThreads: 0,
    unreadThreads: 0,
    myRights: {
      mayReadItems: true,
      mayAddItems: true,
      mayRemoveItems: true,
      maySetSeen: true,
      maySetKeywords: true,
      mayCreateChild: false,
      mayRename: false,
      mayDelete: true,
      maySubmit: true,
    },
    isSubscribed: true,
  },
  {
    id: "archive",
    name: "Archive",
    parentId: null,
    role: "archive",
    sortOrder: 5,
    totalEmails: 0,
    unreadEmails: 0,
    totalThreads: 0,
    unreadThreads: 0,
    myRights: {
      mayReadItems: true,
      mayAddItems: true,
      mayRemoveItems: true,
      maySetSeen: true,
      maySetKeywords: true,
      mayCreateChild: false,
      mayRename: false,
      mayDelete: true,
      maySubmit: false,
    },
    isSubscribed: true,
  },
  {
    id: "spam",
    name: "Spam",
    parentId: null,
    role: "spam",
    sortOrder: 6,
    totalEmails: 0,
    unreadEmails: 0,
    totalThreads: 0,
    unreadThreads: 0,
    myRights: {
      mayReadItems: true,
      mayAddItems: true,
      mayRemoveItems: true,
      maySetSeen: true,
      maySetKeywords: true,
      mayCreateChild: false,
      mayRename: false,
      mayDelete: true,
      maySubmit: false,
    },
    isSubscribed: true,
  },
  {
    id: "trash",
    name: "Trash",
    parentId: null,
    role: "trash",
    sortOrder: 7,
    totalEmails: 0,
    unreadEmails: 0,
    totalThreads: 0,
    unreadThreads: 0,
    myRights: {
      mayReadItems: true,
      mayAddItems: true,
      mayRemoveItems: true,
      maySetSeen: true,
      maySetKeywords: true,
      mayCreateChild: false,
      mayRename: false,
      mayDelete: true,
      maySubmit: false,
    },
    isSubscribed: true,
  },
]

const INITIAL_EMAILS: JmapEmail[] = []

const INITIAL_IDENTITIES: JmapIdentity[] = []
const INITIAL_CONTACTS: JmapContactCard[] = []
const INITIAL_CALENDAR_EVENTS: JmapCalendarEvent[] = []

export class PostarcClient {
  private session: JmapSession | null = null
  private accountId: string | null = "admin"
  private mailboxes: JmapMailbox[] = INITIAL_MAILBOXES
  private emails: JmapEmail[] = INITIAL_EMAILS
  private identities: JmapIdentity[] = INITIAL_IDENTITIES
  private contacts: JmapContactCard[] = INITIAL_CONTACTS
  private events: JmapCalendarEvent[] = INITIAL_CALENDAR_EVENTS
  private vacation: JmapVacationResponse = {
    id: "singleton",
    isEnabled: false,
    subject: "Out of Office Auto-reply",
    textBody: "I am currently away with limited access to email. I will respond to your message upon my return.",
  }
  private quota: JmapQuota = {
    id: "quota_1",
    name: "Mailbox Storage",
    resourceType: "octets",
    used: 2576980377,
    limit: 10737418240,
    scope: "account",
  }

  constructor(session?: JmapSession) {
    if (session) {
      this.session = session
    }
    this.loadFromStorage()
  }

  private loadFromStorage() {
    if (typeof window === "undefined") return
    try {
      const storedMailboxes = localStorage.getItem("postarc_mailboxes")
      if (storedMailboxes) {
        this.mailboxes = JSON.parse(storedMailboxes)
      }
      const storedEmails = localStorage.getItem("postarc_emails")
      if (storedEmails) {
        this.emails = JSON.parse(storedEmails)
      }
      const storedVacation = localStorage.getItem("postarc_vacation")
      if (storedVacation) {
        this.vacation = JSON.parse(storedVacation)
      }
      const storedContacts = localStorage.getItem("postarc_contacts")
      if (storedContacts) {
        this.contacts = JSON.parse(storedContacts)
      }
      const storedEvents = localStorage.getItem("postarc_events")
      if (storedEvents) {
        this.events = JSON.parse(storedEvents)
      }
    } catch {
      // Ignore storage read errors
    }
  }

  private saveToStorage() {
    if (typeof window === "undefined") return
    try {
      localStorage.setItem("postarc_mailboxes", JSON.stringify(this.mailboxes))
      localStorage.setItem("postarc_emails", JSON.stringify(this.emails))
      localStorage.setItem("postarc_vacation", JSON.stringify(this.vacation))
      localStorage.setItem("postarc_contacts", JSON.stringify(this.contacts))
      localStorage.setItem("postarc_events", JSON.stringify(this.events))
    } catch {
      // Ignore storage write errors
    }
  }

  public setSession(session: JmapSession) {
    this.session = session
  }

  public setAccountId(accountId: string) {
    this.accountId = accountId
  }

  public getAccountId(): string {
    return this.accountId || "admin"
  }

  private getBackendUrl(): string {
    if (typeof window !== "undefined") {
      const custom = (window as unknown as { NEXT_PUBLIC_POSTARC_API_URL?: string }).NEXT_PUBLIC_POSTARC_API_URL || process.env.NEXT_PUBLIC_POSTARC_API_URL
      if (custom && custom.startsWith("http")) return custom
      return window.location.origin
    }
    return process.env.NEXT_PUBLIC_POSTARC_API_URL || "http://127.0.0.1:8080"
  }

  public async fetchLiveJmap(method: string, args: Record<string, unknown>): Promise<unknown | null> {
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" }
      if (typeof window !== "undefined") {
        const token = localStorage.getItem("postarc_token")
        if (token) {
          headers["Authorization"] = `Bearer ${token}`
        }
      }

      const res = await fetch(`${this.getBackendUrl()}/api/jmap`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          using: ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"],
          methodCalls: [[method, args, "c0"]],
        }),
      })
      if (!res.ok) {
        if (res.status === 401 && typeof window !== "undefined") {
          localStorage.removeItem("postarc_token")
          localStorage.removeItem("postarc_user")
          window.location.reload()
        }
        return null
      }
      const json = await res.json()
      return json?.methodResponses?.[0]?.[1] || null
    } catch {
      return null
    }
  }

  public async getMailboxByRole(role: string): Promise<JmapMailbox | null> {
    const target = role.toLowerCase()
    return (
      this.mailboxes.find(
        (m) => m.role?.toLowerCase() === target || m.name.toLowerCase() === target
      ) || null
    )
  }

  public async getMailboxes(): Promise<JmapMailbox[]> {
    this.loadFromStorage()
    try {
      const live = (await this.fetchLiveJmap("Mailbox/get", {})) as { list?: JmapMailbox[] } | null
      if (live?.list && live.list.length > 0) {
        this.mailboxes = live.list
        this.saveToStorage()
      }
    } catch {
      // Graceful fallback to local cache
    }
    return [...this.mailboxes]
  }

  public async setMailbox(params: {
    create?: Record<string, Partial<JmapMailbox>>
    update?: Record<string, Partial<JmapMailbox>>
    destroy?: string[]
  }): Promise<Record<string, unknown>> {
    try {
      await this.fetchLiveJmap("Mailbox/set", params)
    } catch {
      // offline fallback
    }

    if (params.create) {
      for (const [, mbData] of Object.entries(params.create)) {
        const newMb: JmapMailbox = {
          id: `mb_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          name: mbData.name || "Custom Folder",
          parentId: mbData.parentId || null,
          role: null,
          sortOrder: this.mailboxes.length + 1,
          totalEmails: 0,
          unreadEmails: 0,
          totalThreads: 0,
          unreadThreads: 0,
          myRights: {
            mayReadItems: true,
            mayAddItems: true,
            mayRemoveItems: true,
            maySetSeen: true,
            maySetKeywords: true,
            mayCreateChild: true,
            mayRename: true,
            mayDelete: true,
            maySubmit: true,
          },
          isSubscribed: true,
        }
        this.mailboxes.push(newMb)
      }
    }

    if (params.update) {
      for (const [id, updates] of Object.entries(params.update)) {
        this.mailboxes = this.mailboxes.map((m) =>
          m.id === id ? { ...m, ...updates } : m
        )
      }
    }

    if (params.destroy) {
      this.mailboxes = this.mailboxes.filter((m) => !params.destroy?.includes(m.id))
    }

    this.saveToStorage()
    return { created: {}, updated: {}, destroyed: params.destroy || [] }
  }

  public async getEmails(options: {
    mailboxId?: string
    keyword?: string
    searchQuery?: string
    limit?: number
    position?: number
  }): Promise<{ emails: JmapEmail[]; total: number }> {
    this.loadFromStorage()

    try {
      const queryArgs: Record<string, unknown> = {
        limit: options.limit || 50,
        position: options.position || 0,
      }
      if (options.mailboxId) {
        queryArgs.filter = { inMailbox: options.mailboxId }
      }
      if (options.searchQuery) {
        queryArgs.filter = { text: options.searchQuery }
      }

      const liveQuery = (await this.fetchLiveJmap("Email/query", queryArgs)) as {
        ids?: string[]
      } | null
      if (liveQuery) {
        if (Array.isArray(liveQuery.ids) && liveQuery.ids.length > 0) {
          const liveGet = (await this.fetchLiveJmap("Email/get", { ids: liveQuery.ids })) as {
            list?: JmapEmail[]
          } | null
          if (liveGet?.list) {
            this.emails = liveGet.list
            this.saveToStorage()
          }
        } else if (Array.isArray(liveQuery.ids) && liveQuery.ids.length === 0) {
          this.emails = []
          this.saveToStorage()
        }
      }
    } catch {
      // Graceful fallback to local cache
    }

    let list = [...this.emails]

    if (options.mailboxId) {
      list = list.filter((e) => e.mailboxIds?.[options.mailboxId!])
    }

    if (options.keyword) {
      list = list.filter((e) => e.keywords?.[options.keyword!])
    }

    if (options.searchQuery) {
      const q = options.searchQuery.toLowerCase()
      list = list.filter(
        (e) =>
          e.subject?.toLowerCase().includes(q) ||
          e.preview?.toLowerCase().includes(q) ||
          e.from?.[0]?.name?.toLowerCase().includes(q) ||
          e.from?.[0]?.email.toLowerCase().includes(q)
      )
    }

    return {
      emails: list.slice(options.position || 0, (options.position || 0) + (options.limit || 100)),
      total: list.length,
    }
  }

  public async setEmailProperties(
    emailId: string,
    updates: {
      keywords?: Record<string, boolean>
      mailboxIds?: Record<string, boolean>
    }
  ): Promise<void> {
    try {
      await this.fetchLiveJmap("Email/set", {
        update: {
          [emailId]: {
            ...(updates.keywords ? { keywords: updates.keywords } : {}),
            ...(updates.mailboxIds ? { mailboxIds: updates.mailboxIds } : {}),
          },
        },
      })
    } catch {
      // offline fallback
    }

    this.emails = this.emails.map((e) => {
      if (e.id !== emailId) return e
      const newKeywords = { ...e.keywords }
      if (updates.keywords) {
        for (const [k, v] of Object.entries(updates.keywords)) {
          if (v) {
            newKeywords[k] = true
          } else {
            delete newKeywords[k]
          }
        }
      }
      return {
        ...e,
        keywords: newKeywords,
        mailboxIds: updates.mailboxIds ? { ...updates.mailboxIds } : e.mailboxIds,
      }
    })
    this.saveToStorage()
  }

  public async destroyEmails(emailIds: string[]): Promise<void> {
    try {
      await this.fetchLiveJmap("Email/set", {
        destroy: emailIds,
      })
    } catch {
      // offline fallback
    }

    this.emails = this.emails.filter((e) => !emailIds.includes(e.id))
    this.saveToStorage()
  }

  public async sendEmail(params: {
    identityId: string
    from: { name?: string; email: string }
    to: { name?: string; email: string }[]
    cc?: { name?: string; email: string }[]
    bcc?: { name?: string; email: string }[]
    replyTo?: { name?: string; email: string }[]
    subject: string
    body: string
    htmlBody?: string
    attachments?: { blobId: string; name: string; type: string; size: number }[]
  }): Promise<{ emailId: string; submissionId: string }> {
    const sentMb = await this.getMailboxByRole("sent")
    const sentMbId = sentMb?.id || "sent"

    let emailId = `msg_out_${Date.now()}`
    let submissionId = `sub_${Date.now()}`

    try {
      // 1. Create email via JMAP Email/set
      const createRes = (await this.fetchLiveJmap("Email/set", {
        create: {
          temp1: {
            mailboxIds: { [sentMbId]: true },
            from: [params.from],
            to: params.to,
            cc: params.cc || [],
            bcc: params.bcc || [],
            subject: params.subject,
            bodyValues: {
              "1": {
                value: params.htmlBody || params.body,
              },
            },
            textBody: [{ partId: "1", type: params.htmlBody ? "text/html" : "text/plain", size: (params.htmlBody || params.body).length }],
          },
        },
      })) as { created?: Record<string, { id: string }> } | null

      if (createRes?.created?.temp1?.id) {
        emailId = createRes.created.temp1.id

        // 2. Submit email for outbound delivery via JMAP EmailSubmission/set
        const subRes = (await this.fetchLiveJmap("EmailSubmission/set", {
          create: {
            sub1: {
              emailId,
              identityId: params.identityId,
            },
          },
        })) as { created?: Record<string, { id: string }> } | null

        if (subRes?.created?.sub1?.id) {
          submissionId = subRes.created.sub1.id
        }
      }
    } catch (e) {
      console.warn("Live JMAP submission error:", e)
    }

    const newEmail: JmapEmail = {
      id: emailId,
      blobId: emailId,
      threadId: emailId,
      mailboxIds: { [sentMbId]: true },
      keywords: { $seen: true },
      size: (params.body.length || 512) + (params.attachments?.reduce((acc, a) => acc + a.size, 0) || 0),
      receivedAt: new Date().toISOString(),
      sentAt: new Date().toISOString(),
      from: [{ name: params.from.name || "Admin", email: params.from.email }],
      to: params.to,
      cc: params.cc,
      bcc: params.bcc,
      replyTo: params.replyTo,
      subject: params.subject,
      preview: params.body.slice(0, 100),
      bodyValues: {
        body1: {
          value: params.htmlBody || params.body,
          isEncodingProblem: false,
          isTruncated: false,
        },
      },
      textBody: [{ partId: "1", type: params.htmlBody ? "text/html" : "text/plain", size: (params.htmlBody || params.body).length }],
      attachments: params.attachments?.map((att, idx) => ({
        partId: `att_${idx}`,
        blobId: att.blobId,
        size: att.size,
        name: att.name,
        type: att.type,
      })),
    }

    this.emails = [newEmail, ...this.emails]

    // Update Sent mailbox count
    this.mailboxes = this.mailboxes.map((m) =>
      m.role === "sent" ? { ...m, totalEmails: m.totalEmails + 1 } : m
    )

    this.saveToStorage()
    return { emailId, submissionId }
  }

  public async uploadAttachment(file: File): Promise<{ blobId: string; size: number; type: string }> {
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("postarc_token") : null
      const accountId = this.getAccountId()
      const headers: Record<string, string> = {
        "Content-Type": file.type || "application/octet-stream",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      }

      const res = await fetch(`${this.getBackendUrl()}/api/upload/${encodeURIComponent(accountId)}`, {
        method: "POST",
        headers,
        body: file,
      })

      if (res.ok) {
        const data = await res.json()
        if (data?.blobId) {
          return {
            blobId: data.blobId,
            size: data.size || file.size,
            type: data.type || file.type || "application/octet-stream",
          }
        }
      }
    } catch (err) {
      console.warn("Live blob upload failed, falling back to local metadata:", err)
    }

    return {
      blobId: `blob_${Date.now()}_${encodeURIComponent(file.name)}`,
      size: file.size,
      type: file.type || "application/octet-stream",
    }
  }

  public getBlobDownloadUrl(blobId: string, name: string): string {
    return `/api/blob/${encodeURIComponent(blobId)}/${encodeURIComponent(name || "attachment")}`
  }

  public async saveDraft(params: {
    identityId?: string
    from?: { name?: string; email: string }
    to?: { name?: string; email: string }[]
    cc?: { name?: string; email: string }[]
    bcc?: { name?: string; email: string }[]
    subject?: string
    body?: string
    htmlBody?: string
    attachments?: { blobId: string; name: string; type: string; size: number }[]
  }): Promise<{ emailId: string }> {
    const draftMb = await this.getMailboxByRole("drafts")
    const draftMbId = draftMb?.id || "drafts"

    let emailId = `draft_${Date.now()}`
    try {
      const createRes = (await this.fetchLiveJmap("Email/set", {
        create: {
          draft1: {
            mailboxIds: { [draftMbId]: true },
            keywords: { $draft: true },
            from: params.from ? [params.from] : [],
            to: params.to || [],
            cc: params.cc || [],
            bcc: params.bcc || [],
            subject: params.subject || "(Draft)",
            bodyValues: {
              "1": {
                value: params.htmlBody || params.body || "",
              },
            },
            textBody: [{ partId: "1", type: params.htmlBody ? "text/html" : "text/plain", size: (params.htmlBody || params.body || "").length }],
          },
        },
      })) as { created?: Record<string, { id: string }> } | null

      if (createRes?.created?.draft1?.id) {
        emailId = createRes.created.draft1.id
      }
    } catch (e) {
      console.warn("Live draft save error:", e)
    }

    return { emailId }
  }

  public async getIdentities(): Promise<JmapIdentity[]> {
    try {
      const live = (await this.fetchLiveJmap("Identity/get", {})) as { list?: JmapIdentity[] } | null
      if (live?.list && live.list.length > 0) {
        this.identities = live.list
        return [...this.identities]
      }
    } catch {
      // offline fallback
    }

    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("postarc_user")
      if (stored) {
        try {
          const user = JSON.parse(stored)
          if (user.email) {
            return [
              {
                id: user.accountId || "id_user",
                name: user.username || user.email.split("@")[0] || "User",
                email: user.email,
                textSignature: "-- \nSent via Postarc Webmail",
                htmlSignature: "<div>-- <br>Sent via Postarc Webmail</div>",
                mayDelete: false,
              },
            ]
          }
        } catch {
          // ignore
        }
      }
    }

    return [...this.identities]
  }

  public async setIdentity(params: {
    create?: Record<string, Partial<JmapIdentity>>
    update?: Record<string, Partial<JmapIdentity>>
    destroy?: string[]
  }): Promise<void> {
    if (params.create) {
      for (const [, iData] of Object.entries(params.create)) {
        this.identities.push({
          id: `id_${Date.now()}`,
          name: iData.name || "User",
          email: iData.email || "user@example.com",
          textSignature: iData.textSignature || "",
          htmlSignature: iData.htmlSignature || "",
          mayDelete: true,
        })
      }
    }
  }

  public async getVacationResponse(): Promise<JmapVacationResponse | null> {
    this.loadFromStorage()
    try {
      const live = (await this.fetchLiveJmap("VacationResponse/get", {})) as {
        list?: JmapVacationResponse[]
      } | null
      if (live?.list && live.list.length > 0) {
        this.vacation = live.list[0]
        this.saveToStorage()
      }
    } catch {
      // offline fallback
    }
    return { ...this.vacation }
  }

  public async setVacationResponse(updates: Partial<JmapVacationResponse>): Promise<void> {
    this.vacation = { ...this.vacation, ...updates }
    this.saveToStorage()
    try {
      await this.fetchLiveJmap("VacationResponse/set", {
        update: {
          singleton: updates,
        },
      })
    } catch {
      // offline fallback
    }
  }

  public async getQuota(): Promise<JmapQuota | null> {
    try {
      const live = (await this.fetchLiveJmap("Quota/get", {})) as { list?: JmapQuota[] } | null
      if (live?.list && live.list.length > 0) {
        this.quota = live.list[0]
      }
    } catch {
      // offline fallback
    }
    return { ...this.quota }
  }

  public async getCalendarEvents(): Promise<JmapCalendarEvent[]> {
    this.loadFromStorage()
    try {
      const live = (await this.fetchLiveJmap("CalendarEvent/get", {})) as { list?: JmapCalendarEvent[] } | null
      if (live?.list) {
        this.events = live.list
        this.saveToStorage()
      }
    } catch {
      // offline fallback
    }
    return [...this.events]
  }

  public async setCalendarEvents(params: {
    create?: Record<string, Partial<JmapCalendarEvent>>
    update?: Record<string, Partial<JmapCalendarEvent>>
    destroy?: string[]
  }): Promise<void> {
    try {
      await this.fetchLiveJmap("CalendarEvent/set", params)
    } catch {
      // offline fallback
    }
    if (params.create) {
      for (const [id, evData] of Object.entries(params.create)) {
        this.events.push({
          id,
          title: evData.title || "New Event",
          start: evData.start || new Date().toISOString(),
          end: evData.end,
          description: evData.description,
          locations: evData.locations,
          categories: evData.categories,
        })
      }
    }
    if (params.destroy) {
      this.events = this.events.filter((e) => !params.destroy?.includes(e.id))
    }
    this.saveToStorage()
  }

  public async getContactCards(): Promise<JmapContactCard[]> {
    this.loadFromStorage()
    try {
      const live = (await this.fetchLiveJmap("ContactCard/get", {})) as { list?: JmapContactCard[] } | null
      if (live?.list) {
        this.contacts = live.list
        this.saveToStorage()
      }
    } catch {
      // offline fallback
    }
    return [...this.contacts]
  }

  public async setContactCards(params: {
    create?: Record<string, Partial<JmapContactCard>>
    update?: Record<string, Partial<JmapContactCard>>
    destroy?: string[]
  }): Promise<void> {
    try {
      await this.fetchLiveJmap("ContactCard/set", params)
    } catch {
      // offline fallback
    }
    if (params.create) {
      for (const [id, cData] of Object.entries(params.create)) {
        this.contacts.push({
          id,
          name: cData.name || { full: "New Contact" },
          emails: cData.emails,
          phones: cData.phones,
          organizations: cData.organizations,
          categories: cData.categories,
        })
      }
    }
    if (params.destroy) {
      this.contacts = this.contacts.filter((c) => !params.destroy?.includes(c.id))
    }
    this.saveToStorage()
  }

  public async request(jmapReq: JmapRequest): Promise<JmapResponse> {
    return {
      methodResponses: [],
      sessionState: "1",
    }
  }
}

export const postarcClient = new PostarcClient()

