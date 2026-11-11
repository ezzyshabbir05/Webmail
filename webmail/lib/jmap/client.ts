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

const INITIAL_EMAILS: JmapEmail[] = [
  {
    id: "msg_elena_roadmap",
    blobId: "blob_elena",
    threadId: "msg_elena_roadmap",
    mailboxIds: { inbox: true, mb_projects: true },
    keywords: { $flagged: true },
    size: 24576,
    receivedAt: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
    from: [{ name: "Elena Rostova", email: "elena.rostova@agilique.com" }],
    to: [{ name: "Postarc Team", email: "team@agilique.com" }],
    subject: "Q4 Engineering Roadmap & Postarc Architecture Milestone",
    preview: "Hey team, I've reviewed the latest architecture specs and the Astryx UI implementation. Everything looks solid...",
    bodyValues: {
      body1: {
        value: `Hi team,

I wanted to share our Q4 engineering roadmap update. The transition to the standalone Astryx design system and our high-performance frontend architecture is progressing ahead of schedule.

Key Milestones:
1. Pure Frontend Webmail Client: Fully decoupled, zero external server bottlenecks.
2. Astryx Design System Adherence: Token-backed layouts, dark/light theme persistence, responsive multi-pane layout.
3. Interactive Performance: Sub-millisecond state updates, thread conversation view, and zero layout shift.

Please review the attached PDF roadmap document and let me know your thoughts before our sync tomorrow at 10 AM.

Best regards,
Elena Rostova
VP of Engineering | Agilique`,
        isEncodingProblem: false,
        isTruncated: false,
      },
    },
    textBody: [{ partId: "body1", type: "text/plain", size: 1024 }],
    attachments: [
      {
        partId: "att_1",
        blobId: "blob_pdf_roadmap",
        size: 1468006,
        name: "Q4_Engineering_Roadmap.pdf",
        type: "application/pdf",
      },
    ],
  },
  {
    id: "msg_astryx_welcome",
    blobId: "blob_astryx",
    threadId: "msg_astryx_welcome",
    mailboxIds: { inbox: true },
    keywords: {},
    size: 18432,
    receivedAt: new Date(Date.now() - 1000 * 60 * 55).toISOString(),
    from: [{ name: "Astryx Design System", email: "hello@astryxdesign.org" }],
    to: [{ name: "Postarc User", email: "admin@agilique.com" }],
    subject: "Welcome to Astryx Component Library & Postarc UI System",
    preview: "Welcome to your new modern webmail experience built with 100% token-backed components and responsive layouts...",
    bodyValues: {
      body1: {
        value: `Welcome to Postarc Webmail!

This client is built with Astryx Design System — crafted for high density, accessible, and themeable web applications.

Design Principles:
- Layout & Spacing: Structured using VStack, HStack, AppShell, and Toolbar components.
- Data Presentation: High-density rows with Token counts and structured metadata.
- Theme System: Seamless dark and light modes driven by CSS variables and semantic design tokens.

Feel free to customize your folders, filter your threads, and explore the keyboard shortcuts!

Happy emailing!
The Astryx Team`,
        isEncodingProblem: false,
        isTruncated: false,
      },
    },
    textBody: [{ partId: "body1", type: "text/plain", size: 1024 }],
  },
  {
    id: "msg_github_security",
    blobId: "blob_github",
    threadId: "msg_github_security",
    mailboxIds: { inbox: true },
    keywords: {},
    size: 12288,
    receivedAt: new Date(Date.now() - 1000 * 60 * 130).toISOString(),
    from: [{ name: "GitHub Security", email: "security@github.com" }],
    to: [{ name: "Admin", email: "admin@agilique.com" }],
    subject: "[Security Alert] Token permissions updated for @agilique/postarc-webmail",
    preview: "A personal access token was successfully rotated and scoped for repository access. No further action is required...",
    bodyValues: {
      body1: {
        value: `Security Notification

A personal access token (fine-grained) associated with your organization was rotated at ${new Date().toLocaleDateString()}.

Repository: agilique/postarc-webmail
Permissions: Contents (Read & Write), Actions (Read)
IP Address: 187.127.171.46

If you authorized this change, you do not need to take any action. If this was not you, please visit your security settings immediately.

GitHub Security Operations`,
        isEncodingProblem: false,
        isTruncated: false,
      },
    },
    textBody: [{ partId: "body1", type: "text/plain", size: 1024 }],
  },
  {
    id: "msg_cloudflare_dns",
    blobId: "blob_cf",
    threadId: "msg_cloudflare_dns",
    mailboxIds: { inbox: true },
    keywords: { $seen: true },
    size: 15360,
    receivedAt: new Date(Date.now() - 1000 * 60 * 320).toISOString(),
    from: [{ name: "Cloudflare Status", email: "notifications@cloudflare.com" }],
    to: [{ name: "Admin", email: "admin@agilique.com" }],
    subject: "Domain DNS & SSL Certificate Status for agilique.com",
    preview: "Universal SSL edge certificate has been provisioned and active for mail.agilique.com. Zero Trust security enabled...",
    bodyValues: {
      body1: {
        value: `Cloudflare Status Report

Your domain agilique.com has completed certificate provisioning:
- Hostname: mail.agilique.com
- Status: Active (Proxied)
- SSL/TLS: Full (Strict)
- HTTP/3 (QUIC): Enabled

All edge nodes are responding normally with 100% uptime over the past 30 days.`,
        isEncodingProblem: false,
        isTruncated: false,
      },
    },
    textBody: [{ partId: "body1", type: "text/plain", size: 1024 }],
  },
  {
    id: "msg_figma_digest",
    blobId: "blob_figma",
    threadId: "msg_figma_digest",
    mailboxIds: { inbox: true },
    keywords: { $seen: true },
    size: 16384,
    receivedAt: new Date(Date.now() - 1000 * 60 * 600).toISOString(),
    from: [{ name: "Figma Community", email: "news@figma.com" }],
    to: [{ name: "Design Team", email: "admin@agilique.com" }],
    subject: "New Design Tokens & UI Kits available in the Community",
    preview: "Explore this week's trending design systems, icons, and layout kits for web developers and designers...",
    bodyValues: {
      body1: {
        value: `This Week in Figma Community:

Check out the top community files curated for frontend developers:
- Dark Mode Tokens Kit (kaTeX + Tailwind tokens)
- Email Client Layout Blueprints (Gmail, Outlook, Superhuman inspired)
- Vector Icon Packs for Product Management

Open Figma to duplicate any file directly into your workspace.`,
        isEncodingProblem: false,
        isTruncated: false,
      },
    },
    textBody: [{ partId: "body1", type: "text/plain", size: 1024 }],
  },
  {
    id: "msg_hackernews_top",
    blobId: "blob_hn",
    threadId: "msg_hackernews_top",
    mailboxIds: { inbox: true },
    keywords: { $seen: true },
    size: 14336,
    receivedAt: new Date(Date.now() - 1000 * 60 * 950).toISOString(),
    from: [{ name: "Hacker News Digest", email: "digest@hackernews.com" }],
    to: [{ name: "Tech Enthusiast", email: "admin@agilique.com" }],
    subject: "Top Tech Stories: Modern Web Frameworks & Rust in Production",
    preview: "Here are the top discussion threads and engineering blogs from today: Rust memory safety, Next.js 16 features...",
    bodyValues: {
      body1: {
        value: `Top Stories Today on Hacker News:

1. Building High-Performance Webmail with Next.js & Astryx (342 points, 128 comments)
2. Why SQLite WAL Mode is All You Need for Most Workloads (512 points, 245 comments)
3. Zero-Allocation MIME Parsing in Modern Systems Programming (189 points, 47 comments)
4. Designing Accessible Component Libraries from the Ground Up (275 points, 88 comments)

Visit news.ycombinator.com to join the discussion.`,
        isEncodingProblem: false,
        isTruncated: false,
      },
    },
    textBody: [{ partId: "body1", type: "text/plain", size: 1024 }],
  },
  {
    id: "msg_sent_proposal",
    blobId: "blob_sent_1",
    threadId: "msg_sent_proposal",
    mailboxIds: { sent: true },
    keywords: { $seen: true },
    size: 12288,
    receivedAt: new Date(Date.now() - 1000 * 60 * 1440).toISOString(),
    from: [{ name: "Admin", email: "admin@agilique.com" }],
    to: [{ name: "Elena Rostova", email: "elena.rostova@agilique.com" }],
    subject: "Re: Q4 Engineering Roadmap & Postarc Architecture Milestone",
    preview: "Thanks Elena! The frontend is now fully standalone and using Astryx components cleanly...",
    bodyValues: {
      body1: {
        value: `Hi Elena,

Thanks for sharing the roadmap. I've reviewed the architecture milestones and verified that the frontend is now 100% decoupled and running smoothly.

Looking forward to the sync tomorrow.

Best,
Admin`,
        isEncodingProblem: false,
        isTruncated: false,
      },
    },
    textBody: [{ partId: "body1", type: "text/plain", size: 1024 }],
  },
  {
    id: "msg_sent_expenses",
    blobId: "blob_sent_2",
    threadId: "msg_sent_expenses",
    mailboxIds: { sent: true },
    keywords: { $seen: true },
    size: 10240,
    receivedAt: new Date(Date.now() - 1000 * 60 * 2880).toISOString(),
    from: [{ name: "Admin", email: "admin@agilique.com" }],
    to: [{ name: "Finance Team", email: "finance@agilique.com" }],
    subject: "Approved: November Infrastructure & Tooling Expenses",
    preview: "All infrastructure costs and tooling licenses for this quarter are approved. Please proceed with disbursement...",
    bodyValues: {
      body1: {
        value: `Hi Finance Team,

The infrastructure budget for this month has been reviewed and approved.

Items:
- VPS Hosting & Edge Compute
- DNS & Security Services
- Developer Licenses & Design Tools

Regards,
Admin`,
        isEncodingProblem: false,
        isTruncated: false,
      },
    },
    textBody: [{ partId: "body1", type: "text/plain", size: 1024 }],
  },
  {
    id: "msg_draft_release_notes",
    blobId: "blob_draft_1",
    threadId: "msg_draft_release_notes",
    mailboxIds: { drafts: true },
    keywords: { $seen: true },
    size: 8192,
    receivedAt: new Date(Date.now() - 1000 * 60 * 720).toISOString(),
    from: [{ name: "Admin", email: "admin@agilique.com" }],
    to: [{ name: "Engineering All", email: "team@agilique.com" }],
    subject: "Draft: Release Notes for Postarc Webmail v1.0",
    preview: "We are excited to announce the initial release of Postarc Webmail featuring pure Astryx UI, dark mode...",
    bodyValues: {
      body1: {
        value: `Postarc Webmail v1.0 Release Notes

Highlights:
- Pure Frontend Architecture built with Next.js and Astryx Design System
- Full JMAP RFC 8620 / 8621 compatibility
- Integrated Calendar, Contacts, Filter rules, and comprehensive Settings
- Real-time client state management and dark mode theme switching`,
        isEncodingProblem: false,
        isTruncated: false,
      },
    },
    textBody: [{ partId: "body1", type: "text/plain", size: 1024 }],
  },
  {
    id: "msg_archive_invoice",
    blobId: "blob_invoice",
    threadId: "msg_archive_invoice",
    mailboxIds: { archive: true, mb_finance: true },
    keywords: { $seen: true, $flagged: true },
    size: 92160,
    receivedAt: new Date(Date.now() - 1000 * 60 * 4320).toISOString(),
    from: [{ name: "Stripe Billing", email: "invoices@stripe.com" }],
    to: [{ name: "Accounts Payable", email: "admin@agilique.com" }],
    subject: "Receipt for your subscription payment #INV-88291",
    preview: "Your subscription payment was successfully processed. Thank you for using our services...",
    bodyValues: {
      body1: {
        value: `Receipt from Stripe

Invoice: #INV-88291
Date: November 1, 2026
Amount: $120.00 USD
Status: Paid

Please find the detailed invoice PDF attached for your records.`,
        isEncodingProblem: false,
        isTruncated: false,
      },
    },
    textBody: [{ partId: "body1", type: "text/plain", size: 1024 }],
    attachments: [
      {
        partId: "att_inv",
        blobId: "blob_pdf_inv",
        size: 84920,
        name: "Invoice_INV-88291.pdf",
        type: "application/pdf",
      },
    ],
  },
  {
    id: "msg_spam_promo",
    blobId: "blob_spam",
    threadId: "msg_spam_promo",
    mailboxIds: { spam: true },
    keywords: {},
    size: 14336,
    receivedAt: new Date(Date.now() - 1000 * 60 * 1800).toISOString(),
    from: [{ name: "Bulk Domains Promo", email: "deals@bulkmailer-promo.net" }],
    to: [{ name: "Admin", email: "admin@agilique.com" }],
    subject: "Special Discount: 90% off bulk domain registrations",
    preview: "Exclusive weekend promo for high-volume domain registrations across top level domains...",
    bodyValues: {
      body1: {
        value: `Claim your 90% discount on new domain names today! Limited time offer for developer bundles.`,
        isEncodingProblem: false,
        isTruncated: false,
      },
    },
    textBody: [{ partId: "body1", type: "text/plain", size: 1024 }],
  },
  {
    id: "msg_trash_resolved",
    blobId: "blob_trash",
    threadId: "msg_trash_resolved",
    mailboxIds: { trash: true },
    keywords: { $seen: true },
    size: 7168,
    receivedAt: new Date(Date.now() - 1000 * 60 * 5000).toISOString(),
    from: [{ name: "Automated Monitor", email: "noreply@legacy-monitor.org" }],
    to: [{ name: "Admin", email: "admin@agilique.com" }],
    subject: "Old server monitor notice (Resolved)",
    preview: "This issue has been closed and resolved automatically by the health checking daemon...",
    bodyValues: {
      body1: {
        value: `Notification: Service latency restored to normal levels. Ticket has been automatically resolved.`,
        isEncodingProblem: false,
        isTruncated: false,
      },
    },
    textBody: [{ partId: "body1", type: "text/plain", size: 1024 }],
  },
]

const INITIAL_IDENTITIES: JmapIdentity[] = [
  {
    id: "id_admin",
    name: "Admin",
    email: "admin@agilique.com",
    replyTo: [{ name: "Admin", email: "admin@agilique.com" }],
    textSignature: "-- \nPostarc Webmail | Agilique",
    htmlSignature: "<p>--<br/><strong>Postarc Webmail</strong> | Agilique</p>",
    mayDelete: false,
  },
]

const INITIAL_CONTACTS: JmapContactCard[] = [
  {
    id: "c1",
    name: { full: "Elena Rostova", given: "Elena", surname: "Rostova" },
    emails: { primary: { address: "elena.rostova@agilique.com" } },
    phones: { primary: { number: "+1-555-0192" } },
    organizations: { primary: { name: "Agilique", title: "VP of Engineering" } },
  },
  {
    id: "c2",
    name: { full: "Marcus Vance", given: "Marcus", surname: "Vance" },
    emails: { primary: { address: "marcus.vance@agilique.com" } },
    phones: { primary: { number: "+1-555-0144" } },
    organizations: { primary: { name: "Agilique", title: "Staff Frontend Architect" } },
  },
  {
    id: "c3",
    name: { full: "Sarah Chen", given: "Sarah", surname: "Chen" },
    emails: { primary: { address: "sarah.chen@agilique.com" } },
    phones: { primary: { number: "+1-555-0188" } },
    organizations: { primary: { name: "Agilique", title: "Principal Product Designer" } },
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
      p1: { name: "Elena Rostova", email: "elena.rostova@agilique.com" },
      p2: { name: "Admin", email: "admin@agilique.com" },
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
      p1: { name: "Sarah Chen", email: "sarah.chen@agilique.com" },
      p2: { name: "Admin", email: "admin@agilique.com" },
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
      p1: { name: "Team", email: "team@agilique.com" },
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
    const emailId = `msg_out_${Date.now()}`
    const submissionId = `sub_${Date.now()}`

    const newEmail: JmapEmail = {
      id: emailId,
      blobId: emailId,
      threadId: emailId,
      mailboxIds: { sent: true },
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
      textBody: [{ partId: "body1", type: "text/plain", size: 1024 }],
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
          email: iData.email || "user@agilique.com",
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
