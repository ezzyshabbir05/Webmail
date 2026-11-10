import { NextRequest } from "next/server"
import { cookies } from "next/headers"

const DEFAULT_SERVER_URL = process.env.POSTARC_SERVER_URL || "http://127.0.0.1:8080"

export async function GET(req: NextRequest) {
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
      // Decode fallback
    }
  }

  if (!authHeader) {
    return new Response("Unauthorized", { status: 401 })
  }

  const eventsUrl = `${targetServer}/jmap/events`

  try {
    const upstream = await fetch(eventsUrl, {
      headers: {
        Authorization: authHeader,
        Accept: "text/event-stream",
      },
    })

    if (!upstream.ok || !upstream.body) {
      return new Response("Failed to connect to Postarc event stream", {
        status: upstream.status,
      })
    }

    return new Response(upstream.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Push stream error"
    return new Response(message, { status: 502 })
  }
}
