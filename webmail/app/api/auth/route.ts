import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"

const DEFAULT_SERVER_URL = process.env.POSTARC_SERVER_URL || "http://127.0.0.1:8080"

export async function POST(req: NextRequest) {
  try {
    const { email, password, serverUrl } = await req.json()

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      )
    }

    const cleanEmail = String(email).trim().toLowerCase()
    const cleanPassword = String(password).trim()
    const targetUrl = (serverUrl && String(serverUrl).trim()) || DEFAULT_SERVER_URL
    const basicAuth = Buffer.from(`${cleanEmail}:${cleanPassword}`).toString("base64")

    console.log(`[AUTH] Attempting login for "${cleanEmail}" against "${targetUrl}/jmap/session"`)

    // Attempt to authenticate against Postarc Mailserver direct JMAP session endpoint
    const jmapSessionUrl = `${targetUrl}/jmap/session`
    let res = await fetch(jmapSessionUrl, {
      method: "GET",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        Accept: "application/json",
      },
    })

    console.log(`[AUTH] Mailserver /jmap/session response: ${res.status} ${res.statusText}`)

    if (res.status === 404) {
      // Fallback to .well-known/jmap
      console.log(`[AUTH] Falling back to ${targetUrl}/.well-known/jmap`)
      res = await fetch(`${targetUrl}/.well-known/jmap`, {
        method: "GET",
        headers: {
          Authorization: `Basic ${basicAuth}`,
          Accept: "application/json",
        },
      })
      console.log(`[AUTH] /.well-known/jmap response: ${res.status} ${res.statusText}`)
    }

    if (!res.ok && res.status !== 404) {
      // If unauthorized or error from mailserver
      return NextResponse.json(
        { error: `Authentication failed: ${res.statusText || "Invalid credentials"}` },
        { status: res.status === 401 ? 401 : 502 }
      )
    }

    let sessionData: unknown = null
    if (res.ok) {
      sessionData = await res.json()
    } else {
      // Fallback probe to /jmap directly
      const probeRes = await fetch(`${targetUrl}/jmap`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${basicAuth}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          using: ["urn:ietf:params:jmap:core"],
          methodCalls: [],
        }),
      })

      if (!probeRes.ok) {
        return NextResponse.json(
          { error: `Authentication failed: ${probeRes.statusText || "Invalid credentials"}` },
          { status: probeRes.status === 401 ? 401 : 502 }
        )
      }
      sessionData = await probeRes.json()
    }

    // Extract genuine primary mail account ID from JMAP session data
    let accountId = "b"
    if (sessionData && typeof sessionData === "object") {
      const s = sessionData as Record<string, unknown>
      const primaryAccounts = s.primaryAccounts as Record<string, string> | undefined
      const accounts = s.accounts as Record<string, unknown> | undefined

      if (primaryAccounts?.["urn:ietf:params:jmap:mail"]) {
        accountId = primaryAccounts["urn:ietf:params:jmap:mail"]
      } else if (primaryAccounts?.["urn:ietf:params:jmap:submission"]) {
        accountId = primaryAccounts["urn:ietf:params:jmap:submission"]
      } else if (accounts && Object.keys(accounts).length > 0) {
        accountId = Object.keys(accounts)[0]
      }
    }

    console.log(`[AUTH] Authenticated "${cleanEmail}" with primary accountId "${accountId}"`)

    // Generate secure session payload
    const sessionToken = Buffer.from(
      JSON.stringify({
        email: cleanEmail,
        auth: basicAuth,
        serverUrl: targetUrl,
        accountId,
        session: sessionData,
        authenticatedAt: new Date().toISOString(),
      })
    ).toString("base64")

    const isHttps =
      req.nextUrl.protocol === "https:" ||
      req.headers.get("x-forwarded-proto") === "https"

    const cookieStore = await cookies()
    cookieStore.set("postarc_session", sessionToken, {
      httpOnly: true,
      secure: isHttps,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 days
    })

    return NextResponse.json({
      success: true,
      email: cleanEmail,
      accountId,
      serverUrl: targetUrl,
      session: sessionData,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal authentication error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function GET() {
  try {
    const cookieStore = await cookies()
    const sessionCookie = cookieStore.get("postarc_session")

    if (!sessionCookie?.value) {
      return NextResponse.json({ authenticated: false }, { status: 401 })
    }

    const decoded = JSON.parse(Buffer.from(sessionCookie.value, "base64").toString("utf-8"))
    return NextResponse.json({
      authenticated: true,
      email: decoded.email,
      accountId: decoded.accountId || "b",
      session: decoded.session || null,
      serverUrl: decoded.serverUrl,
    })
  } catch {
    return NextResponse.json({ authenticated: false }, { status: 401 })
  }
}

export async function DELETE() {
  const cookieStore = await cookies()
  cookieStore.delete("postarc_session")
  return NextResponse.json({ success: true, message: "Logged out" })
}
