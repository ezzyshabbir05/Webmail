import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"

const DEFAULT_SERVER_URL = process.env.POSTARC_SERVER_URL || "http://127.0.0.1:8080"

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies()
    const sessionCookie = cookieStore.get("postarc_session")

    let authHeader = req.headers.get("Authorization")
    let targetServer = DEFAULT_SERVER_URL

    if (sessionCookie?.value) {
      try {
        const decoded = JSON.parse(Buffer.from(sessionCookie.value, "base64").toString("utf-8"))
        if (decoded.auth) {
          authHeader = `Basic ${decoded.auth}`
        }
        if (decoded.serverUrl) {
          targetServer = decoded.serverUrl
        }
      } catch {
        // Session decode failure
      }
    }

    if (!authHeader) {
      return NextResponse.json(
        { error: "Unauthorized - No Postarc session found" },
        { status: 401 }
      )
    }

    const body = await req.json()
    const targetUrl = `${targetServer}/jmap`

    const response = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
      },
      body: JSON.stringify(body),
    })

    const data = await response.json()
    return NextResponse.json(data, { status: response.status })
  } catch (error) {
    const message = error instanceof Error ? error.message : "JMAP Gateway Error"
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
