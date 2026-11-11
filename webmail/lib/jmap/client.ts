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
    totalEmails: 6,
    unreadEmails: 3,
    totalThreads: 6,
    unreadThreads: 3,
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
    totalEmails: 2,
    unreadEmails: 1,
    totalThreads: 2,
    unreadThreads: 1,
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
    totalEmails: 2,
    unreadEmails: 0,
    totalThreads: 2,
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
    totalEmails: 1,
    unreadEmails: 0,
    totalThreads: 1,
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
    totalEmails: 2,
    unreadEmails: 0,
    totalThreads: 2,
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
    totalEmails: 1,
    unreadEmails: 1,
    totalThreads: 1,
    unreadThreads: 1,
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
    totalEmails: 1,
    unreadEmails: 0,
    totalThreads: 1,
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
    id: "mb_projects",
    name: "Engineering & Design",
    parentId: null,
    role: null,
    sortOrder: 8,
    totalEmails: 2,
    unreadEmails: 1,
    totalThreads: 2,
    unreadThreads: 1,
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
  },
  {
    id: "mb_finance",
    name: "Invoices & Billing",
    parentId: null,
    role: null,
    sortOrder: 9,
    totalEmails: 1,
    unreadEmails: 0,
    totalThreads: 1,
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
  },
]

const INITIAL_EMAILS: JmapEmail[] = []

const INITIAL_IDENTITIES: JmapIdentity[] = [
  {
    id: "id_admin",
    name: "Admin",
    email: "admin@example.com",
    replyTo: [{ name: "Admin", email: "admin@example.com" }],
    textSignature: "-- \nPostarc Webmail | Postarc",
    htmlSignature: "<p>--<br/><strong>Postarc Webmail</strong> | Postarc</p>",
    mayDelete: false,
  },
]

const INITIAL_CONTACTS: JmapContactCard[] = [
  {
    id: "c1",
    name: { full: "Elena Rostova", given: "Elena", surname: "Rostova" },
    emails: { primary: { address: "elena.rostova@example.com" } },
    phones: { primary: { number: "+1-555-0192" } },
    organizations: { primary: { name: "Postarc", title: "VP of Engineering" } },
  },
  {
    id: "c2",
    name: { full: "Marcus Vance", given: "Marcus", surname: "Vance" },
    emails: { primary: { address: "marcus.vance@example.com" } },
    phones: { primary: { number: "+1-555-0144" } },
    organizations: { primary: { name: "Postarc", title: "Staff Frontend Architect" } },
  },
  {
    id: "c3",
    name: { full: "Sarah Chen", given: "Sarah", surname: "Chen" },
    emails: { primary: { address: "sarah.chen@example.com" } },
    phones: { primary: { number: "+1-555-0188" } },
    organizations: { primary: { name: "Postarc", title: "Principal Product Designer" } },
  },
  {
    id: "c4",
    name: { full: "Astryx Support", given: "Astryx", surname: "Support" },
    emails: { primary: { address: "hello@astryxdesign.org" } },
    organizations: { primary: { name: "Astryx Project", title: "Design Systems Support" } },
  },
  {
    id: "c5",
    name: { full: "Stripe Billing", given: "Stripe", surname: "Billing" },
    emails: { primary: { address: "invoices@stripe.com" } },
    organizations: { primary: { name: "Stripe, Inc." } },
  },
]

const INITIAL_CALENDAR_EVENTS: JmapCalendarEvent[] = [
  {
    id: "ev1",
    title: "Q4 Product & Architecture Sync",
    start: new Date(Date.now() + 1000 * 60 * 60 * 2).toISOString(),
    duration: "PT1H",
    description: "Review Astryx design tokens, standalone frontend performance, and roadmap milestones.",
    locations: { loc1: { name: "Virtual Meeting (Google Meet)" } },
    participants: {
      p1: { name: "Elena Rostova", email: "elena.rostova@example.com" },
      p2: { name: "Admin", email: "admin@example.com" },
    },
  },
  {
    id: "ev2",
    title: "Design System Token Review",
    start: new Date(Date.now() + 1000 * 60 * 60 * 6).toISOString(),
    duration: "PT1H",
    description: "Review color contrast, dark mode elevation tokens, and button focus rings.",
    locations: { loc1: { name: "Design Room A" } },
    participants: {
      p1: { name: "Sarah Chen", email: "sarah.chen@example.com" },
      p2: { name: "Admin", email: "admin@example.com" },
    },
  },
  {
    id: "ev3",
    title: "Weekly Frontend Sprint Demo",
    start: new Date(Date.now() + 1000 * 60 * 60 * 28).toISOString(),
    duration: "PT1H",
    description: "Demonstration of pure frontend Postarc Webmail and Astryx components.",
    locations: { loc1: { name: "Main Auditorium" } },
    participants: {
      p1: { name: "Team", email: "team@example.com" },
    },
  },
]

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
      const res = await fetch(`${this.getBackendUrl()}/api/jmap`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          using: ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"],
          methodCalls: [[method, args, "c0"]],
        }),
      })
      if (!res.ok) return null
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
        for (const lmb of live.list) {
          const idx = this.mailboxes.findIndex(
            (m) => m.id === lmb.id || (m.role && m.role === lmb.role)
          )
          if (idx >= 0) {
            this.mailboxes[idx] = { ...this.mailboxes[idx], ...lmb }
          } else {
            this.mailboxes.push(lmb)
          }
        }
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
    const blobId = `blob_${Date.now()}_${encodeURIComponent(file.name)}`
    return {
      blobId,
      size: file.size,
      type: file.type || "application/octet-stream",
    }
  }

  public async getIdentities(): Promise<JmapIdentity[]> {
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
    return { ...this.vacation }
  }

  public async setVacationResponse(updates: Partial<JmapVacationResponse>): Promise<void> {
    this.vacation = { ...this.vacation, ...updates }
    this.saveToStorage()
  }

  public async getQuota(): Promise<JmapQuota | null> {
    return { ...this.quota }
  }

  public async getCalendarEvents(): Promise<JmapCalendarEvent[]> {
    this.loadFromStorage()
    return [...this.events]
  }

  public async setCalendarEvents(params: {
    create?: Record<string, Partial<JmapCalendarEvent>>
    update?: Record<string, Partial<JmapCalendarEvent>>
    destroy?: string[]
  }): Promise<void> {
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
    return [...this.contacts]
  }

  public async setContactCards(params: {
    create?: Record<string, Partial<JmapContactCard>>
    update?: Record<string, Partial<JmapContactCard>>
    destroy?: string[]
  }): Promise<void> {
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

