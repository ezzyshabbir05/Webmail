"use client"

import React, { useState, useEffect, useRef, useMemo } from "react"
import DOMPurify from "dompurify"
import { VStack, HStack } from "@astryxdesign/core/Layout"
import { IconButton } from "@astryxdesign/core/IconButton"
import { Ellipsis } from "lucide-react"

interface HtmlEmailViewerProps {
  html: string
  allowRemoteImages?: boolean
  isLightPaper?: boolean
  isDarkMode?: boolean
  attachments?: { blobId?: string; name?: string; partId?: string }[]
}

export function HtmlEmailViewer({
  html,
  allowRemoteImages = false,
  isLightPaper = false,
  isDarkMode = false,
  attachments = [],
}: HtmlEmailViewerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [iframeHeight, setIframeHeight] = useState<number>(200)
  const [showTrimmedQuote, setShowTrimmedQuote] = useState(false)

  // 1. Sanitize & Process HTML with CID Image Mapping & Remote Image Shield
  const { processedHtml, hasTrimmedQuote } = useMemo(() => {
    if (typeof window === "undefined" || !html) {
      return { processedHtml: "", hasTrimmedQuote: false }
    }

    const sanitized = DOMPurify.sanitize(html, {
      ADD_TAGS: ["style"],
      ADD_ATTR: ["target", "bgcolor", "color", "width", "height"],
      FORBID_TAGS: ["script", "iframe", "object", "embed", "form"],
      FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover"],
    })

    const parser = new DOMParser()
    const doc = parser.parseFromString(`<body>${sanitized}</body>`, "text/html")

    // Links open in new tab
    doc.querySelectorAll("a[href]").forEach((anchor) => {
      anchor.setAttribute("target", "_blank")
      anchor.setAttribute("rel", "noopener noreferrer")
    })

    // Resolve inline CID images (cid:...)
    doc.querySelectorAll("img[src]").forEach((img) => {
      const src = img.getAttribute("src") || ""
      if (src.toLowerCase().startsWith("cid:")) {
        const cid = src.slice(4).trim()
        const matchingAtt = attachments.find(
          (a) => a.partId === cid || a.name === cid || a.blobId === cid
        )
        if (matchingAtt && matchingAtt.blobId) {
          img.setAttribute(
            "src",
            `/api/blob/${encodeURIComponent(matchingAtt.blobId)}/${encodeURIComponent(
              matchingAtt.name || "image"
            )}`
          )
        }
      } else if (!allowRemoteImages && /^https?:\/\//i.test(src)) {
        img.setAttribute("data-blocked-src", src)
        img.removeAttribute("src")
        img.setAttribute("style", "display:none !important")
      }
    })

    // Trimmed quotes (.gmail_quote)
    const quoteNodes = Array.from(doc.querySelectorAll(".gmail_quote, blockquote.gmail_quote"))
    const detectedQuote = quoteNodes.length > 0
    if (!showTrimmedQuote) {
      quoteNodes.forEach((node) => node.remove())
    }

    return {
      processedHtml: doc.body.innerHTML,
      hasTrimmedQuote: detectedQuote,
    }
  }, [html, allowRemoteImages, showTrimmedQuote, attachments])

  // 2. Generate Iframe srcDoc with token-backed theme styles
  const srcDocContent = useMemo(() => {
    const isDark = isDarkMode && !isLightPaper
    const textColor = isDark ? "var(--token-color-text-primary, #e4e4e7)" : "var(--token-color-text-primary, #111827)"
    const linkColor = isDark ? "var(--token-color-primary, #60a5fa)" : "var(--token-color-primary, #2563eb)"
    const quoteBorder = isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.15)"
    const quoteText = isDark ? "var(--token-color-text-secondary, #a1a1aa)" : "var(--token-color-text-secondary, #6b7280)"

    return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="color-scheme" content="${isDark ? "dark" : "light"}" />
    <style>
      html, body {
        margin: 0;
        padding: 0;
        background-color: transparent;
        color: ${textColor};
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        font-size: 14px;
        line-height: 1.6;
        word-break: break-word;
        overflow-x: auto;
      }
      a { color: ${linkColor}; text-decoration: underline; }
      blockquote {
        margin: 8px 0;
        padding-left: 12px;
        border-left: 3px solid ${quoteBorder};
        color: ${quoteText};
      }
      img { max-width: 100%; height: auto; }
      pre, code {
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 0.9em;
      }
      table { border-collapse: collapse; }
    </style>
  </head>
  <body>${processedHtml}</body>
</html>`
  }, [processedHtml, isDarkMode, isLightPaper])

  // 3. Debounced height measurement to eliminate ResizeObserver jitter
  const measureHeight = () => {
    try {
      const doc = iframeRef.current?.contentWindow?.document
      if (!doc?.body) return
      const height = Math.max(doc.documentElement.scrollHeight, doc.body.scrollHeight)
      if (height > 20 && Math.abs(height - iframeHeight) > 8) {
        setIframeHeight(height + 12)
      }
    } catch {
      // Cross-origin guard
    }
  }

  useEffect(() => {
    const doc = iframeRef.current?.contentWindow?.document
    if (!doc?.body || typeof ResizeObserver === "undefined") return

    let timeoutId: NodeJS.Timeout
    const observer = new ResizeObserver(() => {
      clearTimeout(timeoutId)
      timeoutId = setTimeout(measureHeight, 60)
    })

    observer.observe(doc.body)
    return () => {
      clearTimeout(timeoutId)
      observer.disconnect()
    }
  }, [srcDocContent])

  return (
    <VStack gap={2} width="100%">
      <iframe
        ref={iframeRef}
        srcDoc={srcDocContent}
        title="Email message body"
        sandbox="allow-same-origin allow-popups"
        width="100%"
        height={iframeHeight}
        onLoad={measureHeight}
        className="w-full border-0 overflow-hidden"
      />

      {hasTrimmedQuote && (
        <HStack>
          <IconButton
            label={showTrimmedQuote ? "Hide trimmed content" : "Show trimmed content (...)"}
            tooltip={showTrimmedQuote ? "Hide trimmed content" : "Show trimmed content"}
            variant="secondary"
            size="sm"
            icon={<Ellipsis size={14} />}
            onClick={() => setShowTrimmedQuote((prev) => !prev)}
          />
        </HStack>
      )}
    </VStack>
  )
}
