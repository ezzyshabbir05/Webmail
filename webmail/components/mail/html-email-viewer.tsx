"use client"

import React, { useState, useEffect, useRef, useMemo } from "react"
import { VStack, HStack } from "@astryxdesign/core/Layout"
import { Text } from "@astryxdesign/core/Text"
import { Button } from "@astryxdesign/core/Button"
import { ShieldAlert, Sun, Moon } from "lucide-react"
import type { EmailAttachment } from "@/types/webmail"

interface HtmlEmailViewerProps {
  html: string
  allowRemoteImages: boolean
  isLightPaper?: boolean
  isDarkMode?: boolean
  attachments?: EmailAttachment[]
  onAllowRemoteImages?: () => void
}

export function HtmlEmailViewer({
  html,
  allowRemoteImages,
  isLightPaper = false,
  isDarkMode = false,
  attachments = [],
  onAllowRemoteImages,
}: HtmlEmailViewerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [iframeHeight, setIframeHeight] = useState<number>(180)
  const [hasBlockedImages, setHasBlockedImages] = useState(false)
  const [paperMode, setPaperMode] = useState<"auto" | "light" | "dark">(isLightPaper ? "light" : "auto")

  // Audit #15: Resolve cid: inline images to real blob URLs
  const processedHtml = useMemo(() => {
    let content = html || ""

    // 1. Resolve cid: attachment URLs
    if (attachments.length > 0) {
      attachments.forEach((att) => {
        const cidRegex = new RegExp(`src=["']cid:${att.name}["']`, "gi")
        const blobUrl = att.downloadUrl || `/api/blob/${encodeURIComponent(att.id)}/${encodeURIComponent(att.name)}`
        content = content.replace(cidRegex, `src="${blobUrl}"`)
      })
    }

    // 2. Check for remote external images
    const remoteImgRegex = /<img[^>]+src=["'](https?:\/\/[^"']+)["']/gi
    const hasRemote = remoteImgRegex.test(content)
    if (hasRemote && !allowRemoteImages) {
      setHasBlockedImages(true)
      content = content.replace(remoteImgRegex, '<img src="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'24\' height=\'24\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%23a1a1aa\' stroke-width=\'2\'%3E%3Crect width=\'18\' height=\'18\' x=\'3\' y=\'3\' rx=\'2\'/%3E%3Ccircle cx=\'9\' cy=\'9\' r=\'2\'/%3E%3Cpath d=\'m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21\'/%3E%3C/svg%3E" alt="Image blocked" style="opacity:0.5;border:1px dashed #d4d4d8;border-radius:4px;"')
    } else {
      setHasBlockedImages(false)
    }

    return content
  }, [html, allowRemoteImages, attachments])

  // Audit #16: Debounced & thresholded iframe auto-resizing
  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return

    const doc = iframe.contentDocument || iframe.contentWindow?.document
    if (!doc) return

    doc.open()
    doc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            :root {
              color-scheme: ${paperMode === "light" ? "light" : paperMode === "dark" || isDarkMode ? "dark" : "light dark"};
            }
            body {
              margin: 0;
              padding: 4px 8px;
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
              font-size: 14px;
              line-height: 1.6;
              color: ${paperMode === "light" ? "#18181b" : isDarkMode ? "#f4f4f5" : "#18181b"};
              background-color: ${paperMode === "light" ? "#ffffff" : isDarkMode ? "#18181b" : "#ffffff"};
              overflow-x: hidden;
              word-break: break-word;
            }
            img { max-width: 100%; height: auto; }
            a { color: #2563eb; }
          </style>
        </head>
        <body>${processedHtml}</body>
      </html>
    `)
    doc.close()

    let lastHeight = 0
    let timer: NodeJS.Timeout | null = null

    const checkHeight = () => {
      if (!doc?.body) return
      const currentHeight = Math.max(doc.body.scrollHeight, doc.documentElement.scrollHeight, 120)
      // Jitter threshold: only update if delta > 4px
      if (Math.abs(currentHeight - lastHeight) > 4) {
        lastHeight = currentHeight
        setIframeHeight(currentHeight + 16)
      }
    }

    // Debounced ResizeObserver
    const observer = new ResizeObserver(() => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(checkHeight, 60)
    })

    if (doc.body) {
      observer.observe(doc.body)
      checkHeight()
    }

    return () => {
      if (timer) clearTimeout(timer)
      observer.disconnect()
    }
  }, [processedHtml, paperMode, isDarkMode])

  return (
    <VStack gap={2} width="100%">
      {/* Remote image privacy warning banner */}
      {hasBlockedImages && !allowRemoteImages && (
        <HStack
          hAlign="between"
          vAlign="center"
          width="100%"
          paddingInline={3}
          paddingBlock={2}
          className="rounded border border-warning/40 bg-warning-subtle/30"
        >
          <HStack gap={2} vAlign="center">
            <ShieldAlert size={16} className="text-warning flex-shrink-0" />
            <Text type="body" size="sm">
              Remote images are blocked to protect your privacy.
            </Text>
          </HStack>
          {onAllowRemoteImages && (
            <Button
              label="Display images"
              variant="secondary"
              size="sm"
              onClick={onAllowRemoteImages}
            />
          )}
        </HStack>
      )}

      {/* Reading Surface & Toggle */}
      <VStack width="100%" className="relative group">
        <HStack
          hAlign="end"
          width="100%"
          paddingInline={2}
          paddingBlock={1}
          className="opacity-0 group-hover:opacity-100 transition-opacity absolute top-1 right-1 z-10"
        >
          <Button
            label={paperMode === "light" ? "Dark paper" : "Light paper"}
            variant="ghost"
            size="sm"
            icon={paperMode === "light" ? <Moon size={13} /> : <Sun size={13} />}
            onClick={() => setPaperMode((prev) => (prev === "light" ? "dark" : "light"))}
          />
        </HStack>

        <iframe
          ref={iframeRef}
          title="Email Content"
          sandbox="allow-same-origin allow-popups"
          style={{
            width: "100%",
            height: `${iframeHeight}px`,
            border: "none",
            display: "block",
            transition: "height 0.15s ease",
          }}
        />
      </VStack>
    </VStack>
  )
}
