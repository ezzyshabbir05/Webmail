import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"

const DEFAULT_SERVER_URL = process.env.POSTARC_SERVER_URL || "http://127.0.0.1:8080"

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies()
    const sessionCookie = cookieStore.get("postarc_session")

    let authHeader = req.headers.get("Authorization")
    let targetServer = DEFAULT_SERVER_URL
    let accountId = "primary"

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
          accountId = decoded.email
        }
      } catch {
        // Fallback
      }
    }

    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const formData = await req.formData()
    const file = formData.get("file") as File | null

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    const arrayBuffer = await file.arrayBuffer()
    const uploadUrl = `${targetServer}/jmap/upload/${encodeURIComponent(accountId)}`

    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": file.type || "application/octet-stream",
      },
      body: arrayBuffer,
    })

    if (!response.ok) {
      return NextResponse.json(
        { error: `Blob upload to Postarc failed: ${response.statusText}` },
        { status: response.status }
      )
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Blob Gateway Error"
    return NextResponse.json({ error: message }, { status: 502 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies()
    const sessionCookie = cookieStore.get("postarc_session")

    let authHeader = req.headers.get("Authorization")
    let targetServer = DEFAULT_SERVER_URL
    let accountId = "primary"

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
          accountId = decoded.email
        }
      } catch {
        // Fallback
      }
    }

    const { searchParams } = new URL(req.url)
    const blobId = searchParams.get("blobId")
    const name = searchParams.get("name") || "attachment"
    const type = searchParams.get("type") || "application/octet-stream"

    if (!blobId) {
      return NextResponse.json({ error: "blobId is required" }, { status: 400 })
    }

    const downloadUrl = `${targetServer}/jmap/download/${encodeURIComponent(
      accountId
    )}/${encodeURIComponent(blobId)}/${encodeURIComponent(name)}`

    const response = await fetch(downloadUrl, {
      method: "GET",
      headers: authHeader ? { Authorization: authHeader } : {},
    })

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to stream attachment: ${response.statusText}` },
        { status: response.status }
      )
    }

    const headers = new Headers()
    headers.set("Content-Type", type)
    headers.set("Content-Disposition", `attachment; filename="${name}"`)

    const blob = await response.blob()
    return new NextResponse(blob, {
      status: 200,
      headers,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Blob Download Error"
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
