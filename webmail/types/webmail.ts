export interface EmailAttachment {
  id: string
  name: string
  size: string
  type: "pdf" | "spreadsheet" | "image" | "archive" | "document" | "binary"
  downloadUrl?: string
}

export type EmailCategory = "primary" | "promotions" | "social" | "updates"
export type EmailFolder =
  | "inbox"
  | "starred"
  | "snoozed"
  | "sent"
  | "drafts"
  | "archive"
  | "spam"
  | "trash"
  | string

export interface ThreadMessage {
  id: string
  senderName: string
  senderEmail: string
  recipientEmail: string
  ccEmails?: string[]
  replyToEmail?: string
  body: string
  htmlBody?: string
  timestamp: string
  fullDate: string
  isoDate?: string
  isStarred?: boolean
  mailedBy?: string
  signedBy?: string
  security?: string
  rawHeaders?: string
  attachments?: EmailAttachment[]
  isFromMe?: boolean
  senderAvatar?: string
  isVerified?: boolean
  hasRemoteImages?: boolean
  remoteImagesAllowed?: boolean
  spfStatus?: "pass" | "fail" | "neutral"
  dkimStatus?: "pass" | "fail" | "none"
  dmarcStatus?: "pass" | "fail" | "none"
  pgpSignatureStatus?: "valid" | "invalid" | "unverified" | "none"
}

export interface CustomMailboxFolder {
  id: string
  name: string
  parentId?: string
  color?: string
  totalCount: number
  unreadCount: number
}

export interface EmailThread extends Record<string, unknown> {
  id: string
  senderName: string
  senderAvatar?: string
  isVerified?: boolean
  senderEmail: string
  recipientEmail: string
  ccEmails?: string[]
  replyToEmail?: string
  subject: string
  snippet: string
  body: string
  htmlBody?: string
  timestamp: string
  fullDate: string
  isoDate?: string
  category: EmailCategory
  folder: EmailFolder
  isUnread: boolean
  isStarred: boolean
  threadCount?: number
  label?: "Clients" | "Invoices" | "Personal" | "Work" | string
  labelColor?: string
  hasRemoteImages?: boolean
  remoteImagesAllowed?: boolean
  attachments?: EmailAttachment[]
  messages?: ThreadMessage[]
}

export interface MailIdentity {
  id: string
  name: string
  email: string
  replyTo?: string
  bcc?: string
  htmlSignature?: string
  textSignature?: string
  isDefault: boolean
}

export interface CannedResponse {
  id: string
  title: string
  subject?: string
  body: string
  category?: string
  updatedAt: string
}

export interface MailContact extends Record<string, unknown> {
  id: string
  name: string
  email: string
  phone?: string
  company?: string
  jobTitle?: string
  group: "Personal" | "Work" | "Clients" | "Favorites"
  avatarUrl?: string
}

export interface CalendarEvent {
  id: string
  title: string
  start: string
  end: string
  allDay?: boolean
  category: "Work" | "Personal" | "Meeting" | "Important"
  location?: string
  description?: string
}

export interface SieveFilterRule {
  id: string
  name: string
  isEnabled: boolean
  conditionField: "from" | "to" | "subject" | "body"
  conditionOperator: "contains" | "equals" | "starts_with" | "ends_with"
  conditionValue: string
  actionType: "move_to_folder" | "mark_flagged" | "mark_read" | "discard" | "forward_to"
  actionTarget?: string
}

export interface QuotaInfo {
  usedBytes: number
  totalBytes: number
  percent: number
}
