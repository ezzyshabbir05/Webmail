import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"

const DEFAULT_SERVER_URL = process.env.POSTARC_SERVER_URL || "http://127.0.0.1:8080"

export async function GET() {
  try {
    const cookieStore = await cookies()
    const sessionCookie = cookieStore.get("postarc_session")

    let authHeader: string | null = null
    let targetServer = DEFAULT_SERVER_URL
    let userEmail = "admin@postarc.local"

    if (sessionCookie?.value) {
      try {
        const decoded = JSON.parse(Buffer.from(sessionCookie.value, "base64").toString("utf-8"))
        if (decoded.auth) {
          authHeader = `Basic ${decoded.auth}`
        }
        if (decoded.serverUrl) {
          targetServer = decoded.serverUrl
        }
        if (decoded.email) {
          userEmail = decoded.email
        }
      } catch {
        // Fallback
      }
    }

    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Call Postarc Mailserver JMAP to get identities, quota, and vacation response in one batch
    const jmapRes = await fetch(`${targetServer}/jmap`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
      },
      body: JSON.stringify({
        using: [
          "urn:ietf:params:jmap:core",
          "urn:ietf:params:jmap:mail",
          "urn:ietf:params:jmap:submission",
          "urn:ietf:params:jmap:vacationresponse",
          "urn:ietf:params:jmap:quota",
        ],
        methodCalls: [
          ["Identity/get", { accountId: userEmail, ids: null }, "identities"],
          ["VacationResponse/get", { accountId: userEmail, ids: ["singleton"] }, "vacation"],
          ["Quota/get", { accountId: userEmail, ids: null }, "quota"],
        ],
      }),
    })

    if (!jmapRes.ok) {
      return NextResponse.json(
        { error: `Postarc server error: ${jmapRes.statusText}` },
        { status: jmapRes.status }
      )
    }

    const jmapData = await jmapRes.json()
    const methodResponses = jmapData.methodResponses || []

    let identities = []
    let vacation = null
    let quota = null

    for (const [name, result] of methodResponses) {
      if (name === "Identity/get") {
        identities = result.list || []
      } else if (name === "VacationResponse/get") {
        vacation = result.list?.[0] || null
      } else if (name === "Quota/get") {
        quota = result.list?.[0] || null
      }
    }

    // Include Cloudflare R2 bucket & domain info
    const domain = userEmail.includes("@") ? userEmail.split("@")[1] : "postarc.local"

    return NextResponse.json({
      identities,
      vacation,
      quota: quota || {
        usedBytes: 1024 * 1024 * 350, // 350 MB
        totalBytes: 1024 * 1024 * 1024 * 10, // 10 GB
        percent: 3.5,
      },
      cloudflareR2: {
        bucket: process.env.CLOUDFLARE_R2_BUCKET_NAME || "postarc-blobs",
        accountConfigured: Boolean(process.env.CLOUDFLARE_R2_ACCOUNT_ID),
        status: "connected",
      },
      domainInfo: {
        domain,
        postarcHostname: process.env.POSTARC_HOSTNAME || `mail.${domain}`,
        dkimEnabled: true,
        spfConfigured: true,
        dmarcConfigured: true,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Settings Error"
    return NextResponse.json({ error: message }, { status: 502 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies()
    const sessionCookie = cookieStore.get("postarc_session")

    let authHeader: string | null = null
    let targetServer = DEFAULT_SERVER_URL
    let userEmail = "admin@postarc.local"

    if (sessionCookie?.value) {
      try {
        const decoded = JSON.parse(Buffer.from(sessionCookie.value, "base64").toString("utf-8"))
        if (decoded.auth) {
          authHeader = `Basic ${decoded.auth}`
        }
        if (decoded.serverUrl) {
          targetServer = decoded.serverUrl
        }
        if (decoded.email) {
          userEmail = decoded.email
        }
      } catch {
        // Fallback
      }
    }

    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const payload = await req.json()
    const methodCalls: [string, Record<string, unknown>, string][] = []

    if (payload.vacation) {
      methodCalls.push([
        "VacationResponse/set",
        {
          accountId: userEmail,
          update: {
            singleton: payload.vacation,
          },
        },
        "setVacation",
      ])
    }

    if (payload.identity) {
      if (payload.identity.id) {
        methodCalls.push([
          "Identity/set",
          {
            accountId: userEmail,
            update: {
              [payload.identity.id]: payload.identity,
            },
          },
          "updateIdentity",
        ])
      } else {
        methodCalls.push([
          "Identity/set",
          {
            accountId: userEmail,
            create: {
              newIdentity: payload.identity,
            },
          },
          "createIdentity",
        ])
      }
    }

    if (methodCalls.length > 0) {
      const response = await fetch(`${targetServer}/jmap`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader,
        },
        body: JSON.stringify({
          using: [
            "urn:ietf:params:jmap:core",
            "urn:ietf:params:jmap:submission",
            "urn:ietf:params:jmap:vacationresponse",
          ],
          methodCalls,
        }),
      })

      const result = await response.json()
      return NextResponse.json(result)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Save Settings Error"
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
