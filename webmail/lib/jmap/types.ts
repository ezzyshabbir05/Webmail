/**
 * Postarc JMAP Protocol Definitions
 * Compliant with:
 * - RFC 8620 (JMAP Core)
 * - RFC 8621 (JMAP Mail)
 * - RFC 8622 (JMAP Vacation Response)
 * - RFC 8984 (JSCalendar)
 * - RFC 9553 (JSContact)
 */

export interface JmapSession {
  capabilities: Record<string, Record<string, unknown>>
  accounts: Record<string, JmapAccount>
  primaryAccounts: Record<string, string>
  username: string
  apiUrl: string
  downloadUrl: string
  uploadUrl: string
  eventSourceUrl: string
  state: string
}

export interface JmapAccount {
  name: string
  isPersonal: boolean
  isReadOnly: boolean
  accountCapabilities: Record<string, Record<string, unknown>>
}

export interface JmapRequest {
  using: string[]
  methodCalls: [string, Record<string, unknown>, string][]
  createdIds?: Record<string, string>
}

export interface JmapResponse {
  methodResponses: [string, Record<string, unknown>, string][]
  sessionState: string
  createdIds?: Record<string, string>
}

// Mailbox
export interface JmapMailbox {
  id: string
  name: string
  parentId: string | null
  role: string | null // "inbox" | "trash" | "sent" | "drafts" | "archive" | "spam" | "junk" | null
  sortOrder: number
  totalEmails: number
  unreadEmails: number
  totalThreads: number
  unreadThreads: number
  myRights: {
    mayReadItems: boolean
    mayAddItems: boolean
    mayRemoveItems: boolean
    maySetSeen: boolean
    maySetKeywords: boolean
    mayCreateChild: boolean
    mayRename: boolean
    mayDelete: boolean
    maySubmit: boolean
  }
  isSubscribed: boolean
}

// Email Address
export interface JmapEmailAddress {
  name?: string | null
  email: string
}

// Email Header
export interface JmapEmailHeader {
  name: string
  value: string
}

// Email Body Part
export interface JmapEmailBodyPart {
  partId?: string
  blobId?: string
  size: number
  headers?: JmapEmailHeader[]
  name?: string | null
  type: string
  charset?: string | null
  disposition?: string | null
  cid?: string | null
  subParts?: JmapEmailBodyPart[]
}

export interface JmapEmailBodyValue {
  value: string
  isEncodingProblem: boolean
  isTruncated: boolean
}

// Email
export interface JmapEmail {
  id: string
  blobId: string
  threadId: string
  mailboxIds: Record<string, boolean>
  keywords: Record<string, boolean> // "$seen", "$flagged", "$draft", "$answered"
  size: number
  receivedAt: string
  messageId?: string[]
  inReplyTo?: string[]
  references?: string[]
  sender?: JmapEmailAddress[]
  from?: JmapEmailAddress[]
  to?: JmapEmailAddress[]
  cc?: JmapEmailAddress[]
  bcc?: JmapEmailAddress[]
  replyTo?: JmapEmailAddress[]
  subject: string
  sentAt?: string
  hasAttachment?: boolean
  preview: string
  bodyValues?: Record<string, JmapEmailBodyValue>
  textBody?: JmapEmailBodyPart[]
  htmlBody?: JmapEmailBodyPart[]
  attachments?: JmapEmailBodyPart[]
  headers?: JmapEmailHeader[]
}

// Email Submission
export interface JmapEmailSubmission {
  id: string
  identityId: string
  emailId: string
  threadId: string
  envelope?: {
    mailFrom: JmapEmailAddress
    rcptTo: JmapEmailAddress[]
  }
  sendAt: string
  undoStatus: "pending" | "final" | "canceled"
  deliveryStatus?: Record<string, {
    smtpResponse: string
    queued: string
    delivered?: string
    undelivered?: string
  }>
}

// Identity
export interface JmapIdentity {
  id: string
  name: string
  email: string
  replyTo?: JmapEmailAddress[]
  bcc?: JmapEmailAddress[]
  textSignature: string
  htmlSignature: string
  mayDelete: boolean
}

// Vacation Response (RFC 8622)
export interface JmapVacationResponse {
  id: string
  isEnabled: boolean
  fromDate?: string | null
  toDate?: string | null
  subject?: string | null
  textBody?: string | null
  htmlBody?: string | null
}

// JSCalendar Event (RFC 8984)
export interface JmapCalendarEvent {
  id: string
  uid?: string
  title: string
  description?: string
  start: string
  duration?: string
  end?: string
  timeZone?: string
  locations?: Record<string, { name: string; description?: string }>
  status?: "confirmed" | "tentative" | "cancelled"
  categories?: Record<string, boolean>
  participants?: Record<string, {
    name?: string
    email?: string
    kind?: "individual" | "group" | "resource"
    roles?: Record<string, boolean>
  }>
}

// JSContact Card (RFC 9553)
export interface JmapContactCard {
  id: string
  uid?: string
  name?: {
    full?: string
    given?: string
    surname?: string
  }
  organizations?: Record<string, { name: string; title?: string }>
  emails?: Record<string, { address: string; contexts?: Record<string, boolean> }>
  phones?: Record<string, { number: string; contexts?: Record<string, boolean> }>
  addresses?: Record<string, { fullAddress?: string; country?: string }>
  categories?: Record<string, boolean>
}

// Quota
export interface JmapQuota {
  id: string
  name: string
  resourceType: "octets" | "count"
  used: number
  limit: number
  scope: "account" | "domain" | "global"
}
