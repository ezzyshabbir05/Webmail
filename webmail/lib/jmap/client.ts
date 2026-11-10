/**
 * Postarc JMAP Client SDK
 * Production client handling batching, back-references, streaming attachments,
 * and live synchronization with Postarc Mailserver.
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

export class PostarcClient {
  private session: JmapSession | null = null
  private accountId: string | null = null

  constructor(session?: JmapSession) {
    if (session) {
      this.session = session
      this.accountId = Object.keys(session.accounts)[0] || null
    }
  }

  public setSession(session: JmapSession) {
    this.session = session
    this.accountId = Object.keys(session.accounts)[0] || null
  }

  public getAccountId(): string {
    if (!this.accountId && this.session) {
      this.accountId = Object.keys(this.session.accounts)[0] || null
    }
    return this.accountId || "primary"
  }

  /**
   * Dispatches a raw JMAP batch request
   */
  public async request(jmapReq: JmapRequest): Promise<JmapResponse> {
    const res = await fetch("/api/jmap", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(jmapReq),
    })

    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`JMAP HTTP ${res.status}: ${errText}`)
    }

    return (await res.json()) as JmapResponse
  }

  /**
   * Fetches all mailboxes for the primary account
   */
  public async getMailboxes(): Promise<JmapMailbox[]> {
    const accountId = this.getAccountId()
    const response = await this.request({
      using: ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"],
      methodCalls: [
        [
          "Mailbox/get",
          {
            accountId,
            ids: null, // fetch all
          },
          "c0",
        ],
      ],
    })

    const [, result] = response.methodResponses[0] || []
    return (result?.list as JmapMailbox[]) || []
  }

  /**
   * Creates or updates a mailbox
   */
  public async setMailbox(params: {
    create?: Record<string, Partial<JmapMailbox>>
    update?: Record<string, Partial<JmapMailbox>>
    destroy?: string[]
  }): Promise<Record<string, unknown>> {
    const accountId = this.getAccountId()
    const response = await this.request({
      using: ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"],
      methodCalls: [
        [
          "Mailbox/set",
          {
            accountId,
            ...params,
          },
          "c0",
        ],
      ],
    })

    const [, result] = response.methodResponses[0] || []
    return result || {}
  }

  /**
   * Queries and retrieves emails for a specific folder / filter
   */
  public async getEmails(options: {
    mailboxId?: string
    keyword?: string
    searchQuery?: string
    limit?: number
    position?: number
  }): Promise<{ emails: JmapEmail[]; total: number }> {
    const accountId = this.getAccountId()
    const filter: Record<string, unknown> = {}

    if (options.mailboxId) {
      filter.inMailbox = options.mailboxId
    }
    if (options.keyword) {
      filter.hasKeyword = options.keyword
    }
    if (options.searchQuery) {
      filter.text = options.searchQuery
    }

    // Two-step batched JMAP call using back-references (#ids)
    const response = await this.request({
      using: ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"],
      methodCalls: [
        [
          "Email/query",
          {
            accountId,
            filter: Object.keys(filter).length > 0 ? filter : undefined,
            sort: [{ property: "receivedAt", isAscending: false }],
            limit: options.limit || 50,
            position: options.position || 0,
            calculateTotal: true,
          },
          "q0",
        ],
        [
          "Email/get",
          {
            accountId,
            "#ids": {
              resultOf: "q0",
              name: "Email/query",
              path: "/ids",
            },
            properties: [
              "id",
              "blobId",
              "threadId",
              "mailboxIds",
              "keywords",
              "size",
              "receivedAt",
              "from",
              "to",
              "cc",
              "bcc",
              "replyTo",
              "subject",
              "sentAt",
              "hasAttachment",
              "preview",
              "bodyValues",
              "textBody",
              "htmlBody",
              "attachments",
              "headers",
            ],
            bodyProperties: ["partId", "blobId", "size", "name", "type", "charset", "cid"],
            fetchTextBodyValues: true,
            fetchHTMLBodyValues: true,
          },
          "g0",
        ],
      ],
    })

    const [, queryResult] = response.methodResponses[0] || []
    const [, getResult] = response.methodResponses[1] || []

    return {
      emails: (getResult?.list as JmapEmail[]) || [],
      total: (queryResult?.total as number) || (getResult?.list as JmapEmail[])?.length || 0,
    }
  }

  /**
   * Updates email flags (keywords) or moves between mailboxes
   */
  public async setEmailProperties(
    emailId: string,
    updates: {
      keywords?: Record<string, boolean>
      mailboxIds?: Record<string, boolean>
    }
  ): Promise<void> {
    const accountId = this.getAccountId()
    await this.request({
      using: ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"],
      methodCalls: [
        [
          "Email/set",
          {
            accountId,
            update: {
              [emailId]: updates,
            },
          },
          "c0",
        ],
      ],
    })
  }

  /**
   * Deletes emails
   */
  public async destroyEmails(emailIds: string[]): Promise<void> {
    const accountId = this.getAccountId()
    await this.request({
      using: ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"],
      methodCalls: [
        [
          "Email/set",
          {
            accountId,
            destroy: emailIds,
          },
          "c0",
        ],
      ],
    })
  }

  /**
   * Sends an email via Email/set + EmailSubmission/set back-reference
   */
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
    const accountId = this.getAccountId()

    const bodyPartId = "body1"
    const response = await this.request({
      using: [
        "urn:ietf:params:jmap:core",
        "urn:ietf:params:jmap:mail",
        "urn:ietf:params:jmap:submission",
      ],
      methodCalls: [
        [
          "Email/set",
          {
            accountId,
            create: {
              draftMsg: {
                mailboxIds: {
                  // Will be placed into Sent once submitted by Postarc Mailserver
                  drafts: true,
                },
                keywords: {
                  $seen: true,
                },
                from: [params.from],
                to: params.to,
                cc: params.cc,
                bcc: params.bcc,
                replyTo: params.replyTo,
                subject: params.subject,
                sentAt: new Date().toISOString(),
                bodyValues: {
                  [bodyPartId]: {
                    value: params.htmlBody || params.body,
                    isEncodingProblem: false,
                    isTruncated: false,
                  },
                },
                textBody: !params.htmlBody
                  ? [
                      {
                        partId: bodyPartId,
                        type: "text/plain",
                      },
                    ]
                  : undefined,
                htmlBody: params.htmlBody
                  ? [
                      {
                        partId: bodyPartId,
                        type: "text/html",
                      },
                    ]
                  : undefined,
                attachments: params.attachments?.map((att) => ({
                  blobId: att.blobId,
                  name: att.name,
                  type: att.type,
                  size: att.size,
                })),
              },
            },
          },
          "createEmail",
        ],
        [
          "EmailSubmission/set",
          {
            accountId,
            onSuccessDestroyEmail: ["#createEmail/created/draftMsg/id"],
            create: {
              sendMsg: {
                identityId: params.identityId,
                emailId: "#createEmail/created/draftMsg/id",
                envelope: {
                  mailFrom: params.from,
                  rcptTo: [...params.to, ...(params.cc || []), ...(params.bcc || [])],
                },
              },
            },
          },
          "submitEmail",
        ],
      ],
    })

    const [, emailSetResult] = response.methodResponses[0] || []
    const [, submissionSetResult] = response.methodResponses[1] || []

    const emailId =
      (emailSetResult as { created?: Record<string, { id: string }> })?.created?.draftMsg?.id || ""
    const submissionId =
      (submissionSetResult as { created?: Record<string, { id: string }> })?.created?.sendMsg?.id || ""

    return { emailId, submissionId }
  }

  /**
   * Uploads an attachment to Postarc Mailserver (streamed to Cloudflare R2)
   */
  public async uploadAttachment(file: File): Promise<{ blobId: string; size: number; type: string }> {
    const formData = new FormData()
    formData.append("file", file)

    const res = await fetch("/api/jmap/blob", {
      method: "POST",
      body: formData,
    })

    if (!res.ok) {
      throw new Error(`Failed to upload attachment: ${res.statusText}`)
    }

    return await res.json()
  }

  /**
   * Retrieves identities
   */
  public async getIdentities(): Promise<JmapIdentity[]> {
    const accountId = this.getAccountId()
    const response = await this.request({
      using: [
        "urn:ietf:params:jmap:core",
        "urn:ietf:params:jmap:submission",
      ],
      methodCalls: [
        [
          "Identity/get",
          {
            accountId,
            ids: null,
          },
          "c0",
        ],
      ],
    })

    const [, result] = response.methodResponses[0] || []
    return (result?.list as JmapIdentity[]) || []
  }

  /**
   * Updates an identity
   */
  public async setIdentity(params: {
    create?: Record<string, Partial<JmapIdentity>>
    update?: Record<string, Partial<JmapIdentity>>
    destroy?: string[]
  }): Promise<void> {
    const accountId = this.getAccountId()
    await this.request({
      using: ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:submission"],
      methodCalls: [
        [
          "Identity/set",
          {
            accountId,
            ...params,
          },
          "c0",
        ],
      ],
    })
  }

  /**
   * Retrieves vacation auto-responder (RFC 8622)
   */
  public async getVacationResponse(): Promise<JmapVacationResponse | null> {
    const accountId = this.getAccountId()
    const response = await this.request({
      using: ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:vacationresponse"],
      methodCalls: [
        [
          "VacationResponse/get",
          {
            accountId,
            ids: ["singleton"],
          },
          "c0",
        ],
      ],
    })

    const [, result] = response.methodResponses[0] || []
    const list = (result?.list as JmapVacationResponse[]) || []
    return list[0] || null
  }

  /**
   * Updates vacation auto-responder (RFC 8622)
   */
  public async setVacationResponse(updates: Partial<JmapVacationResponse>): Promise<void> {
    const accountId = this.getAccountId()
    await this.request({
      using: ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:vacationresponse"],
      methodCalls: [
        [
          "VacationResponse/set",
          {
            accountId,
            update: {
              singleton: updates,
            },
          },
          "c0",
        ],
      ],
    })
  }

  /**
   * Retrieves Quota (RFC 9425)
   */
  public async getQuota(): Promise<JmapQuota | null> {
    const accountId = this.getAccountId()
    const response = await this.request({
      using: ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:quota"],
      methodCalls: [
        [
          "Quota/get",
          {
            accountId,
            ids: null,
          },
          "c0",
        ],
      ],
    })

    const [, result] = response.methodResponses[0] || []
    const list = (result?.list as JmapQuota[]) || []
    return list[0] || null
  }

  /**
   * JSCalendar Events (RFC 8984)
   */
  public async getCalendarEvents(): Promise<JmapCalendarEvent[]> {
    const accountId = this.getAccountId()
    const response = await this.request({
      using: ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:calendars"],
      methodCalls: [
        [
          "CalendarEvent/get",
          {
            accountId,
            ids: null,
          },
          "c0",
        ],
      ],
    })

    const [, result] = response.methodResponses[0] || []
    return (result?.list as JmapCalendarEvent[]) || []
  }

  public async setCalendarEvents(params: {
    create?: Record<string, Partial<JmapCalendarEvent>>
    update?: Record<string, Partial<JmapCalendarEvent>>
    destroy?: string[]
  }): Promise<void> {
    const accountId = this.getAccountId()
    await this.request({
      using: ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:calendars"],
      methodCalls: [
        [
          "CalendarEvent/set",
          {
            accountId,
            ...params,
          },
          "c0",
        ],
      ],
    })
  }

  /**
   * JSContact Cards (RFC 9553)
   */
  public async getContactCards(): Promise<JmapContactCard[]> {
    const accountId = this.getAccountId()
    const response = await this.request({
      using: ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:contacts"],
      methodCalls: [
        [
          "ContactCard/get",
          {
            accountId,
            ids: null,
          },
          "c0",
        ],
      ],
    })

    const [, result] = response.methodResponses[0] || []
    return (result?.list as JmapContactCard[]) || []
  }

  public async setContactCards(params: {
    create?: Record<string, Partial<JmapContactCard>>
    update?: Record<string, Partial<JmapContactCard>>
    destroy?: string[]
  }): Promise<void> {
    const accountId = this.getAccountId()
    await this.request({
      using: ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:contacts"],
      methodCalls: [
        [
          "ContactCard/set",
          {
            accountId,
            ...params,
          },
          "c0",
        ],
      ],
    })
  }
}

export const postarcClient = new PostarcClient()
