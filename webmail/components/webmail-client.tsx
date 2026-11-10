"use client"

import React, { useState, useRef, useEffect, useMemo } from "react"
import DOMPurify from "dompurify"
import { Theme } from "@astryxdesign/core/theme"
import { AppShell } from "@astryxdesign/core/AppShell"
import { TopNav, TopNavHeading } from "@astryxdesign/core/TopNav"
import { SideNav, SideNavItem, SideNavSection } from "@astryxdesign/core/SideNav"
import { Table, type TableColumn, type TablePlugin, pixel, proportional } from "@astryxdesign/core/Table"
import { useContainerReveal, useMediaQuery } from "@astryxdesign/core/hooks"
import { List, ListItem } from "@astryxdesign/core/List"
import { TabList, Tab } from "@astryxdesign/core/TabList"
import {
  VStack,
  HStack,
  StackItem,
  Layout,
  LayoutHeader,
  LayoutContent,
  LayoutFooter,
} from "@astryxdesign/core/Layout"
import { Toolbar } from "@astryxdesign/core/Toolbar"
import { Section } from "@astryxdesign/core/Section"
import { Text, Heading } from "@astryxdesign/core/Text"
import { Blockquote } from "@astryxdesign/core/Blockquote"
import { Link } from "@astryxdesign/core/Link"
import { Button } from "@astryxdesign/core/Button"
import { ButtonGroup } from "@astryxdesign/core/ButtonGroup"
import { IconButton } from "@astryxdesign/core/IconButton"
import { TextInput } from "@astryxdesign/core/TextInput"
import { TextArea } from "@astryxdesign/core/TextArea"
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput"
import { DropdownMenu } from "@astryxdesign/core/DropdownMenu"
import { MoreMenu } from "@astryxdesign/core/MoreMenu"
import { Popover } from "@astryxdesign/core/Popover"
import { Avatar } from "@astryxdesign/core/Avatar"
import { AvatarGroup, AvatarGroupOverflow } from "@astryxdesign/core/AvatarGroup"
import { Badge } from "@astryxdesign/core/Badge"
import { Banner } from "@astryxdesign/core/Banner"
import { Token, type TokenColor } from "@astryxdesign/core/Token"
import { StatusDot } from "@astryxdesign/core/StatusDot"
import { Timestamp } from "@astryxdesign/core/Timestamp"
import { CodeBlock } from "@astryxdesign/core/CodeBlock"
import { EmptyState } from "@astryxdesign/core/EmptyState"
import { Card } from "@astryxdesign/core/Card"
import { ClickableCard } from "@astryxdesign/core/ClickableCard"
import { MetadataList, MetadataListItem } from "@astryxdesign/core/MetadataList"
import { Kbd } from "@astryxdesign/core/Kbd"
import { Divider } from "@astryxdesign/core/Divider"
import { Center } from "@astryxdesign/core/Center"
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog"
import { AlertDialog } from "@astryxdesign/core/AlertDialog"
import { HoverCard } from "@astryxdesign/core/HoverCard"
import { Pagination } from "@astryxdesign/core/Pagination"
import { Spinner } from "@astryxdesign/core/Spinner"
import { ProgressBar } from "@astryxdesign/core/ProgressBar"
import {
  Search,
  SquarePen,
  Inbox,
  Star,
  Clock,
  Send,
  FileText,
  Archive,
  AlertCircle,
  Trash2,
  Folder,
  Plus,
  Users,
  Calendar,
  Filter,
  ArrowLeft,
  Mail,
  MailOpen,
  Reply,
  ReplyAll,
  Forward,
  Paperclip,
  Download,
  Sun,
  Moon,
  FolderInput,
  Tag,
  Info,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  MoreVertical,
  Ellipsis,
  Upload,
  Printer,
  ExternalLink,
  Lock,
  X,
  Sparkles,
  Minus,
  Maximize2,
  Minimize2,
  Keyboard,
  Settings,
  LogOut,
} from "lucide-react"
import { useMail } from "@/context/mail-context"
import { useThemeMode } from "@/components/theme-provider"
import { ThemeToggle } from "@/components/theme-toggle"
import { themes, defaultThemeSlug } from "../astryx-themes"
import type { EmailThread, EmailAttachment, EmailCategory, ThreadMessage } from "@/types/webmail"

// ─── Astryx Token-Based Attachment File Helpers ──────────────────────────────
export function getAttachmentTokenColor(filename: string, fileType?: string): TokenColor {
  const ext = filename.split(".").pop()?.toLowerCase() || fileType?.toLowerCase() || ""
  if (ext === "pdf") return "red"
  if (["xls", "xlsx", "csv", "spreadsheet"].includes(ext)) return "green"
  if (["doc", "docx", "document"].includes(ext)) return "blue"
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "image"].includes(ext)) return "orange"
  if (["zip", "tar", "gz", "rar", "7z", "archive"].includes(ext)) return "purple"
  if (["ts", "tsx", "js", "json", "py"].includes(ext)) return "teal"
  return "gray"
}

// ─── Industry-Standard Plain-Text & HTML Email Rendering Engines ──────────────
type HtmlEmailCategory = "opt-in-dark" | "conversational" | "designed"

export function classifyHtmlEmail(html: string): HtmlEmailCategory {
  if (/prefers-color-scheme\s*:\s*dark/i.test(html) || /color-scheme[^>]*dark/i.test(html)) {
    return "opt-in-dark"
  }
  const hasStructuredTemplate =
    /<table[\s>]/i.test(html) ||
    /<style[\s>]/i.test(html) ||
    /\bbackground(-color)?\s*:/i.test(html) ||
    /\bbgcolor\s*=/i.test(html) ||
    /\bborder-left\s*:/i.test(html)
  return hasStructuredTemplate ? "designed" : "conversational"
}

function parseCssColorToRgb(colorStr: string): [number, number, number] | null {
  const clean = colorStr.trim().toLowerCase()
  if (clean === "white") return [255, 255, 255]
  if (clean === "black") return [0, 0, 0]
  if (clean.startsWith("#")) {
    const hex = clean.slice(1)
    if (hex.length === 3 || hex.length === 4) {
      const r = parseInt(hex[0] + hex[0], 16)
      const g = parseInt(hex[1] + hex[1], 16)
      const b = parseInt(hex[2] + hex[2], 16)
      return Number.isNaN(r) ? null : [r, g, b]
    }
    if (hex.length >= 6) {
      const r = parseInt(hex.slice(0, 2), 16)
      const g = parseInt(hex.slice(2, 4), 16)
      const b = parseInt(hex.slice(4, 6), 16)
      return Number.isNaN(r) ? null : [r, g, b]
    }
  }
  const rgbMatch = clean.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/)
  if (rgbMatch) {
    return [Number(rgbMatch[1]), Number(rgbMatch[2]), Number(rgbMatch[3])]
  }
  return null
}

function getRelativeLuminance([r, g, b]: [number, number, number]): number {
  const toLinear = (v: number) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
}

function adaptElementTreeForDarkMode(doc: Document) {
  const walk = (el: HTMLElement, onDarkSurface: boolean, isRootCanvasWrapper: boolean) => {
    const tag = el.tagName.toLowerCase()
    if (tag === "img" || tag === "svg" || tag === "video" || tag === "picture") {
      return
    }

    let nextDarkSurface = onDarkSurface
    const bgRaw = el.style?.backgroundColor || el.getAttribute("bgcolor") || ""
    if (bgRaw) {
      const rgb = parseCssColorToRgb(bgRaw)
      if (rgb) {
        const lum = getRelativeLuminance(rgb)
        if (lum > 0.55) {
          if (isRootCanvasWrapper && lum > 0.85) {
            // Root full-message light canvas blends transparently with reading surface
            el.style.backgroundColor = "transparent"
          } else {
            el.style.backgroundColor = "#26262a"
          }
          el.removeAttribute("bgcolor")
          nextDarkSurface = true
        } else {
          // Intentionally dark container (#18181b) or vivid CTA button (#2563eb) stays intact
          nextDarkSurface = true
        }
      }
    }

    const fgRaw = el.style?.color || el.getAttribute("color") || ""
    if (fgRaw && nextDarkSurface) {
      const rgb = parseCssColorToRgb(fgRaw)
      if (rgb) {
        const lum = getRelativeLuminance(rgb)
        if (lum < 0.45) {
          el.style.color = lum < 0.1 ? "#f4f4f5" : "#d4d4d8"
          el.removeAttribute("color")
        }
      }
    }

    if (el.style?.borderColor) {
      const rgb = parseCssColorToRgb(el.style.borderColor)
      if (rgb && getRelativeLuminance(rgb) > 0.6) {
        el.style.borderColor = "#3f3f46"
      }
    }

    Array.from(el.children).forEach((child) => {
      if (child instanceof HTMLElement) {
        walk(child, nextDarkSurface, false)
      }
    })
  }

  Array.from(doc.body.children).forEach((child) => {
    if (child instanceof HTMLElement) {
      walk(child, true, true)
    }
  })
}

function renderPlainTextWithLinks(text: string): React.ReactNode[] {
  const tokenRegex = /(https?:\/\/[^\s<>()]+|[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g
  const parts: React.ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = tokenRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }

    let rawToken = match[0]
    let trailingPunctuation = ""
    while (/[.,;:!?)]$/.test(rawToken)) {
      trailingPunctuation = rawToken.slice(-1) + trailingPunctuation
      rawToken = rawToken.slice(0, -1)
    }

    if (rawToken.startsWith("http://") || rawToken.startsWith("https://")) {
      parts.push(
        <Link key={`lnk_${match.index}`} href={rawToken} isExternalLink>
          {rawToken}
        </Link>
      )
    } else if (rawToken.includes("@")) {
      parts.push(
        <Link key={`mailto_${match.index}`} href={`mailto:${rawToken}`}>
          {rawToken}
        </Link>
      )
    } else {
      parts.push(rawToken)
    }

    if (trailingPunctuation) {
      parts.push(trailingPunctuation)
    }

    lastIndex = match.index + match[0].length
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }

  return parts.length > 0 ? parts : [text]
}

interface PlainTextBlock {
  type: "prose" | "quote"
  lines: string[]
  depth: number
}

function parsePlainTextStructure(rawBody: string) {
  const normalized = rawBody.replace(/\r\n/g, "\n")
  // Split RFC 3676 signature separator (`-- `) near end
  const sigMatch = normalized.match(/\n--\s*\n([\s\S]*)$/)
  const contentWithoutSig = sigMatch ? normalized.slice(0, sigMatch.index) : normalized
  const signature = sigMatch ? sigMatch[1].trim() : ""

  const lines = contentWithoutSig.split("\n")

  // Locate trailing quoted reply boundary (Gmail-style trimmed history)
  let trimStartIdx = -1
  for (let i = 0; i < lines.length; i++) {
    const trimmedLine = lines[i].trim()
    const nextLine = lines[i + 1]?.trim() || ""
    const isAttribution =
      (/^On .+wrote:\s*$/i.test(trimmedLine) ||
        /^-{2,}\s*(Original|Forwarded)\s+Message\s*-{2,}/i.test(trimmedLine)) &&
      (nextLine.startsWith(">") || /^From:/i.test(nextLine))
    if (isAttribution) {
      // Confirm remainder is mostly quoted/blank so we don't hide main content after an inline quote
      const restNonEmpty = lines.slice(i + 1).filter((l) => l.trim().length > 0)
      const quotedCount = restNonEmpty.filter((l) => l.trim().startsWith(">") || /^(From|Subject|Date):/i.test(l.trim())).length
      if (restNonEmpty.length > 0 && quotedCount / restNonEmpty.length >= 0.7) {
        trimStartIdx = i
        break
      }
    }
  }

  const primaryLines = trimStartIdx >= 0 ? lines.slice(0, trimStartIdx) : lines
  const trimmedLines = trimStartIdx >= 0 ? lines.slice(trimStartIdx) : []

  const groupBlocks = (sourceLines: string[]): PlainTextBlock[] => {
    const blocks: PlainTextBlock[] = []
    for (const line of sourceLines) {
      const quoteMatch = line.match(/^(>+)\s?(.*)$/)
      if (quoteMatch) {
        const depth = Math.min(quoteMatch[1].length, 3)
        const text = quoteMatch[2]
        const prev = blocks[blocks.length - 1]
        if (prev && prev.type === "quote" && prev.depth === depth) {
          prev.lines.push(text)
        } else {
          blocks.push({ type: "quote", lines: [text], depth })
        }
      } else {
        const prev = blocks[blocks.length - 1]
        if (prev && prev.type === "prose") {
          prev.lines.push(line)
        } else {
          blocks.push({ type: "prose", lines: [line], depth: 0 })
        }
      }
    }
    return blocks
  }

  return {
    primaryBlocks: groupBlocks(primaryLines),
    trimmedBlocks: groupBlocks(trimmedLines),
    hasTrimmedQuote: trimmedLines.length > 0,
    signature,
  }
}

function VerifiedSeal() {
  return (
    <svg
      viewBox="0 0 24 24"
      width={16}
      height={16}
      role="img"
      aria-label="Verified sender"
    >
      <title>Verified sender (BIMI / DKIM)</title>
      <path
        className="fill-info"
        d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"
      />
      <path
        d="m9 12 2 2 4-4"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-on-info"
      />
    </svg>
  )
}

function PlainTextEmailViewer({
  body,
  isMonospace = false,
}: {
  body: string
  isMonospace?: boolean
}) {
  const [showTrimmed, setShowTrimmed] = useState(false)
  const parsed = useMemo(() => parsePlainTextStructure(body), [body])

  const renderBlocks = (blocks: PlainTextBlock[], prefix: string) =>
    blocks.map((block, idx) => {
      if (block.type === "quote") {
        const quoteContent = (
          <Text
            type="body"
            color="secondary"
            className={isMonospace ? "font-mono whitespace-pre-wrap" : "whitespace-pre-wrap"}
          >
            {renderPlainTextWithLinks(block.lines.join("\n"))}
          </Text>
        )
        return (
          <VStack
            key={`${prefix}_q_${idx}`}
            paddingInlineStart={block.depth > 1 ? ((block.depth - 1) * 3 as 3 | 6) : 0}
            width="100%"
          >
            <Blockquote>{quoteContent}</Blockquote>
          </VStack>
        )
      }

      const proseText = block.lines.join("\n").replace(/^\n+|\n+$/g, "")
      if (!proseText) return null

      return (
        <Text
          key={`${prefix}_p_${idx}`}
          type="body"
          className={isMonospace ? "font-mono whitespace-pre-wrap" : "whitespace-pre-wrap"}
        >
          {renderPlainTextWithLinks(proseText)}
        </Text>
      )
    })

  return (
    <VStack gap={3} width="100%">
      {renderBlocks(parsed.primaryBlocks, "main")}

      {parsed.hasTrimmedQuote && (
        <VStack gap={2} width="100%">
          <HStack>
            <IconButton
              label={showTrimmed ? "Hide trimmed content" : "Show trimmed content"}
              tooltip={showTrimmed ? "Hide trimmed content" : "Show trimmed content"}
              variant="secondary"
              size="sm"
              icon={<Ellipsis size={16} />}
              onClick={() => setShowTrimmed((prev) => !prev)}
            />
          </HStack>
          {showTrimmed && (
            <VStack gap={2} width="100%">
              {renderBlocks(parsed.trimmedBlocks, "trim")}
            </VStack>
          )}
        </VStack>
      )}

      {parsed.signature && (
        <VStack gap={2} width="100%" paddingBlockStart={1}>
          <Divider />
          <Text
            type="supporting"
            color="secondary"
            className={isMonospace ? "font-mono whitespace-pre-wrap" : "whitespace-pre-wrap"}
          >
            {renderPlainTextWithLinks(parsed.signature)}
          </Text>
        </VStack>
      )}
    </VStack>
  )
}

function HtmlEmailViewer({
  html,
  uiMode = "light",
  emailDarkMode = "smart",
  forceLightPaper = false,
  forceDarkCanvas = false,
  allowRemoteImages = false,
}: {
  html: string
  uiMode?: "light" | "dark"
  emailDarkMode?: "smart" | "paper"
  forceLightPaper?: boolean
  forceDarkCanvas?: boolean
  allowRemoteImages?: boolean
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [iframeHeight, setIframeHeight] = useState<number>(180)
  const [showTrimmedQuote, setShowTrimmedQuote] = useState(false)

  const category = useMemo(() => classifyHtmlEmail(html), [html])

  const shouldUseDarkAdaptation =
    uiMode === "dark" &&
    !forceLightPaper &&
    category !== "opt-in-dark" &&
    (forceDarkCanvas || emailDarkMode === "smart" || category === "conversational")

  const needsLightPaperSheet =
    uiMode === "dark" &&
    category === "designed" &&
    !shouldUseDarkAdaptation

  const { processedHtml, hasTrimmedQuote } = useMemo(() => {
    if (typeof window === "undefined") {
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

    // Ensure external links open safely in a new tab
    doc.querySelectorAll("a[href]").forEach((anchor) => {
      anchor.setAttribute("target", "_blank")
      anchor.setAttribute("rel", "noopener noreferrer")
    })

    // Privacy gate: strip external http(s) images until explicitly approved
    if (!allowRemoteImages) {
      doc.querySelectorAll("img").forEach((img) => {
        const src = img.getAttribute("src") || ""
        if (/^https?:\/\//i.test(src)) {
          img.setAttribute("data-blocked-src", src)
          img.removeAttribute("src")
          img.setAttribute("hidden", "true")
        }
      })
    }

    // Gmail-style trimmed `.gmail_quote` detection & toggle
    const quoteNodes = Array.from(doc.querySelectorAll(".gmail_quote"))
    const detectedQuote = quoteNodes.length > 0
    if (!showTrimmedQuote) {
      quoteNodes.forEach((node) => node.remove())
    }

    if (shouldUseDarkAdaptation && category === "designed") {
      adaptElementTreeForDarkMode(doc)
    }

    return {
      processedHtml: doc.body.innerHTML,
      hasTrimmedQuote: detectedQuote,
    }
  }, [html, allowRemoteImages, showTrimmedQuote, shouldUseDarkAdaptation, category])

  const srcDocContent = useMemo(() => {
    const colorScheme =
      uiMode === "dark" && (category === "opt-in-dark" || shouldUseDarkAdaptation)
        ? "dark"
        : "light"
    const fallbackText =
      colorScheme === "dark" ? "#e4e4e7" : "#111827"
    const fallbackLink = colorScheme === "dark" ? "#60a5fa" : "#2563eb"

    return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="color-scheme" content="${colorScheme}" />
    <style>
      html, body {
        margin: 0;
        padding: 0;
        background-color: transparent;
        color: ${fallbackText};
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
        line-height: 1.6;
        overflow-x: auto;
      }
      a { color: ${fallbackLink}; }
      blockquote {
        margin: 8px 0;
        padding-left: 12px;
        border-left: 2px solid ${colorScheme === "dark" ? "#3f3f46" : "#d4d4d8"};
        color: ${colorScheme === "dark" ? "#a1a1aa" : "#52525b"};
      }
      img { max-width: 100%; height: auto; }
      code {
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 0.9em;
      }
    </style>
  </head>
  <body>${processedHtml}</body>
</html>`
  }, [processedHtml, uiMode, category, shouldUseDarkAdaptation])

  const measureIframeHeight = () => {
    try {
      const doc = iframeRef.current?.contentWindow?.document
      if (!doc?.body) return
      const nextHeight = Math.max(doc.documentElement.scrollHeight, doc.body.scrollHeight)
      if (nextHeight > 20) {
        setIframeHeight(nextHeight + 8)
      }
    } catch {
      // Cross-origin guard
    }
  }

  useEffect(() => {
    const doc = iframeRef.current?.contentWindow?.document
    if (!doc?.body || typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(() => measureIframeHeight())
    observer.observe(doc.body)
    return () => observer.disconnect()
  }, [srcDocContent])

  const iframeElement = (
    <iframe
      ref={iframeRef}
      srcDoc={srcDocContent}
      title="Email Content"
      sandbox="allow-same-origin allow-popups"
      width="100%"
      height={iframeHeight}
      onLoad={measureIframeHeight}
      className="w-full border-0 overflow-hidden"
    />
  )

  return (
    <VStack gap={2} width="100%">
      {needsLightPaperSheet ? (
        <Theme theme={themes[defaultThemeSlug] || themes.neutral} mode="light">
          <Card variant="default" elevation="none" padding={3} width="100%">
            {iframeElement}
          </Card>
        </Theme>
      ) : (
        iframeElement
      )}

      {hasTrimmedQuote && (
        <HStack>
          <IconButton
            label={showTrimmedQuote ? "Hide trimmed content" : "Show trimmed content"}
            tooltip={showTrimmedQuote ? "Hide trimmed content" : "Show trimmed content"}
            variant="secondary"
            size="sm"
            icon={<Ellipsis size={16} />}
            onClick={() => setShowTrimmedQuote((prev) => !prev)}
          />
        </HStack>
      )}
    </VStack>
  )
}

function buildMessageRfc822Source(msg: ThreadMessage, subject: string): string {
  if (msg.rawHeaders) {
    return `${msg.rawHeaders}\n\n${msg.htmlBody || msg.body}`
  }
  const ccHeader = msg.ccEmails && msg.ccEmails.length > 0 ? `Cc: ${msg.ccEmails.join(", ")}\n` : ""
  return [
    `From: ${msg.senderName} <${msg.senderEmail}>`,
    `To: ${msg.recipientEmail}`,
    `${ccHeader}Date: ${msg.fullDate || msg.timestamp}`,
    `Subject: ${subject}`,
    `Authentication-Results: spf=${msg.spfStatus || "pass"} dkim=${msg.dkimStatus || "pass"} dmarc=${msg.dmarcStatus || "pass"}`,
    `MIME-Version: 1.0`,
    `Content-Type: ${msg.htmlBody ? "text/html" : "text/plain"}; charset="UTF-8"`,
    "",
    msg.htmlBody || msg.body,
  ].join("\n")
}

function downloadTextFile(filename: string, content: string, mimeType = "message/rfc822") {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

// ─── Unified Webmail Client ──────────────────────────────────────────────────
export function WebmailClient() {
  const { mode, emailDarkMode } = useThemeMode()
  const {
    emails,
    activeEmailId,
    activeEmail,
    activeCategory,
    activeFolder,
    selectedIds,
    isComposeOpen,
    searchQuery,
    unreadCounts,
    customFolders,
    createCustomFolder,
    identities,
    activeIdentity,
    setActiveIdentity,
    cannedResponses,
    contacts,
    allowedRemoteImages,
    allowRemoteImagesForEmail,
    quotaInfo,
    openEmail,
    closeEmail,
    toggleStar,
    toggleSelect,
    selectAll,
    archiveSelected,
    deleteSelected,
    reportSpam,
    markSelectedAsRead,
    markSelectedAsUnread,
    toggleEmailRead,
    snoozeEmails,
    replyToEmail,
    removeThreadLabel,
    applyThreadLabel,
    importEmlMessage,
    emptyTrash,
    markAllAsRead,
    refreshMailbox,
    composeInitialData,
    clearComposeInitialData,
    openCompose,
    closeCompose,
    sendEmail,
    saveDraft,
    setActiveCategory,
    setActiveFolder,
    setSearchQuery,
    moveEmailsToFolder,
  } = useMail()

  // New folder dialog state
  const [isFolderDialogOpen, setIsFolderDialogOpen] = useState(false)
  const [newFolderName, setNewFolderName] = useState("")
  const [isEmptyTrashAlertOpen, setIsEmptyTrashAlertOpen] = useState(false)

  // Filter & Refresh states
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const emlFileInputRef = useRef<HTMLInputElement>(null)
  const attachFileInputRef = useRef<HTMLInputElement>(null)

  const handleRefresh = async () => {
    setIsRefreshing(true)
    await refreshMailbox()
    setIsRefreshing(false)
  }

  const handleEmlFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : ""
      if (!text) return
      const lines = text.split(/\r?\n/)
      let headerEndIdx = lines.findIndex((l) => l.trim() === "")
      if (headerEndIdx === -1) headerEndIdx = lines.length

      const headerLines = lines.slice(0, headerEndIdx)
      const bodyText = lines.slice(headerEndIdx + 1).join("\n")

      const getHeader = (name: string) => {
        const regex = new RegExp(`^${name}:\\s*(.*)$`, "i")
        const line = headerLines.find((l) => regex.test(l))
        return line ? line.replace(new RegExp(`^${name}:\\s*`, "i"), "").trim() : ""
      }

      const subject = getHeader("Subject") || file.name.replace(/\.[^/.]+$/, "")
      const fromHeader = getHeader("From") || "Unknown Sender <unknown@domain.com>"
      const dateHeader = getHeader("Date") || new Date().toLocaleString()

      const fromMatch = fromHeader.match(/^(.*?)(?:<([^>]+)>)?$/)
      const senderName = fromMatch?.[1]?.trim().replace(/^"|"$/g, "") || fromHeader
      const senderEmail =
        fromMatch?.[2]?.trim() || (fromHeader.includes("@") ? fromHeader : "sender@imported.local")

      const isHtml =
        text.toLowerCase().includes("<!doctype html") || text.toLowerCase().includes("<html")

      importEmlMessage({
        subject,
        senderName,
        senderEmail,
        body: bodyText,
        htmlBody: isHtml ? bodyText : undefined,
        date: dateHeader,
      })
      if (emlFileInputRef.current) emlFileInputRef.current.value = ""
    }
    reader.readAsText(file)
  }

  const handleAttachFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    const formatBytes = (bytes: number) => {
      if (bytes < 1024) return `${bytes} B`
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    }
    const getFileType = (name: string): EmailAttachment["type"] => {
      const ext = name.split(".").pop()?.toLowerCase() || ""
      if (["png", "jpg", "jpeg", "webp", "gif", "svg"].includes(ext)) return "image"
      if (ext === "pdf") return "pdf"
      if (["xls", "xlsx", "csv", "tsv"].includes(ext)) return "spreadsheet"
      if (["doc", "docx", "txt", "md", "rtf"].includes(ext)) return "document"
      if (["zip", "tar", "gz", "7z", "rar"].includes(ext)) return "archive"
      return "binary"
    }

    const newAttachments: EmailAttachment[] = Array.from(files).map((f) => ({
      id: `att_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name: f.name,
      size: formatBytes(f.size),
      type: getFileType(f.name),
    }))

    setComposeAttachments((prev) => [...prev, ...newAttachments])
    if (attachFileInputRef.current) attachFileInputRef.current.value = ""
  }

  // Reading pane & threader state
  const threadScrollRef = useRef<HTMLDivElement>(null)
  const [showAllMiddle, setShowAllMiddle] = useState(false)
  const [isReplying, setIsReplying] = useState(false)
  const [replyMode, setReplyMode] = useState<"reply" | "reply_all" | "forward">("reply")
  const [replyToInput, setReplyToInput] = useState("")
  const [replyCcInput, setReplyCcInput] = useState("")
  const [replyText, setReplyText] = useState("")
  const [messageStarred, setMessageStarred] = useState<Record<string, boolean>>({})
  const [expandedOverrides, setExpandedOverrides] = useState<Record<string, boolean>>({})
  const [darkMessageOverrides, setDarkMessageOverrides] = useState<Record<string, boolean>>({})
  const [lightPaperOverrides, setLightPaperOverrides] = useState<Record<string, boolean>>({})
  const [monospaceOverrides, setMonospaceOverrides] = useState<Record<string, boolean>>({})
  const [originalSourceModal, setOriginalSourceModal] = useState<{
    subject: string
    source: string
    filename: string
  } | null>(null)

  useEffect(() => {
    setShowAllMiddle(false)
    setIsReplying(false)
    setReplyText("")
    threadScrollRef.current?.scrollTo({ top: 0 })
  }, [activeEmailId])

  // Composer fields state
  type ComposerMode = "docked" | "minimized" | "maximized"
  const [composerMode, setComposerMode] = useState<ComposerMode>("docked")
  const [composeTo, setComposeTo] = useState("")
  const [composeCc, setComposeCc] = useState("")
  const [composeBcc, setComposeBcc] = useState("")
  const [showCcBcc, setShowCcBcc] = useState(false)
  const [composeSubject, setComposeSubject] = useState("")
  const [composeBody, setComposeBody] = useState("")
  const [composeAttachments, setComposeAttachments] = useState<EmailAttachment[]>([])
  const [contactSuggestions, setContactSuggestions] = useState<typeof contacts>([])

  // Step 5: Global keyboard navigation focus cursor and shortcuts dialog
  const [focusedEmailIndex, setFocusedEmailIndex] = useState<number>(-1)
  const [isShortcutsDialogOpen, setIsShortcutsDialogOpen] = useState<boolean>(false)

  // Prefill compose fields when triggered externally (e.g. from Contacts)
  useEffect(() => {
    if (composeInitialData) {
      if (composeInitialData.to) setComposeTo(composeInitialData.to)
      if (composeInitialData.subject) setComposeSubject(composeInitialData.subject)
      if (composeInitialData.body) setComposeBody(composeInitialData.body)
      setComposerMode("docked")
      clearComposeInitialData()
    }
  }, [composeInitialData, clearComposeInitialData])

  const handleOpenCompose = () => {
    setComposerMode("docked")
    openCompose()
  }

  const handleOpenComposeWithDraft = (draft: { to?: string; subject?: string; body?: string }) => {
    if (draft.to) setComposeTo(draft.to)
    if (draft.subject) setComposeSubject(draft.subject)
    if (draft.body) setComposeBody(draft.body)
    setComposerMode("docked")
    openCompose(draft)
  }

  // CSS-only hover/focus reveal for table row quick actions (zero React state churn)
  const isTouchDevice = useMediaQuery("(hover: none)")
  const rowReveal = useContainerReveal()
  const rowHoverPlugin = useMemo<TablePlugin<EmailThread>>(
    () => ({
      transformBodyRow: (props) => {
        const container = rowReveal.getContainerProps({ hoverDelay: 90 })
        return {
          ...props,
          htmlProps: {
            ...props.htmlProps,
            className: [props.htmlProps?.className, container.className]
              .filter(Boolean)
              .join(" "),
            style: { ...props.htmlProps?.style, ...container.style },
          },
        }
      },
    }),
    [rowReveal]
  )

  // Messages in thread
  const threadMessages: ThreadMessage[] = activeEmail
    ? activeEmail.messages && activeEmail.messages.length > 0
      ? activeEmail.messages
      : [
          {
            id: `orig_${activeEmail.id}`,
            senderName: activeEmail.senderName,
            senderAvatar: activeEmail.senderAvatar,
            isVerified: activeEmail.isVerified,
            senderEmail: activeEmail.senderEmail,
            recipientEmail: activeEmail.recipientEmail,
            ccEmails: activeEmail.ccEmails,
            replyToEmail: activeEmail.replyToEmail || activeEmail.senderEmail,
            body: activeEmail.body,
            htmlBody: activeEmail.htmlBody,
            timestamp: activeEmail.timestamp,
            fullDate: activeEmail.fullDate,
            isoDate: activeEmail.isoDate,
            mailedBy: activeEmail.senderEmail.split("@")[1] || "postarc.local",
            signedBy: activeEmail.senderEmail.split("@")[1] || "postarc.local",
            security: "Standard encryption (TLS 1.3)",
            attachments: activeEmail.attachments,
          },
        ]
    : []

  // Unique thread participants for AvatarGroup
  const threadParticipants = useMemo(() => {
    const seen = new Set<string>()
    const list: { name: string; email: string; avatar?: string }[] = []
    threadMessages.forEach((m) => {
      const key = m.senderEmail.toLowerCase()
      if (!seen.has(key)) {
        seen.add(key)
        list.push({ name: m.senderName, email: m.senderEmail, avatar: m.senderAvatar })
      }
    })
    return list
  }, [threadMessages])

  const isMsgExpanded = (msgId: string, idx: number, total: number) => {
    if (total <= 1) return true
    if (expandedOverrides[msgId] !== undefined) return expandedOverrides[msgId]
    return idx === total - 1
  }

  const toggleExpand = (id: string, idx: number, total: number) => {
    setExpandedOverrides((prev) => ({
      ...prev,
      [id]: !isMsgExpanded(id, idx, total),
    }))
  }

  const allExpanded = threadMessages.every((m, i) => isMsgExpanded(m.id, i, threadMessages.length))

  const expandAll = () => {
    setShowAllMiddle(true)
    const next: Record<string, boolean> = {}
    threadMessages.forEach((m) => {
      next[m.id] = true
    })
    setExpandedOverrides(next)
  }

  const collapseAll = () => {
    setShowAllMiddle(false)
    const next: Record<string, boolean> = {}
    threadMessages.forEach((m, idx) => {
      next[m.id] = idx === threadMessages.length - 1
    })
    setExpandedOverrides(next)
  }

  const toggleMessageStar = (id: string) => {
    const msg = threadMessages.find((m) => m.id === id)
    setMessageStarred((prev) => ({
      ...prev,
      [id]: !(prev[id] ?? msg?.isStarred ?? activeEmail?.isStarred),
    }))
  }

  const startInlineReply = (
    nextMode: "reply" | "reply_all" | "forward",
    targetMsg?: ThreadMessage
  ) => {
    const target = targetMsg || threadMessages[threadMessages.length - 1]
    if (!target || !activeEmail) return

    setReplyMode(nextMode)
    if (nextMode === "forward") {
      setReplyToInput("")
      setReplyCcInput("")
      setReplyText(
        `\n\n---------- Forwarded message ---------\nFrom: ${target.senderName} <${target.senderEmail}>\nDate: ${target.fullDate}\nSubject: ${activeEmail.subject}\nTo: ${target.recipientEmail}\n\n${target.body}`
      )
    } else if (nextMode === "reply_all") {
      const toRecipient =
        target.isFromMe ? target.recipientEmail : target.replyToEmail || target.senderEmail
      const ccSet = new Set<string>()
      ;[target.recipientEmail, ...(target.ccEmails || [])].forEach((addr) => {
        const clean = addr.trim()
        if (
          clean &&
          clean.toLowerCase() !== activeIdentity.email.toLowerCase() &&
          clean.toLowerCase() !== toRecipient.toLowerCase()
        ) {
          ccSet.add(clean)
        }
      })
      setReplyToInput(toRecipient)
      setReplyCcInput(Array.from(ccSet).join(", "))
      setReplyText("")
    } else {
      setReplyToInput(target.isFromMe ? target.recipientEmail : target.replyToEmail || target.senderEmail)
      setReplyCcInput("")
      setReplyText("")
    }
    setIsReplying(true)
  }

  const popOutReplyToComposer = () => {
    if (!activeEmail) return
    const prefix = replyMode === "forward" ? "Fwd: " : "Re: "
    const normalizedSubject = activeEmail.subject.startsWith(prefix)
      ? activeEmail.subject
      : `${prefix}${activeEmail.subject}`
    setComposeTo(replyToInput)
    setComposeCc(replyCcInput)
    setShowCcBcc(Boolean(replyCcInput.trim()))
    setComposeSubject(normalizedSubject)
    setComposeBody(replyText)
    setComposerMode("docked")
    openCompose()
    setIsReplying(false)
  }

  const handleStartForward = () => startInlineReply("forward")

  const printSingleMessage = (msg: ThreadMessage) => {
    if (typeof window === "undefined") return
    const printWindow = window.open("", "_blank", "width=800,height=600")
    if (!printWindow) return
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${activeEmail?.subject || "Email Print"}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 32px; color: #111; line-height: 1.6; }
            .header { border-bottom: 2px solid #e5e7eb; padding-bottom: 16px; margin-bottom: 24px; }
            .subject { font-size: 22px; font-weight: 700; margin-bottom: 12px; }
            .meta { font-size: 14px; color: #4b5563; margin-bottom: 4px; }
            .body { font-size: 15px; white-space: pre-wrap; word-break: break-word; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="subject">${activeEmail?.subject || ""}</div>
            <div class="meta"><strong>From:</strong> ${msg.senderName} &lt;${msg.senderEmail}&gt;</div>
            <div class="meta"><strong>To:</strong> ${msg.recipientEmail}</div>
            <div class="meta"><strong>Date:</strong> ${msg.fullDate || msg.timestamp}</div>
          </div>
          <div class="body">${msg.body}</div>
        </body>
      </html>
    `)
    printWindow.document.close()
    printWindow.focus()
    printWindow.print()
  }

  // Autocomplete contacts in composer
  const handleRecipientChange = (val: string) => {
    setComposeTo(val)
    if (val.trim().length > 1) {
      const q = val.toLowerCase().trim()
      const matches = contacts.filter(
        (c) => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q)
      )
      setContactSuggestions(matches)
    } else {
      setContactSuggestions([])
    }
  }

  const handleSelectContact = (email: string) => {
    setComposeTo(email)
    setContactSuggestions([])
  }

  // Handle composer submission
  const handleSendCompose = () => {
    if (!composeTo.trim()) return
    sendEmail(
      composeTo.trim(),
      composeSubject.trim(),
      composeBody,
      composeAttachments,
      activeIdentity.id
    )
    setComposeTo("")
    setComposeCc("")
    setComposeBcc("")
    setComposeSubject("")
    setComposeBody("")
    setComposeAttachments([])
  }

  // Handle quick inline reply
  const handleSendReply = () => {
    if (!activeEmail || !replyText.trim()) return
    const ccList = replyCcInput
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
    replyToEmail(activeEmail.id, replyText.trim(), {
      mode: replyMode,
      to: replyToInput,
      cc: ccList,
    })
    setIsReplying(false)
    setReplyText("")
    setReplyCcInput("")
  }

  // Handle folder creation
  const handleCreateFolder = () => {
    if (!newFolderName.trim()) return
    createCustomFolder(newFolderName.trim())
    setNewFolderName("")
    setIsFolderDialogOpen(false)
  }

  // Filtered emails based on search query, folder, category, and unread toggle
  const filteredEmails = emails.filter((email) => {
    if (unreadOnly && !email.isUnread) {
      return false
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      return (
        email.subject.toLowerCase().includes(q) ||
        email.senderName.toLowerCase().includes(q) ||
        email.senderEmail.toLowerCase().includes(q) ||
        email.snippet.toLowerCase().includes(q)
      )
    }

    if (activeFolder === "starred") {
      return email.isStarred
    }

    if (activeFolder === "inbox") {
      return (
        email.folder === "inbox" &&
        (activeCategory === "primary"
          ? !email.category || email.category === "primary"
          : email.category === activeCategory)
      )
    }

    return email.folder === activeFolder
  })

  // Mail list pagination (50 threads per page)
  const [mailListPage, setMailListPage] = useState(0)
  const PAGE_SIZE = 50

  useEffect(() => {
    setMailListPage(0)
  }, [activeFolder, activeCategory, searchQuery, unreadOnly])

  const totalPages = Math.ceil(filteredEmails.length / PAGE_SIZE) || 1
  const pageStart = filteredEmails.length === 0 ? 0 : mailListPage * PAGE_SIZE + 1
  const pageEnd = Math.min((mailListPage + 1) * PAGE_SIZE, filteredEmails.length)
  const paginatedEmails = useMemo(() => {
    return filteredEmails.slice(mailListPage * PAGE_SIZE, (mailListPage + 1) * PAGE_SIZE)
  }, [filteredEmails, mailListPage])

  const hasSelection = selectedIds.size > 0
  const isAllSelected = selectedIds.size > 0 && selectedIds.size === filteredEmails.length
  const checkboxValue = isAllSelected ? true : hasSelection ? "indeterminate" : false

  const activeThreadIndex = activeEmail
    ? filteredEmails.findIndex((e) => e.id === activeEmail.id)
    : -1
  const hasNewerThread = activeThreadIndex > 0
  const hasOlderThread = activeThreadIndex >= 0 && activeThreadIndex < filteredEmails.length - 1
  const openNewerThread = () => {
    if (hasNewerThread) {
      openEmail(filteredEmails[activeThreadIndex - 1].id)
    }
  }
  const openOlderThread = () => {
    if (hasOlderThread) {
      openEmail(filteredEmails[activeThreadIndex + 1].id)
    }
  }

  // ─── Step 5: Global Gmail/Stalwart Keyboard Shortcuts ────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement
      const isTyping =
        activeEl?.tagName === "INPUT" ||
        activeEl?.tagName === "TEXTAREA" ||
        (activeEl as HTMLElement)?.isContentEditable

      // Cmd/Ctrl+Enter inside floating composer or inline reply to send
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        if (isComposeOpen) {
          e.preventDefault()
          handleSendCompose()
          return
        }
        if (activeEmailId && isReplying && replyText.trim()) {
          e.preventDefault()
          handleSendReply()
          return
        }
      }

      // If user is actively typing in a field, ignore single-key navigation
      if (isTyping) {
        if (e.key === "Escape" && isComposeOpen) {
          closeCompose()
        }
        return
      }

      // '?' opens shortcuts guide modal
      if (e.key === "?") {
        e.preventDefault()
        setIsShortcutsDialogOpen(true)
        return
      }

      // 'c' opens composer
      if (e.key === "c") {
        e.preventDefault()
        handleOpenCompose()
        return
      }

      // '/' focuses search
      if (e.key === "/") {
        e.preventDefault()
        const searchInput = document.querySelector('input[type="search"]') as HTMLInputElement
        searchInput?.focus()
        return
      }

      // ── Reading View Shortcuts ──
      if (activeEmailId) {
        if (e.key === "u" || e.key === "Escape") {
          e.preventDefault()
          closeEmail()
          return
        }
        if (e.key === "k") {
          e.preventDefault()
          openNewerThread()
          return
        }
        if (e.key === "j") {
          e.preventDefault()
          openOlderThread()
          return
        }
        if (e.key === "r") {
          e.preventDefault()
          startInlineReply("reply")
          return
        }
        if (e.key === "a") {
          e.preventDefault()
          startInlineReply("reply_all")
          return
        }
        if (e.key === "f") {
          e.preventDefault()
          handleStartForward()
          return
        }
        if (e.key === "e") {
          e.preventDefault()
          archiveSelected()
          closeEmail()
          return
        }
        if (e.key === "#") {
          e.preventDefault()
          deleteSelected()
          closeEmail()
          return
        }
        return
      }

      // ── List View Shortcuts ──
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault()
        setFocusedEmailIndex((prev) => Math.min(prev + 1, filteredEmails.length - 1))
        return
      }
      if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault()
        setFocusedEmailIndex((prev) => Math.max(prev - 1, 0))
        return
      }
      if (e.key === "x") {
        e.preventDefault()
        const target = filteredEmails[focusedEmailIndex]
        if (target) {
          toggleSelect(target.id)
        }
        return
      }
      if (e.key === "Enter" || e.key === "o") {
        e.preventDefault()
        const target = filteredEmails[focusedEmailIndex]
        if (target) {
          openEmail(target.id)
        }
        return
      }
      if (e.key === "e") {
        e.preventDefault()
        if (selectedIds.size > 0) {
          archiveSelected()
        } else {
          const target = filteredEmails[focusedEmailIndex]
          if (target) {
            toggleSelect(target.id)
            archiveSelected()
          }
        }
        return
      }
      if (e.key === "#") {
        e.preventDefault()
        if (selectedIds.size > 0) {
          deleteSelected()
        } else {
          const target = filteredEmails[focusedEmailIndex]
          if (target) {
            toggleSelect(target.id)
            deleteSelected()
          }
        }
        return
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [
    activeEmailId,
    focusedEmailIndex,
    filteredEmails,
    selectedIds,
    isComposeOpen,
    openEmail,
    closeEmail,
    toggleSelect,
    archiveSelected,
    deleteSelected,
  ])

  // ─── Step 2: Strictly Uniform Row Height Table Columns & Selection Tinting ───
  const columns: TableColumn<EmailThread>[] = [
    {
      key: "selectionAndStar",
      header: "",
      width: pixel(72),
      renderCell: (item) => {
        const isSelected = selectedIds.has(item.id)

        return (
          <HStack
            gap={1}
            vAlign="center"
            minHeight={28}
            onClick={(e) => e.stopPropagation()}
          >
            <CheckboxInput
              label={`Select ${item.senderName}`}
              isLabelHidden
              size="sm"
              value={isSelected}
              onChange={() => toggleSelect(item.id)}
            />
            <IconButton
              label={item.isStarred ? "Starred" : "Not starred"}
              tooltip={item.isStarred ? "Starred" : "Star"}
              variant="ghost"
              size="sm"
              icon={
                <Star
                  size={16}
                  className={item.isStarred ? "fill-warning stroke-warning" : undefined}
                />
              }
              onClick={(e) => toggleStar(item.id, e)}
            />
          </HStack>
        )
      },
    },
    {
      key: "sender",
      header: "",
      width: pixel(148),
      renderCell: (item) => {
        const isSelected = selectedIds.has(item.id)
        return (
          <HStack
            gap={1.5}
            vAlign="center"
            minHeight={28}
            className="cursor-pointer select-none"
            onClick={() => openEmail(item.id)}
          >
            <HoverCard
              placement="below"
              alignment="start"
              label={`Contact details for ${item.senderName}`}
              content={
                <VStack gap={2} padding={3} width={260}>
                  <HStack gap={2} vAlign="center">
                    <Avatar name={item.senderName} size={36} />
                    <VStack gap={0.5}>
                      <Text type="body" weight="semibold" size="sm" maxLines={1}>
                        {item.senderName}
                      </Text>
                      <Text type="supporting" color="secondary" size="xsm" maxLines={1}>
                        {item.senderEmail || item.senderName}
                      </Text>
                    </VStack>
                  </HStack>
                  <HStack gap={1.5} hAlign="end">
                    <Button
                      label="Send email"
                      size="sm"
                      variant="secondary"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleOpenComposeWithDraft({ to: item.senderEmail || item.senderName })
                      }}
                    />
                  </HStack>
                </VStack>
              }
            >
              <Text
                type="body"
                weight={item.isUnread || isSelected ? "bold" : "normal"}
                color={item.isUnread ? "primary" : "secondary"}
                maxLines={1}
                hasTruncateTooltip={false}
              >
                {item.senderName}
              </Text>
            </HoverCard>
            {item.threadCount && item.threadCount > 1 ? (
              <Text
                type="supporting"
                weight="normal"
                color="secondary"
              >
                {item.threadCount}
              </Text>
            ) : null}
          </HStack>
        )
      },
    },
    {
      key: "contentAndActions",
      header: "",
      width: proportional(1, { minWidth: 320 }),
      renderCell: (item) => {
        return (
          <VStack
            gap={1}
            vAlign="start"
            width="100%"
            className="cursor-pointer select-none"
            onClick={() => openEmail(item.id)}
          >
            {/* Line 1: Left (Labels + Subject — Snippet) flexes cleanly; Right (Date or Hover Tools) swaps via CSS useContainerReveal */}
            <HStack
              gap={3}
              hAlign="between"
              vAlign="center"
              height={28}
              width="100%"
            >
              {/* Left side: Auto-shrinks and pushes snippet to ellipsis when hover tools appear */}
              <StackItem size="fill">
                <HStack gap={2} vAlign="center" width="100%">
                  {/* Folder badge if not inbox or when searching */}
                  {(activeFolder === "starred" || activeFolder === "snoozed" || searchQuery.trim()) && item.folder && (
                    <StackItem size="static">
                      <Token
                        label={item.folder.charAt(0).toUpperCase() + item.folder.slice(1)}
                        size="sm"
                        color="gray"
                      />
                    </StackItem>
                  )}

                  {/* Label token */}
                  {item.label && (
                    <StackItem size="static">
                      <Token
                        label={item.label}
                        size="sm"
                        color={item.label === "Clients" ? "green" : item.label === "Work" ? "blue" : "purple"}
                      />
                    </StackItem>
                  )}

                  <StackItem size="fill">
                    <Text
                      type="body"
                      maxLines={1}
                      hasTruncateTooltip={false}
                      color={item.isUnread ? "primary" : "secondary"}
                    >
                      <Text
                        as="span"
                        type="inherit"
                        weight={item.isUnread ? "bold" : "normal"}
                        color={item.isUnread ? "primary" : "secondary"}
                      >
                        {item.subject}
                      </Text>
                      <Text as="span" type="inherit" color="secondary" weight="normal">
                        {" "}— {item.snippet}
                      </Text>
                    </Text>
                  </StackItem>
                </HStack>
              </StackItem>

              {/* Right side: CSS-driven hover/focus reveal swap with timestamp */}
              <StackItem size="static">
                <HStack
                  gap={1}
                  hAlign="end"
                  vAlign="center"
                  height={28}
                  onClick={(e) => e.stopPropagation()}
                >
                  <HStack
                    {...rowReveal.getContentRevealProps()}
                    className={!isTouchDevice ? "basis-full shrink-0" : undefined}
                    gap={0}
                    hAlign="end"
                    vAlign="center"
                  >
                    <IconButton
                      label="Archive"
                      tooltip="Archive"
                      variant="ghost"
                      size="sm"
                      icon={<Archive size={16} />}
                      onClick={() => archiveSelected([item.id])}
                    />
                    <IconButton
                      label="Delete"
                      tooltip="Delete"
                      variant="ghost"
                      size="sm"
                      icon={<Trash2 size={16} />}
                      onClick={() => deleteSelected([item.id])}
                    />
                    <IconButton
                      label={item.isUnread ? "Mark as read" : "Mark as unread"}
                      tooltip={item.isUnread ? "Mark as read" : "Mark as unread"}
                      variant="ghost"
                      size="sm"
                      icon={item.isUnread ? <MailOpen size={16} /> : <Mail size={16} />}
                      onClick={() => toggleEmailRead(item.id)}
                    />
                    <DropdownMenu
                      alignment="end"
                      renderTrigger={(triggerProps) => (
                        <IconButton
                          label="Snooze"
                          tooltip="Snooze"
                          variant="ghost"
                          size="sm"
                          icon={<Clock size={16} />}
                          {...triggerProps}
                        />
                      )}
                      items={[
                        {
                          label: "Later today (6:00 PM)",
                          onClick: () => snoozeEmails([item.id], "Later today 6:00 PM"),
                        },
                        {
                          label: "Tomorrow morning (8:00 AM)",
                          onClick: () => snoozeEmails([item.id], "Tomorrow 8:00 AM"),
                        },
                        {
                          label: "This weekend (Sat 9:00 AM)",
                          onClick: () => snoozeEmails([item.id], "This weekend"),
                        },
                        {
                          label: "Next week (Mon 8:00 AM)",
                          onClick: () => snoozeEmails([item.id], "Next week"),
                        },
                      ]}
                    />
                  </HStack>

                  <StackItem size="fill">
                    <HStack
                      {...(isTouchDevice
                        ? {}
                        : rowReveal.getContentRevealProps({ isRevealInverted: true }))}
                      className="overflow-hidden"
                      hAlign="end"
                      vAlign="center"
                    >
                      {item.isoDate ? (
                        <Timestamp
                          value={item.isoDate}
                          format="auto"
                          hasTooltip
                          type="supporting"
                          size="xsm"
                          color={item.isUnread ? "primary" : "secondary"}
                          weight={item.isUnread ? "bold" : "normal"}
                        />
                      ) : (
                        <Text
                          type="supporting"
                          weight={item.isUnread ? "bold" : "normal"}
                          color={item.isUnread ? "primary" : "secondary"}
                          maxLines={1}
                          hasTruncateTooltip={false}
                          textWrap="nowrap"
                        >
                          {item.timestamp}
                        </Text>
                      )}
                    </HStack>
                  </StackItem>
                </HStack>
              </StackItem>
            </HStack>

            {/* Line 2: Attachments on a new line (Gmail style) */}
            {item.attachments && item.attachments.length > 0 && (
              <HStack
                gap={1.5}
                vAlign="center"
                wrap="wrap"
                onClick={(e) => e.stopPropagation()}
              >
                {item.attachments.map((att) => (
                  <Token
                    key={att.id}
                    label={`${att.name} (${att.size})`}
                    size="sm"
                    color={getAttachmentTokenColor(att.name, att.type)}
                    icon={<Paperclip size={12} />}
                    onClick={() =>
                      downloadTextFile(
                        att.name,
                        `Attachment: ${att.name} (${att.size})`,
                        "application/octet-stream"
                      )
                    }
                  />
                ))}
              </HStack>
            )}
          </VStack>
        )
      },
    },
  ]

  const storageUsedGB = (quotaInfo.usedBytes / (1024 * 1024 * 1024)).toFixed(1)
  const storageTotalGB = (quotaInfo.totalBytes / (1024 * 1024 * 1024)).toFixed(0)

  return (
    <AppShell
      variant="elevated"
      contentPadding={0}
      height="fill"
      topNav={
        <TopNav
          label="Webmail navigation"
          heading={
            <TopNavHeading
              heading="Postarc Webmail"
              headingHref="/mail"
            />
          }
          centerContent={
            <TextInput
              label="Search mail"
              isLabelHidden
              type="search"
              placeholder="Search mail (from, to, subject, keywords)..."
              value={searchQuery}
              onChange={(val) => setSearchQuery(val)}
              startIcon={<Search size={16} />}
              hasClear
              width={480}
              size="md"
            />
          }
          endContent={
            <HStack gap={2} vAlign="center">
              <IconButton
                label="Keyboard shortcuts"
                tooltip="Keyboard shortcuts (?)"
                variant="ghost"
                size="sm"
                icon={<Keyboard size={17} />}
                onClick={() => setIsShortcutsDialogOpen(true)}
              />
              <ThemeToggle />
              <DropdownMenu
                alignment="end"
                header={
                  <VStack gap={0.5} padding={2} width="100%">
                    <Text type="body" size="sm" weight="semibold">
                      {activeIdentity.name}
                    </Text>
                    <Text type="supporting" size="xsm" color="secondary">
                      {activeIdentity.email}
                    </Text>
                  </VStack>
                }
                renderTrigger={(triggerProps) => (
                  <Avatar
                    name={activeIdentity.name}
                    size={32}
                    tooltip={`${activeIdentity.name} (${activeIdentity.email})`}
                    {...triggerProps}
                  />
                )}
                items={[
                  {
                    label: "Calendar",
                    href: "/mail/calendar",
                    icon: <Calendar size={16} />,
                  },
                  {
                    label: "Contacts",
                    href: "/mail/contacts",
                    icon: <Users size={16} />,
                  },
                  {
                    label: "Sieve Mail Rules",
                    href: "/mail/filters",
                    icon: <Filter size={16} />,
                  },
                  { type: "divider" as const },
                  {
                    label: "Mailbox Settings",
                    href: "/mail/settings",
                    icon: <Settings size={16} />,
                  },
                  { type: "divider" as const },
                  {
                    label: "Sign out",
                    variant: "destructive",
                    icon: <LogOut size={16} />,
                    onClick: () => {
                      window.location.reload()
                    },
                  },
                ]}
              />
            </HStack>
          }
        />
      }
      sideNav={
        <SideNav
          aria-label="Mailbox folders"
          resizable={{
            defaultWidth: 230,
            minWidth: 180,
            maxWidth: 380,
          }}
          topContent={
            <VStack width="100%" padding={1}>
              <Button
                label="Compose"
                variant="primary"
                size="md"
                icon={<SquarePen size={16} />}
                width="100%"
                onClick={handleOpenCompose}
              />
            </VStack>
          }
          footer={
            <VStack gap={1} width="100%" padding={2}>
              <HStack hAlign="between" vAlign="center">
                <Text type="supporting" color="secondary" size="xsm">
                  Storage
                </Text>
                <Text type="supporting" color="secondary" size="xsm" weight="medium">
                  {storageUsedGB} / {storageTotalGB} GB ({quotaInfo.percent}%)
                </Text>
              </HStack>
              <ProgressBar
                label="Storage quota"
                isLabelHidden
                value={quotaInfo.percent}
                max={100}
                variant={quotaInfo.percent >= 80 ? "error" : "accent"}
              />
            </VStack>
          }
        >
          {/* Main Mailbox Folders */}
          <SideNavSection title="Mail" isHeaderHidden>
            <SideNavItem
              label="Inbox"
              icon={<Inbox size={18} />}
              isSelected={activeFolder === "inbox"}
              onClick={() => {
                setActiveFolder("inbox")
                closeEmail()
              }}
              endContent={
                unreadCounts.inbox > 0 ? (
                  <Badge label={String(unreadCounts.inbox)} variant="neutral" />
                ) : undefined
              }
            />
            <SideNavItem
              label="Starred"
              icon={<Star size={18} />}
              isSelected={activeFolder === "starred"}
              onClick={() => {
                setActiveFolder("starred")
                closeEmail()
              }}
              endContent={
                unreadCounts.starred > 0 ? (
                  <Badge label={String(unreadCounts.starred)} variant="neutral" />
                ) : undefined
              }
            />
            <SideNavItem
              label="Snoozed"
              icon={<Clock size={18} />}
              isSelected={activeFolder === "snoozed"}
              onClick={() => {
                setActiveFolder("snoozed")
                closeEmail()
              }}
            />
            <SideNavItem
              label="Sent"
              icon={<Send size={18} />}
              isSelected={activeFolder === "sent"}
              onClick={() => {
                setActiveFolder("sent")
                closeEmail()
              }}
            />
            <SideNavItem
              label="Drafts"
              icon={<FileText size={18} />}
              isSelected={activeFolder === "drafts"}
              onClick={() => {
                setActiveFolder("drafts")
                closeEmail()
              }}
              endContent={
                unreadCounts.drafts > 0 ? (
                  <Badge label={String(unreadCounts.drafts)} variant="neutral" />
                ) : undefined
              }
            />
            <SideNavItem
              label="Archive"
              icon={<Archive size={18} />}
              isSelected={activeFolder === "archive"}
              onClick={() => {
                setActiveFolder("archive")
                closeEmail()
              }}
            />
            <SideNavItem
              label="Spam"
              icon={<AlertCircle size={18} />}
              isSelected={activeFolder === "spam"}
              onClick={() => {
                setActiveFolder("spam")
                closeEmail()
              }}
              endContent={
                unreadCounts.spam > 0 ? (
                  <Badge label={String(unreadCounts.spam)} variant="neutral" />
                ) : undefined
              }
            />
            <SideNavItem
              label="Trash"
              icon={<Trash2 size={18} />}
              isSelected={activeFolder === "trash"}
              onClick={() => {
                setActiveFolder("trash")
                closeEmail()
              }}
            />
          </SideNavSection>

          {/* Custom Folders Section */}
          <SideNavSection title="Folders">
            {customFolders.map((folder) => (
              <SideNavItem
                key={folder.id}
                label={folder.name}
                icon={<Folder size={18} color={folder.color || "currentColor"} />}
                isSelected={activeFolder === folder.id}
                onClick={() => {
                  setActiveFolder(folder.id)
                  closeEmail()
                }}
                endContent={
                  folder.unreadCount > 0 ? (
                    <Badge label={String(folder.unreadCount)} variant="neutral" />
                  ) : undefined
                }
              />
            ))}
            <SideNavItem
              label="New Folder"
              icon={<Plus size={18} />}
              onClick={() => setIsFolderDialogOpen(true)}
            />
          </SideNavSection>
        </SideNav>
      }
    >
      {activeEmailId && activeEmail ? (
        /* ── READING PANE (PINNED ASTRYX TOOLBAR + CARDLESS GMAIL THREAD STREAM) ── */
        <Layout
          height="fill"
          defaultHasDividers
          header={
            <LayoutHeader padding={0} hasDivider label="Thread actions">
              <Section variant="transparent" paddingInline={4} paddingBlock={0} width="100%">
                <Toolbar
                  label="Thread actions"
                  size="sm"
                  startContent={
                    <>
                      <IconButton
                        label="Back to Inbox"
                        tooltip="Back to Inbox (u)"
                        variant="ghost"
                        size="sm"
                        icon={<ArrowLeft size={18} />}
                        onClick={closeEmail}
                      />
                      <IconButton
                        label="Archive"
                        tooltip="Archive (e)"
                        variant="ghost"
                        size="sm"
                        icon={<Archive size={18} />}
                        onClick={() => archiveSelected()}
                      />
                      <IconButton
                        label="Report spam"
                        tooltip="Report spam"
                        variant="ghost"
                        size="sm"
                        icon={<AlertCircle size={18} />}
                        onClick={() => reportSpam()}
                      />
                      <IconButton
                        label="Delete"
                        tooltip="Delete (#)"
                        variant="ghost"
                        size="sm"
                        icon={<Trash2 size={18} />}
                        onClick={() => deleteSelected()}
                      />
                      <IconButton
                        label="Mark as unread"
                        tooltip="Mark as unread"
                        variant="ghost"
                        size="sm"
                        icon={<Mail size={18} />}
                        onClick={markSelectedAsUnread}
                      />

                      <DropdownMenu
                        alignment="start"
                        renderTrigger={(triggerProps) => (
                          <IconButton
                            label="Snooze"
                            tooltip="Snooze"
                            variant="ghost"
                            size="sm"
                            icon={<Clock size={18} />}
                            {...triggerProps}
                          />
                        )}
                        items={[
                          {
                            label: "Later today (6:00 PM)",
                            onClick: () => snoozeEmails([activeEmail.id], "Later today 6:00 PM"),
                          },
                          {
                            label: "Tomorrow morning (8:00 AM)",
                            onClick: () => snoozeEmails([activeEmail.id], "Tomorrow 8:00 AM"),
                          },
                          {
                            label: "This weekend (Sat 9:00 AM)",
                            onClick: () => snoozeEmails([activeEmail.id], "This weekend"),
                          },
                          {
                            label: "Next week (Mon 8:00 AM)",
                            onClick: () => snoozeEmails([activeEmail.id], "Next week"),
                          },
                        ]}
                      />

                      <DropdownMenu
                        alignment="start"
                        renderTrigger={(props) => (
                          <IconButton
                            label="Move to"
                            tooltip="Move to"
                            variant="ghost"
                            size="sm"
                            icon={<FolderInput size={18} />}
                            {...props}
                          />
                        )}
                        items={[
                          { label: "Inbox", onClick: () => moveEmailsToFolder([activeEmail.id], "inbox") },
                          { label: "Archive", onClick: () => moveEmailsToFolder([activeEmail.id], "archive") },
                          { label: "Spam", onClick: () => moveEmailsToFolder([activeEmail.id], "spam") },
                          { label: "Trash", onClick: () => moveEmailsToFolder([activeEmail.id], "trash") },
                          ...customFolders.map((f) => ({
                            label: f.name,
                            onClick: () => moveEmailsToFolder([activeEmail.id], f.id),
                          })),
                        ]}
                      />
                      <DropdownMenu
                        alignment="start"
                        renderTrigger={(props) => (
                          <IconButton
                            label="Labels"
                            tooltip="Labels"
                            variant="ghost"
                            size="sm"
                            icon={<Tag size={18} />}
                            {...props}
                          />
                        )}
                        items={[
                          {
                            label: "Clients",
                            onClick: () => applyThreadLabel([activeEmail.id], "Clients"),
                          },
                          {
                            label: "Invoices",
                            onClick: () => applyThreadLabel([activeEmail.id], "Invoices"),
                          },
                          {
                            label: "Personal",
                            onClick: () => applyThreadLabel([activeEmail.id], "Personal"),
                          },
                          {
                            label: "Work",
                            onClick: () => applyThreadLabel([activeEmail.id], "Work"),
                          },
                        ]}
                      />
                    </>
                  }
                  endContent={
                    <>
                      <Text type="supporting" color="secondary" textWrap="nowrap">
                        {activeThreadIndex >= 0 ? activeThreadIndex + 1 : 1} of {filteredEmails.length}
                      </Text>
                      <IconButton
                        label="Newer conversation"
                        tooltip="Newer (k)"
                        variant="ghost"
                        size="sm"
                        icon={<ChevronLeft size={16} />}
                        isDisabled={!hasNewerThread}
                        onClick={openNewerThread}
                      />
                      <IconButton
                        label="Older conversation"
                        tooltip="Older (j)"
                        variant="ghost"
                        size="sm"
                        icon={<ChevronRight size={16} />}
                        isDisabled={!hasOlderThread}
                        onClick={openOlderThread}
                      />
                    </>
                  }
                />
              </Section>
            </LayoutHeader>
          }
          content={
            <LayoutContent ref={threadScrollRef} padding={0} label="Email conversation">
              {/* Subject & Thread Action Header */}
              <Section variant="transparent" paddingInline={4} paddingBlock={3} width="100%">
                <HStack
                  hAlign="between"
                  vAlign="center"
                  width="100%"
                  gap={3}
                >
                <StackItem size="fill">
                  <HStack gap={2} vAlign="center" wrap="wrap">
                    <Heading level={2}>
                      {activeEmail.subject}
                    </Heading>
                    <Token
                      label={activeEmail.folder.charAt(0).toUpperCase() + activeEmail.folder.slice(1)}
                      size="sm"
                      color="gray"
                      onRemove={
                        activeEmail.folder === "inbox"
                          ? () => archiveSelected([activeEmail.id])
                          : undefined
                      }
                    />
                    {activeEmail.label && (
                      <Token
                        label={activeEmail.label}
                        size="sm"
                        color={activeEmail.label === "Clients" ? "green" : "blue"}
                        onRemove={() => removeThreadLabel(activeEmail.id)}
                      />
                    )}
                  </HStack>
                </StackItem>

                <StackItem size="static">
                  <HStack gap={2} vAlign="center">
                    {threadParticipants.length > 1 && (
                      <AvatarGroup size={24}>
                        {threadParticipants.slice(0, 3).map((p) => (
                          <Avatar
                            key={p.email}
                            name={p.name}
                            src={p.avatar}
                            tooltip={`${p.name} <${p.email}>`}
                          />
                        ))}
                        {threadParticipants.length > 3 && (
                          <AvatarGroupOverflow count={threadParticipants.length - 3} />
                        )}
                      </AvatarGroup>
                    )}
                    <Text type="supporting" color="secondary" textWrap="nowrap">
                      {threadMessages.length} {threadMessages.length === 1 ? "message" : "messages"}
                    </Text>
                    <HStack gap={0.5} vAlign="center">
                      <IconButton
                        label="Export as EML"
                        tooltip="Download RFC 822 .eml"
                        variant="ghost"
                        size="sm"
                        icon={<Download size={16} />}
                        onClick={() => {
                          const latest = threadMessages[threadMessages.length - 1]
                          if (!latest) return
                          downloadTextFile(
                            `${activeEmail.id}.eml`,
                            buildMessageRfc822Source(latest, activeEmail.subject)
                          )
                        }}
                      />
                      {threadMessages.length > 1 && (
                        <IconButton
                          label={allExpanded ? "Collapse all" : "Expand all"}
                          tooltip={allExpanded ? "Collapse all" : "Expand all"}
                          variant="ghost"
                          size="sm"
                          icon={<ChevronsUpDown size={16} />}
                          onClick={allExpanded ? collapseAll : expandAll}
                        />
                      )}
                      <IconButton
                        label="Print all"
                        tooltip="Print all"
                        variant="ghost"
                        size="sm"
                        icon={<Printer size={16} />}
                        onClick={() => window.print()}
                      />
                    </HStack>
                  </HStack>
                </StackItem>
              </HStack>
              </Section>

              {/* Remote Image Privacy Protection Banner */}
              {activeEmail.hasRemoteImages && !allowedRemoteImages.has(activeEmail.id) && (
                <Section variant="transparent" paddingInline={4} paddingBlock={2} width="100%">
                  <Banner
                    status="info"
                    collapsible={{ defaultIsOpen: false }}
                    title="Remote tracker images are paused to protect your privacy."
                    endContent={
                      <Button
                        variant="secondary"
                        size="sm"
                        label="Load images"
                        onClick={() => allowRemoteImagesForEmail(activeEmail.id)}
                      />
                    }
                  >
                    <Text type="supporting" size="sm" color="secondary">
                      External HTTP tracking pixels from unapproved senders stay blocked until you click Load images.
                    </Text>
                  </Banner>
                </Section>
              )}

              {/* Message Conversation Thread Stream (Bleed List for collapsed rows + Section dividers for expanded messages) */}
              {(() => {
                type MessageRecord = (typeof threadMessages)[number]
                type ThreadEntry =
                  | { kind: "supercollapse"; hiddenCount: number }
                  | { kind: "collapsed"; msg: MessageRecord; idx: number; total: number }
                  | { kind: "expanded"; msg: MessageRecord; idx: number; total: number }

                const total = threadMessages.length
                const shouldSuperCollapse = total >= 4 && !showAllMiddle
                const entries: ThreadEntry[] = []

                threadMessages.forEach((msg, idx) => {
                  const isHiddenMiddle = shouldSuperCollapse && idx > 0 && idx < total - 2
                  if (isHiddenMiddle) {
                    if (idx === 1) {
                      entries.push({ kind: "supercollapse", hiddenCount: total - 3 })
                    }
                    return
                  }
                  entries.push({
                    kind: isMsgExpanded(msg.id, idx, total) ? "expanded" : "collapsed",
                    msg,
                    idx,
                    total,
                  })
                })

                type CollapsedEntry = Extract<ThreadEntry, { kind: "collapsed" }>
                type ExpandedEntry = Extract<ThreadEntry, { kind: "expanded" }>
                type ThreadGroup =
                  | { type: "list"; key: string; items: CollapsedEntry[] }
                  | { type: "supercollapse"; key: string; hiddenCount: number }
                  | { type: "expanded"; key: string; entry: ExpandedEntry }

                const groups: ThreadGroup[] = []
                for (const entry of entries) {
                  if (entry.kind === "expanded") {
                    groups.push({ type: "expanded", key: entry.msg.id, entry })
                  } else if (entry.kind === "supercollapse") {
                    groups.push({
                      type: "supercollapse",
                      key: `supercollapse_${entry.hiddenCount}_${groups.length}`,
                      hiddenCount: entry.hiddenCount,
                    })
                  } else {
                    const prev = groups[groups.length - 1]
                    if (prev && prev.type === "list") {
                      prev.items.push(entry)
                    } else {
                      groups.push({
                        type: "list",
                        key: `list_${entry.msg.id}`,
                        items: [entry],
                      })
                    }
                  }
                }

                return groups.map((group, groupIdx) => {
                  const prevGroup = groupIdx > 0 ? groups[groupIdx - 1] : null
                  const needsTopDivider = !prevGroup || prevGroup.type !== "supercollapse"

                  if (group.type === "supercollapse") {
                    return (
                      <Section
                        key={group.key}
                        variant="transparent"
                        padding={0}
                        width="100%"
                      >
                        <HStack vAlign="center" gap={2} width="100%" paddingBlock={1.5}>
                          <StackItem size="static">
                            <VStack width={48}>
                              <Divider />
                            </VStack>
                          </StackItem>
                          <StackItem size="static">
                            <Button
                              variant="secondary"
                              size="sm"
                              icon={<ChevronsUpDown size={14} />}
                              label={`${group.hiddenCount} older message${group.hiddenCount > 1 ? "s" : ""}`}
                              onClick={() => setShowAllMiddle(true)}
                            />
                          </StackItem>
                          <StackItem size="fill">
                            <Divider />
                          </StackItem>
                        </HStack>
                      </Section>
                    )
                  }

                  if (group.type === "list") {
                    return (
                      <Section
                        key={group.key}
                        variant="transparent"
                        dividers={needsTopDivider ? ["top"] : undefined}
                        paddingInline={4}
                        paddingBlock={0}
                        width="100%"
                      >
                        <List edge="bleed" hasDividers density="balanced">
                          {group.items.map((item) => {
                            const { msg, idx, total: msgTotal } = item
                            const isStarred =
                              messageStarred[msg.id] ?? msg.isStarred ?? activeEmail.isStarred

                            return (
                              <ListItem
                                key={msg.id}
                                align="center"
                                startContent={
                                  <Avatar
                                    name={msg.senderName}
                                    src={msg.senderAvatar}
                                    size={32}
                                  />
                                }
                                label={
                                  <HStack gap={1.5} vAlign="center">
                                    <Text
                                      type="body"
                                      weight="semibold"
                                      color="primary"
                                      maxLines={1}
                                    >
                                      {msg.senderName}
                                    </Text>
                                    {msg.isVerified && (
                                      <StackItem size="static">
                                        <VerifiedSeal />
                                      </StackItem>
                                    )}
                                  </HStack>
                                }
                                description={
                                  <Text
                                    type="body"
                                    color="secondary"
                                    maxLines={1}
                                    hasTruncateTooltip={false}
                                  >
                                    {msg.body.replace(/\n+/g, " ")}
                                  </Text>
                                }
                                endContent={
                                  <HStack gap={2} vAlign="center">
                                    {msg.isoDate ? (
                                      <Timestamp value={msg.isoDate} format="auto" size="sm" />
                                    ) : (
                                      <Text type="supporting" color="secondary" textWrap="nowrap">
                                        {msg.timestamp}
                                      </Text>
                                    )}
                                    <IconButton
                                      label={isStarred ? "Starred" : "Not starred"}
                                      variant="ghost"
                                      size="sm"
                                      icon={
                                        <Star
                                          size={16}
                                          className={isStarred ? "fill-warning stroke-warning" : undefined}
                                        />
                                      }
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        toggleMessageStar(msg.id)
                                      }}
                                    />
                                  </HStack>
                                }
                                onClick={() => toggleExpand(msg.id, idx, msgTotal)}
                              />
                            )
                          })}
                        </List>
                      </Section>
                    )
                  }

                  const { msg, idx, total: msgTotal } = group.entry
                  const isStarred =
                    messageStarred[msg.id] ?? msg.isStarred ?? activeEmail.isStarred
                  const htmlCat = msg.htmlBody ? classifyHtmlEmail(msg.htmlBody) : null
                  const canToggleHtmlTheme =
                    mode === "dark" && Boolean(msg.htmlBody) && htmlCat === "designed"
                  const isUsingLightPaper =
                    Boolean(lightPaperOverrides[msg.id]) ||
                    (emailDarkMode === "paper" && !darkMessageOverrides[msg.id])

                  const recipientsSummary = (() => {
                    const list = [msg.recipientEmail, ...(msg.ccEmails || [])].filter(Boolean)
                    const primaryLabel =
                      msg.recipientEmail.toLowerCase() === activeIdentity.email.toLowerCase()
                        ? "me"
                        : msg.recipientEmail.split("@")[0]
                    if (list.length <= 1) return `to ${primaryLabel}`
                    return `to ${primaryLabel} +${list.length - 1}`
                  })()

                  return (
                    <Section
                      key={msg.id}
                      variant="transparent"
                      dividers={needsTopDivider ? ["top"] : undefined}
                      paddingInline={4}
                      paddingBlock={0}
                      width="100%"
                    >
                      <VStack gap={3} width="100%" paddingBlockStart={2} paddingBlockEnd={3}>
                        {/* Message Header (matches collapsed 16px/56px geometry and 20px+20px line height) */}
                        <HStack gap={2} vAlign="center" width="100%">
                          <StackItem size="static">
                            <Avatar
                              name={msg.senderName}
                              src={msg.senderAvatar}
                              size={32}
                            />
                          </StackItem>
                          <StackItem size="fill">
                            <VStack gap={0} width="100%">
                              {/* Line 1: Sender Name + Verified + Email (strictly 20px box, no action buttons) */}
                              <HStack gap={1.5} vAlign="center" wrap="wrap">
                                <Text
                                  type="body"
                                  weight="semibold"
                                  color="primary"
                                >
                                  {msg.senderName}
                                </Text>
                                {msg.isVerified && (
                                  <StackItem size="static">
                                    <VerifiedSeal />
                                  </StackItem>
                                )}
                                <Text
                                  type="body"
                                  color="secondary"
                                >
                                  &lt;{msg.senderEmail}&gt;
                                </Text>
                              </HStack>

                              {/* Line 2: Clean block Link trigger at base size -> compact Gmail details Popover */}
                              <HStack>
                                <Popover
                                  label="Message details"
                                  placement="below"
                                  alignment="start"
                                  width={340}
                                  padding={3}
                                  content={
                                    <MetadataList label={{ position: "start", width: 68 }}>
                                      <MetadataListItem label="from">
                                        <Text type="body" size="sm" color="primary">
                                          <Text as="span" size="sm" weight="semibold">
                                            {msg.senderName}
                                          </Text>{" "}
                                          <Text as="span" size="sm" color="secondary">
                                            &lt;{msg.senderEmail}&gt;
                                          </Text>
                                        </Text>
                                      </MetadataListItem>
                                      <MetadataListItem label="to">
                                        <Text type="body" size="sm">
                                          {msg.recipientEmail}
                                        </Text>
                                      </MetadataListItem>
                                      {msg.ccEmails && msg.ccEmails.length > 0 && (
                                        <MetadataListItem label="cc">
                                          <Text type="body" size="sm">
                                            {msg.ccEmails.join(", ")}
                                          </Text>
                                        </MetadataListItem>
                                      )}
                                      <MetadataListItem label="date">
                                        <Text type="body" size="sm">
                                          {msg.fullDate}
                                        </Text>
                                      </MetadataListItem>
                                      <MetadataListItem label="subject">
                                        <Text type="body" size="sm" maxLines={2}>
                                          {activeEmail.subject}
                                        </Text>
                                      </MetadataListItem>
                                      {msg.mailedBy && (
                                        <MetadataListItem label="mailed-by">
                                          <Text type="body" size="sm">
                                            {msg.mailedBy}
                                          </Text>
                                        </MetadataListItem>
                                      )}
                                      {msg.signedBy && (
                                        <MetadataListItem label="signed-by">
                                          <Text type="body" size="sm">
                                            {msg.signedBy}
                                          </Text>
                                        </MetadataListItem>
                                      )}
                                      <MetadataListItem label="security">
                                        <HStack gap={1.5} vAlign="center">
                                          <Lock size={12} />
                                          <StatusDot
                                            variant={msg.spfStatus === "fail" ? "error" : "success"}
                                            label={`SPF ${msg.spfStatus || "pass"}`}
                                          />
                                          <Text type="body" size="sm">
                                            {msg.security || "Standard encryption (TLS)"}
                                          </Text>
                                        </HStack>
                                      </MetadataListItem>
                                    </MetadataList>
                                  }
                                >
                                  <Link
                                    label={`Show details (${recipientsSummary})`}
                                    type="body"
                                    display="block"
                                    color="secondary"
                                    hasUnderline={false}
                                  >
                                    {recipientsSummary}{" "}
                                    <ChevronDown size={14} className="inline-block" />
                                  </Link>
                                </Popover>
                              </HStack>
                            </VStack>
                          </StackItem>

                          {/* Header Right Actions placed cleanly beside the 2-line identity block */}
                          <StackItem size="static">
                            <HStack gap={1} vAlign="center">
                              {msg.isoDate ? (
                                <Timestamp value={msg.isoDate} format="auto" size="sm" />
                              ) : (
                                <Text type="supporting" color="secondary" textWrap="nowrap">
                                  {msg.timestamp}
                                </Text>
                              )}
                              {canToggleHtmlTheme && (
                                <IconButton
                                  label={
                                    isUsingLightPaper
                                      ? "Turn off the lights (dark view)"
                                      : "Turn on the lights (light paper)"
                                  }
                                  tooltip={
                                    isUsingLightPaper
                                      ? "Turn off the lights"
                                      : "Turn on the lights"
                                  }
                                  variant="ghost"
                                  size="sm"
                                  icon={isUsingLightPaper ? <Moon size={16} /> : <Sun size={16} />}
                                  onClick={() => {
                                    if (emailDarkMode === "paper") {
                                      setDarkMessageOverrides((prev) => ({
                                        ...prev,
                                        [msg.id]: !prev[msg.id],
                                      }))
                                    } else {
                                      setLightPaperOverrides((prev) => ({
                                        ...prev,
                                        [msg.id]: !prev[msg.id],
                                      }))
                                    }
                                  }}
                                />
                              )}
                              <IconButton
                                label={isStarred ? "Starred" : "Star"}
                                tooltip={isStarred ? "Starred" : "Not starred"}
                                variant="ghost"
                                size="sm"
                                icon={
                                  <Star
                                    size={16}
                                    className={isStarred ? "fill-warning stroke-warning" : undefined}
                                  />
                                }
                                onClick={() => toggleMessageStar(msg.id)}
                              />
                              <IconButton
                                label="Reply"
                                tooltip="Reply (r)"
                                variant="ghost"
                                size="sm"
                                icon={<Reply size={16} />}
                                onClick={() => startInlineReply("reply", msg)}
                              />
                              {msgTotal > 1 && (
                                <IconButton
                                  label="Collapse message"
                                  tooltip="Collapse message"
                                  variant="ghost"
                                  size="sm"
                                  icon={<ChevronUp size={15} />}
                                  onClick={() => toggleExpand(msg.id, idx, msgTotal)}
                                />
                              )}
                              <MoreMenu
                                label="Message actions"
                                alignment="end"
                                size="sm"
                                items={[
                                  { label: "Reply", onClick: () => startInlineReply("reply", msg) },
                                  { label: "Reply all", onClick: () => startInlineReply("reply_all", msg) },
                                  { label: "Forward", onClick: () => startInlineReply("forward", msg) },
                                  ...(msg.htmlBody
                                    ? canToggleHtmlTheme
                                      ? [
                                          {
                                            label: isUsingLightPaper
                                              ? "Turn off the lights (dark view)"
                                              : "Turn on the lights (light paper)",
                                            onClick: () => {
                                              if (emailDarkMode === "paper") {
                                                setDarkMessageOverrides((prev) => ({
                                                  ...prev,
                                                  [msg.id]: !prev[msg.id],
                                                }))
                                              } else {
                                                setLightPaperOverrides((prev) => ({
                                                  ...prev,
                                                  [msg.id]: !prev[msg.id],
                                                }))
                                              }
                                            },
                                          },
                                        ]
                                      : []
                                    : [
                                        {
                                          label: monospaceOverrides[msg.id]
                                            ? "Use proportional font"
                                            : "Use monospace font",
                                          onClick: () =>
                                            setMonospaceOverrides((prev) => ({
                                              ...prev,
                                              [msg.id]: !prev[msg.id],
                                            })),
                                        },
                                      ]),
                                  { type: "divider" as const },
                                  {
                                    label: "Show original (RFC 822)",
                                    onClick: () =>
                                      setOriginalSourceModal({
                                        subject: activeEmail.subject,
                                        source: buildMessageRfc822Source(msg, activeEmail.subject),
                                        filename: `${msg.id}.eml`,
                                      }),
                                  },
                                  { label: "Print message", onClick: () => printSingleMessage(msg) },
                                  { label: "Delete thread", variant: "destructive", onClick: () => deleteSelected() },
                                ]}
                              />
                            </HStack>
                          </StackItem>
                        </HStack>

                        {/* Email Content Body (Native Plain Text OR Sanitized Smart HTML, aligned 56px with sender text) */}
                        <VStack width="100%" paddingInlineStart={10} gap={3}>
                          {msg.htmlBody ? (
                            <HtmlEmailViewer
                              html={msg.htmlBody}
                              uiMode={mode}
                              emailDarkMode={emailDarkMode}
                              forceLightPaper={Boolean(lightPaperOverrides[msg.id])}
                              forceDarkCanvas={Boolean(darkMessageOverrides[msg.id])}
                              allowRemoteImages={Boolean(
                                activeEmail.remoteImagesAllowed || allowedRemoteImages.has(activeEmail.id)
                              )}
                            />
                          ) : (
                            <PlainTextEmailViewer
                              body={msg.body}
                              isMonospace={Boolean(monospaceOverrides[msg.id])}
                            />
                          )}

                          {/* Attachments: Downloadable File Tokens */}
                          {msg.attachments && msg.attachments.length > 0 && (
                            <VStack gap={2} width="100%" paddingBlockStart={2}>
                              <HStack gap={1.5} vAlign="center">
                                <Paperclip size={14} />
                                <Text type="supporting" color="secondary" weight="semibold">
                                  {msg.attachments.length} Attachment
                                  {msg.attachments.length > 1 ? "s" : ""}
                                </Text>
                              </HStack>

                              <HStack gap={2} wrap="wrap">
                                {msg.attachments.map((att) => (
                                  <Token
                                    key={att.id}
                                    label={`${att.name} (${att.size})`}
                                    size="md"
                                    color={getAttachmentTokenColor(att.name, att.type)}
                                    icon={<Download size={14} />}
                                    onClick={() =>
                                      downloadTextFile(
                                        att.name,
                                        `Attachment: ${att.name} (${att.size})`,
                                        "application/octet-stream"
                                      )
                                    }
                                  />
                                ))}
                              </HStack>
                            </VStack>
                          )}
                        </VStack>
                      </VStack>
                    </Section>
                  )
                })
              })()}

            </LayoutContent>
          }
          footer={
            <LayoutFooter padding={0} label="Reply actions">
              <VStack paddingInline={4} paddingBlock={3} width="100%">
                {!isReplying ? (
                  <HStack gap={2} vAlign="center" paddingInlineStart={10}>
                    <ButtonGroup label="Reply actions">
                      <Button
                        label="Reply"
                        icon={<Reply size={16} />}
                        variant="secondary"
                        size="md"
                        onClick={() => startInlineReply("reply")}
                      />
                      {(activeEmail.ccEmails?.length || threadMessages.some((m) => (m.ccEmails?.length || 0) > 0)) && (
                        <Button
                          label="Reply all"
                          icon={<ReplyAll size={16} />}
                          variant="secondary"
                          size="md"
                          onClick={() => startInlineReply("reply_all")}
                        />
                      )}
                    </ButtonGroup>
                    <Button
                      label="Forward"
                      icon={<Forward size={16} />}
                      variant="secondary"
                      size="md"
                      onClick={() => startInlineReply("forward")}
                    />
                  </HStack>
                ) : (
                  <Card padding={4} variant="muted" elevation="none" width="100%">
                    <VStack gap={3} width="100%">
                      <HStack hAlign="between" vAlign="center" width="100%" wrap="wrap" gap={2}>
                        <HStack gap={2} vAlign="center">
                          <DropdownMenu
                            alignment="start"
                            renderTrigger={(triggerProps) => (
                              <Button
                                label={
                                  replyMode === "forward"
                                    ? "Forward"
                                    : replyMode === "reply_all"
                                    ? "Reply all"
                                    : "Reply"
                                }
                                icon={
                                  replyMode === "forward" ? (
                                    <Forward size={15} />
                                  ) : replyMode === "reply_all" ? (
                                    <ReplyAll size={15} />
                                  ) : (
                                    <Reply size={15} />
                                  )
                                }
                                endContent={<ChevronDown size={13} />}
                                variant="secondary"
                                size="sm"
                                {...triggerProps}
                              />
                            )}
                            items={[
                              { label: "Reply", onClick: () => startInlineReply("reply") },
                              { label: "Reply all", onClick: () => startInlineReply("reply_all") },
                              { label: "Forward", onClick: () => startInlineReply("forward") },
                            ]}
                          />
                          <Text type="supporting" color="secondary">
                            {replyMode === "forward" ? "Forwarding thread" : `From ${activeIdentity.email}`}
                          </Text>
                        </HStack>

                        <IconButton
                          label="Pop out to floating composer"
                          tooltip="Pop out to docked composer"
                          variant="ghost"
                          size="sm"
                          icon={<ExternalLink size={15} />}
                          onClick={popOutReplyToComposer}
                        />
                      </HStack>

                      <HStack gap={2} width="100%" wrap="wrap">
                        <StackItem size="fill">
                          <TextInput
                            label="To"
                            placeholder="Recipients (To)..."
                            value={replyToInput}
                            onChange={(val) => setReplyToInput(val)}
                            size="sm"
                            width="100%"
                          />
                        </StackItem>
                        {(replyMode === "reply_all" || replyCcInput) && (
                          <StackItem size="fill">
                            <TextInput
                              label="Cc"
                              placeholder="Cc recipients..."
                              value={replyCcInput}
                              onChange={(val) => setReplyCcInput(val)}
                              size="sm"
                              width="100%"
                            />
                          </StackItem>
                        )}
                      </HStack>

                      <TextArea
                        label="Reply message"
                        isLabelHidden
                        placeholder={
                          replyMode === "forward"
                            ? "Add a note before forwarded message..."
                            : "Write your reply..."
                        }
                        value={replyText}
                        onChange={(val) => setReplyText(val)}
                        rows={4}
                        width="100%"
                      />

                      <HStack hAlign="between" vAlign="center" width="100%">
                        <HStack gap={2} vAlign="center">
                          <Button
                            label="Send"
                            variant="primary"
                            size="md"
                            icon={<Send size={16} />}
                            onClick={handleSendReply}
                            isDisabled={!replyText.trim() || !replyToInput.trim()}
                          />
                          <IconButton
                            label="Discard draft"
                            tooltip="Discard"
                            variant="ghost"
                            size="md"
                            icon={<Trash2 size={16} />}
                            onClick={() => {
                              setIsReplying(false)
                              setReplyText("")
                            }}
                          />
                        </HStack>

                        <HStack gap={2} vAlign="center">
                          <Kbd keys="mod+enter" />
                          <Text type="supporting" color="secondary">
                            Sent via Postarc Mailserver TLS
                          </Text>
                        </HStack>
                      </HStack>
                    </VStack>
                  </Card>
                )}
              </VStack>
            </LayoutFooter>
          }
        />
      ) : (
          /* ── LIST VIEW (PINNED TOOLBAR + CATEGORY TABS + COMPACT TABLE WITH CSS REVEAL) ── */
          <Layout
            height="fill"
            padding={0}
            header={
              <LayoutHeader
                padding={0}
                hasDivider={activeFolder !== "inbox"}
                label="Mailbox controls"
              >
                <Section variant="transparent" paddingInline={4} paddingBlock={0} width="100%">
                  <Toolbar
                    label="Mailbox actions"
                    size="sm"
                    startContent={
                      <>
                        <HStack gap={0} vAlign="center">
                          <CheckboxInput
                            label="Select all"
                            isLabelHidden
                            size="sm"
                            value={checkboxValue}
                            onChange={() => selectAll(hasSelection ? "none" : "all")}
                          />
                          <DropdownMenu
                            alignment="start"
                            renderTrigger={(triggerProps) => (
                              <IconButton
                                label="Select options"
                                tooltip="Select options"
                                variant="ghost"
                                size="sm"
                                icon={<ChevronDown size={14} />}
                                {...triggerProps}
                              />
                            )}
                            items={[
                              { label: "All", onClick: () => selectAll("all") },
                              { label: "None", onClick: () => selectAll("none") },
                              { type: "divider" as const },
                              { label: "Read", onClick: () => selectAll("read") },
                              { label: "Unread", onClick: () => selectAll("unread") },
                              { label: "Starred", onClick: () => selectAll("starred") },
                            ]}
                          />
                        </HStack>

                        {hasSelection ? (
                          <>
                            <IconButton
                              label="Archive"
                              tooltip="Archive"
                              variant="ghost"
                              size="sm"
                              icon={<Archive size={16} />}
                              onClick={() => archiveSelected()}
                            />
                            <IconButton
                              label="Report spam"
                              tooltip="Report spam"
                              variant="ghost"
                              size="sm"
                              icon={<AlertCircle size={16} />}
                              onClick={() => reportSpam()}
                            />
                            <IconButton
                              label="Delete"
                              tooltip="Delete"
                              variant="ghost"
                              size="sm"
                              icon={<Trash2 size={16} />}
                              onClick={() => deleteSelected()}
                            />
                            <IconButton
                              label="Mark as read"
                              tooltip="Mark as read"
                              variant="ghost"
                              size="sm"
                              icon={<MailOpen size={16} />}
                              onClick={markSelectedAsRead}
                            />
                            <IconButton
                              label="Mark as unread"
                              tooltip="Mark as unread"
                              variant="ghost"
                              size="sm"
                              icon={<Mail size={16} />}
                              onClick={markSelectedAsUnread}
                            />
                            <DropdownMenu
                              alignment="start"
                              renderTrigger={(triggerProps) => (
                                <IconButton
                                  label="Snooze"
                                  tooltip="Snooze"
                                  variant="ghost"
                                  size="sm"
                                  icon={<Clock size={16} />}
                                  {...triggerProps}
                                />
                              )}
                              items={[
                                {
                                  label: "Later today (6:00 PM)",
                                  onClick: () => snoozeEmails(Array.from(selectedIds), "Later today 6:00 PM"),
                                },
                                {
                                  label: "Tomorrow morning (8:00 AM)",
                                  onClick: () => snoozeEmails(Array.from(selectedIds), "Tomorrow 8:00 AM"),
                                },
                                {
                                  label: "This weekend (Sat 9:00 AM)",
                                  onClick: () => snoozeEmails(Array.from(selectedIds), "This weekend"),
                                },
                                {
                                  label: "Next week (Mon 8:00 AM)",
                                  onClick: () => snoozeEmails(Array.from(selectedIds), "Next week"),
                                },
                              ]}
                            />
                            <DropdownMenu
                              alignment="start"
                              renderTrigger={(triggerProps) => (
                                <IconButton
                                  label="Labels"
                                  tooltip="Labels"
                                  variant="ghost"
                                  size="sm"
                                  icon={<Tag size={16} />}
                                  {...triggerProps}
                                />
                              )}
                              items={[
                                {
                                  label: "Clients",
                                  onClick: () =>
                                    applyThreadLabel(Array.from(selectedIds), "Clients"),
                                },
                                {
                                  label: "Invoices",
                                  onClick: () =>
                                    applyThreadLabel(Array.from(selectedIds), "Invoices"),
                                },
                                {
                                  label: "Personal",
                                  onClick: () =>
                                    applyThreadLabel(Array.from(selectedIds), "Personal"),
                                },
                                {
                                  label: "Work",
                                  onClick: () =>
                                    applyThreadLabel(Array.from(selectedIds), "Work"),
                                },
                              ]}
                            />
                          </>
                        ) : (
                          <>
                            <IconButton
                              label="Refresh"
                              tooltip="Refresh"
                              variant="ghost"
                              size="sm"
                              icon={isRefreshing ? <Spinner size="sm" /> : <RefreshCw size={16} />}
                              isDisabled={isRefreshing}
                              onClick={handleRefresh}
                            />
                            <IconButton
                              label="Import .eml"
                              tooltip="Import RFC 822 .eml"
                              variant="ghost"
                              size="sm"
                              icon={<Upload size={16} />}
                              onClick={() => emlFileInputRef.current?.click()}
                            />
                            <MoreMenu
                              label="More folder actions"
                              size="sm"
                              alignment="end"
                              presentation="adaptive"
                              items={[
                                {
                                  label: unreadOnly ? "Show all messages" : "Show unread only",
                                  onClick: () => setUnreadOnly((prev) => !prev),
                                },
                                {
                                  label: "Mark all as read",
                                  onClick: () => markAllAsRead(activeFolder),
                                },
                                {
                                  label: "Select all in view",
                                  onClick: () => selectAll("all"),
                                },
                                ...(activeFolder === "trash"
                                  ? [
                                      {
                                        label: "Empty Trash now",
                                        variant: "destructive" as const,
                                        onClick: () => setIsEmptyTrashAlertOpen(true),
                                      },
                                    ]
                                  : []),
                                {
                                  label: "Keyboard shortcuts (?)",
                                  onClick: () => setIsShortcutsDialogOpen(true),
                                },
                              ]}
                            />
                          </>
                        )}
                      </>
                    }
                    endContent={
                      <Pagination
                        variant="count"
                        size="sm"
                        page={mailListPage + 1}
                        totalItems={filteredEmails.length}
                        pageSize={PAGE_SIZE}
                        onChange={(p) => setMailListPage(p - 1)}
                      />
                    }
                  />
                </Section>

                {activeFolder === "inbox" && (
                  <Section variant="transparent" paddingInline={4} paddingBlock={0} width="100%">
                    <TabList
                      value={activeCategory}
                      onChange={(val) => setActiveCategory(val as EmailCategory)}
                      isFullBleed
                      hasDivider
                      size="md"
                    >
                      <Tab
                        value="primary"
                        label="Primary"
                        icon={<Inbox size={16} />}
                        selectedIcon={<Inbox size={16} />}
                        endContent={
                          unreadCounts.primary > 0 ? (
                            <Badge label={String(unreadCounts.primary)} variant="neutral" />
                          ) : undefined
                        }
                      />
                      <Tab
                        value="promotions"
                        label="Promotions"
                        icon={<Tag size={16} />}
                        selectedIcon={<Tag size={16} />}
                        endContent={
                          unreadCounts.promotions > 0 ? (
                            <Badge label={String(unreadCounts.promotions)} variant="neutral" />
                          ) : undefined
                        }
                      />
                      <Tab
                        value="social"
                        label="Social"
                        icon={<Users size={16} />}
                        selectedIcon={<Users size={16} />}
                        endContent={
                          unreadCounts.social > 0 ? (
                            <Badge label={String(unreadCounts.social)} variant="neutral" />
                          ) : undefined
                        }
                      />
                      <Tab
                        value="updates"
                        label="Updates"
                        icon={<Info size={16} />}
                        selectedIcon={<Info size={16} />}
                        endContent={
                          unreadCounts.updates > 0 ? (
                            <Badge label={String(unreadCounts.updates)} variant="neutral" />
                          ) : undefined
                        }
                      />
                    </TabList>
                  </Section>
                )}
              </LayoutHeader>
            }
            content={
              <LayoutContent padding={0} isScrollable label="Message list">
                {filteredEmails.length > 0 ? (
                  <Table
                    data={paginatedEmails}
                    columns={columns}
                    idKey="id"
                    plugins={{ hoverReveal: rowHoverPlugin }}
                    density="compact"
                    verticalAlign="top"
                    hasHover
                    className="mail-table-headerless"
                  />
                ) : (
                  <Center minHeight={400} width="100%">
                    <EmptyState
                      icon={<Inbox size={48} />}
                      title={searchQuery ? "No matching messages found" : `No messages in ${activeFolder}`}
                      description={
                        searchQuery
                          ? `No emails matched your search "${searchQuery}".`
                          : activeFolder === "inbox"
                          ? "Your inbox is clean and up to date."
                          : `There are no emails in ${activeFolder}.`
                      }
                      actions={
                        <Button
                          label="Compose Email"
                          variant="primary"
                          size="md"
                          icon={<SquarePen size={16} />}
                          onClick={handleOpenCompose}
                        />
                      }
                    />
                  </Center>
                )}
              </LayoutContent>
            }
          />
        )}

      {/* ── MODAL: CREATE CUSTOM FOLDER ─────────────────────────────────────── */}
      <Dialog
        isOpen={isFolderDialogOpen}
        onOpenChange={setIsFolderDialogOpen}
        purpose="form"
        width={420}
      >
        <Layout
          header={
            <DialogHeader
              title="Create New Folder"
              subtitle="Organize your messages with a dedicated mailbox folder"
              onOpenChange={setIsFolderDialogOpen}
            />
          }
          content={
            <LayoutContent>
              <VStack gap={3}>
                <TextInput
                  label="Folder Name"
                  placeholder="e.g. Invoices, Projects, Personal"
                  value={newFolderName}
                  onChange={(val) => setNewFolderName(val)}
                />
              </VStack>
            </LayoutContent>
          }
          footer={
            <LayoutFooter>
              <HStack hAlign="end" gap={2}>
                <Button
                  label="Cancel"
                  variant="secondary"
                  onClick={() => setIsFolderDialogOpen(false)}
                />
                <Button
                  label="Create Folder"
                  variant="primary"
                  onClick={handleCreateFolder}
                  isDisabled={!newFolderName.trim()}
                />
              </HStack>
            </LayoutFooter>
          }
        />
      </Dialog>

      {/* ── STEP 4: GMAIL-STYLE DOCKED BOTTOM-RIGHT COMPOSER ────────────────── */}
      {isComposeOpen && (
        composerMode === "minimized" ? (
          <ClickableCard
            variant="default"
            padding={2}
            elevation="high"
            width={288}
            label={composeSubject.trim() || "Expand New Message"}
            className="fixed bottom-0 right-6 z-50"
            onClick={() => setComposerMode("docked")}
          >
            <HStack hAlign="between" vAlign="center" width="100%">
              <StackItem size="fill">
                <HStack gap={2} vAlign="center" width="100%">
                  <SquarePen size={15} />
                  <Text type="body" size="sm" weight="semibold" maxLines={1} hasTruncateTooltip={false}>
                    {composeSubject.trim() || "New Message"}
                  </Text>
                </HStack>
              </StackItem>
              <StackItem size="static">
                <HStack gap={0.5} vAlign="center">
                  <IconButton
                    label="Expand"
                    tooltip="Expand"
                    variant="ghost"
                    size="sm"
                    icon={<Maximize2 size={14} />}
                    onClick={() => setComposerMode("docked")}
                  />
                  <IconButton
                    label="Close"
                    tooltip="Save and close"
                    variant="ghost"
                    size="sm"
                    icon={<X size={14} />}
                    onClick={closeCompose}
                  />
                </HStack>
              </StackItem>
            </HStack>
          </ClickableCard>
        ) : (
          <Card
            variant="default"
            padding={3}
            elevation="high"
            width={composerMode === "maximized" ? undefined : 580}
            height={composerMode === "maximized" ? undefined : 560}
            maxWidth="95vw"
            className={
              composerMode === "maximized"
                ? "fixed inset-4 sm:inset-10 z-50"
                : "fixed bottom-0 right-6 z-50 max-h-dvh"
            }
          >
            <VStack gap={2} width="100%" height="100%" isScrollable>
              {/* Header with Title and Window Controls */}
              <HStack hAlign="between" vAlign="center" width="100%" paddingBlockEnd={1}>
                <HStack gap={2} vAlign="center">
                  <SquarePen size={16} />
                  <Text type="body" weight="semibold">
                    {composeSubject.trim() || "New Message"}
                  </Text>
                </HStack>
                <HStack gap={0.5} vAlign="center">
                  <IconButton
                    label="Minimize"
                    tooltip="Minimize"
                    variant="ghost"
                    size="sm"
                    icon={<Minus size={15} />}
                    onClick={() => setComposerMode("minimized")}
                  />
                  <IconButton
                    label={composerMode === "maximized" ? "Restore" : "Maximize"}
                    tooltip={composerMode === "maximized" ? "Exit full screen" : "Full screen"}
                    variant="ghost"
                    size="sm"
                    icon={composerMode === "maximized" ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                    onClick={() => setComposerMode(composerMode === "maximized" ? "docked" : "maximized")}
                  />
                  <IconButton
                    label="Close"
                    tooltip="Save & close"
                    variant="ghost"
                    size="sm"
                    icon={<X size={15} />}
                    onClick={closeCompose}
                  />
                </HStack>
              </HStack>

              <Divider />

              {/* Sender Identity Switcher */}
              <HStack gap={2} vAlign="center" width="100%">
                <Text type="supporting" size="sm" color="secondary">
                  From:
                </Text>
                <DropdownMenu
                  alignment="start"
                  renderTrigger={(props) => (
                    <Button
                      label={`${activeIdentity.name} <${activeIdentity.email}>`}
                      variant="ghost"
                      size="sm"
                      {...props}
                    />
                  )}
                  items={identities.map((ident) => ({
                    label: `${ident.name} <${ident.email}>`,
                    onClick: () => setActiveIdentity(ident),
                  }))}
                />
              </HStack>

              {/* Recipient Field with Contact Autocomplete */}
              <VStack gap={1} width="100%">
                <HStack gap={2} vAlign="center" width="100%">
                  <TextInput
                    label="Recipients (To)"
                    isLabelHidden
                    placeholder="To: recipient@example.com..."
                    value={composeTo}
                    onChange={handleRecipientChange}
                    width="100%"
                  />
                  <Button
                    label={showCcBcc ? "Hide Cc/Bcc" : "Cc / Bcc"}
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowCcBcc(!showCcBcc)}
                  />
                </HStack>

                {/* Contact Suggestions Dropdown */}
                {contactSuggestions.length > 0 && (
                  <Card padding={1}>
                    <VStack gap={1}>
                      {contactSuggestions.map((c) => (
                        <Button
                          key={c.id}
                          label={`${c.name} (${c.email})`}
                          variant="ghost"
                          size="sm"
                          width="100%"
                          onClick={() => handleSelectContact(c.email)}
                        />
                      ))}
                    </VStack>
                  </Card>
                )}
              </VStack>

              {/* Optional Cc / Bcc Fields */}
              {showCcBcc && (
                <HStack gap={2} width="100%">
                  <TextInput
                    label="Cc"
                    isLabelHidden
                    placeholder="Cc: ..."
                    value={composeCc}
                    onChange={(val) => setComposeCc(val)}
                    width="50%"
                  />
                  <TextInput
                    label="Bcc"
                    isLabelHidden
                    placeholder="Bcc: ..."
                    value={composeBcc}
                    onChange={(val) => setComposeBcc(val)}
                    width="50%"
                  />
                </HStack>
              )}

              {/* Subject Field */}
              <TextInput
                label="Subject"
                isLabelHidden
                placeholder="Subject"
                value={composeSubject}
                onChange={(val) => setComposeSubject(val)}
                width="100%"
              />

              {/* Formatting & Canned Responses Bar */}
              <Card padding={1} variant="muted">
                <HStack hAlign="between" vAlign="center" width="100%">
                  <HStack gap={1} vAlign="center">
                    <DropdownMenu
                      alignment="start"
                      renderTrigger={(props) => (
                        <Button
                          label="Insert Template"
                          icon={<Sparkles size={15} />}
                          variant="ghost"
                          size="sm"
                          {...props}
                        />
                      )}
                      items={cannedResponses.map((cr) => ({
                        label: cr.title,
                        onClick: () => {
                          setComposeBody((prev) => `${prev}\n\n${cr.body}`)
                          if (cr.subject && !composeSubject) {
                            setComposeSubject(cr.subject)
                          }
                        },
                      }))}
                    />
                  </HStack>

                  <HStack gap={1} vAlign="center">
                    <IconButton
                      label="Attach file"
                      tooltip="Attach file"
                      icon={<Paperclip size={16} />}
                      variant="ghost"
                      size="sm"
                      onClick={() => attachFileInputRef.current?.click()}
                    />
                  </HStack>
                </HStack>
              </Card>

              {/* Compose Body */}
              <TextArea
                label="Message body"
                isLabelHidden
                placeholder="Compose your email here (Ctrl+Enter to send)..."
                value={composeBody}
                onChange={(val) => setComposeBody(val)}
                rows={composerMode === "maximized" ? 18 : 8}
                width="100%"
              />

              {/* Attachments Preview Chips with Astryx Token */}
              {composeAttachments.length > 0 && (
                <HStack gap={2} wrap="wrap" width="100%">
                  {composeAttachments.map((att) => (
                    <Token
                      key={att.id}
                      label={`${att.name} (${att.size})`}
                      size="sm"
                      color={getAttachmentTokenColor(att.name, att.type)}
                      onRemove={() =>
                        setComposeAttachments((prev) =>
                          prev.filter((a) => a.id !== att.id)
                        )
                      }
                    />
                  ))}
                </HStack>
              )}

              {/* Action Footer */}
              <HStack hAlign="between" vAlign="center" width="100%" paddingBlockStart={1}>
                <HStack gap={2} vAlign="center">
                  <Button
                    label="Save Draft"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      saveDraft(composeTo, composeSubject, composeBody, composeAttachments)
                      closeCompose()
                    }}
                  />
                </HStack>

                <HStack gap={2} vAlign="center">
                  <Button
                    label="Discard"
                    variant="ghost"
                    size="sm"
                    onClick={closeCompose}
                  />
                  <Button
                    label="Send"
                    variant="primary"
                    size="md"
                    icon={<Send size={15} />}
                    onClick={handleSendCompose}
                    isDisabled={!composeTo.trim()}
                  />
                </HStack>
              </HStack>
            </VStack>
          </Card>
        )
      )}

      {/* ── SHOW ORIGINAL (RFC 822 MESSAGE SOURCE) DIALOG ────────────────────── */}
      <Dialog
        isOpen={!!originalSourceModal}
        onOpenChange={(open) => {
          if (!open) setOriginalSourceModal(null)
        }}
        width={700}
      >
        <Layout
          header={
            <DialogHeader
              title="Original Message (RFC 822)"
              subtitle={originalSourceModal?.subject || "Raw MIME message source"}
              onOpenChange={(open) => {
                if (!open) setOriginalSourceModal(null)
              }}
              endContent={
                originalSourceModal ? (
                  <Button
                    label="Download .eml"
                    variant="secondary"
                    size="sm"
                    icon={<Download size={14} />}
                    onClick={() =>
                      downloadTextFile(originalSourceModal.filename, originalSourceModal.source)
                    }
                  />
                ) : undefined
              }
            />
          }
          content={
            <LayoutContent isScrollable>
              {originalSourceModal && (
                <VStack gap={3} width="100%">
                  <CodeBlock
                    code={originalSourceModal.source}
                    language="plaintext"
                    width="100%"
                    maxHeight={440}
                    hasCopyButton
                    isWrapped
                  />
                </VStack>
              )}
            </LayoutContent>
          }
          footer={
            <LayoutFooter>
              <HStack hAlign="end">
                <Button
                  label="Close"
                  variant="secondary"
                  onClick={() => setOriginalSourceModal(null)}
                />
              </HStack>
            </LayoutFooter>
          }
        />
      </Dialog>

      {/* ── STEP 5: KEYBOARD SHORTCUTS GUIDE MODAL ──────────────────────────── */}
      <Dialog
        isOpen={isShortcutsDialogOpen}
        onOpenChange={setIsShortcutsDialogOpen}
        width={560}
      >
        <Layout
          header={
            <DialogHeader
              title="Keyboard Shortcuts"
              subtitle="Accelerate your workflow with Postarc & Gmail compatible keyboard keys"
              onOpenChange={setIsShortcutsDialogOpen}
            />
          }
          content={
            <LayoutContent isScrollable>
              <VStack gap={4} width="100%">
                <VStack gap={1.5} width="100%">
                  <Text type="body" size="sm" weight="semibold">
                    Navigation & Reading
                  </Text>
                  <Card variant="muted" padding={2}>
                    <VStack gap={1.5}>
                      <HStack hAlign="between" vAlign="center">
                        <Text type="body" size="sm">Next / previous email in list</Text>
                        <HStack gap={1}><Kbd keys="j" /><Kbd keys="k" /></HStack>
                      </HStack>
                      <HStack hAlign="between" vAlign="center">
                        <Text type="body" size="sm">Open selected email</Text>
                        <HStack gap={1}><Kbd keys="enter" /><Kbd keys="o" /></HStack>
                      </HStack>
                      <HStack hAlign="between" vAlign="center">
                        <Text type="body" size="sm">Back to email list</Text>
                        <HStack gap={1}><Kbd keys="u" /><Kbd keys="esc" /></HStack>
                      </HStack>
                    </VStack>
                  </Card>
                </VStack>

                <VStack gap={1.5} width="100%">
                  <Text type="body" size="sm" weight="semibold">
                    Actions
                  </Text>
                  <Card variant="muted" padding={2}>
                    <VStack gap={1.5}>
                      <HStack hAlign="between" vAlign="center">
                        <Text type="body" size="sm">Select / unselect email</Text>
                        <Kbd keys="x" />
                      </HStack>
                      <HStack hAlign="between" vAlign="center">
                        <Text type="body" size="sm">Compose new email</Text>
                        <Kbd keys="c" />
                      </HStack>
                      <HStack hAlign="between" vAlign="center">
                        <Text type="body" size="sm">Send composer or reply</Text>
                        <Kbd keys="mod+enter" />
                      </HStack>
                      <HStack hAlign="between" vAlign="center">
                        <Text type="body" size="sm">Archive email</Text>
                        <Kbd keys="e" />
                      </HStack>
                      <HStack hAlign="between" vAlign="center">
                        <Text type="body" size="sm">Delete email</Text>
                        <Kbd keys="#" />
                      </HStack>
                      <HStack hAlign="between" vAlign="center">
                        <Text type="body" size="sm">Reply / Reply all (reading pane)</Text>
                        <HStack gap={1}><Kbd keys="r" /><Kbd keys="a" /></HStack>
                      </HStack>
                      <HStack hAlign="between" vAlign="center">
                        <Text type="body" size="sm">Forward email (reading pane)</Text>
                        <Kbd keys="f" />
                      </HStack>
                      <HStack hAlign="between" vAlign="center">
                        <Text type="body" size="sm">Focus search</Text>
                        <Kbd keys="/" />
                      </HStack>
                    </VStack>
                  </Card>
                </VStack>
              </VStack>
            </LayoutContent>
          }
          footer={
            <LayoutFooter>
              <HStack hAlign="end">
                <Button
                  label="Done"
                  variant="primary"
                  onClick={() => setIsShortcutsDialogOpen(false)}
                />
              </HStack>
            </LayoutFooter>
          }
        />
      </Dialog>

      {/* ── EMPTY TRASH CONFIRMATION ALERT DIALOG ──────────────────────────── */}
      <AlertDialog
        isOpen={isEmptyTrashAlertOpen}
        onOpenChange={setIsEmptyTrashAlertOpen}
        title="Empty Trash?"
        description="All messages in Trash will be permanently deleted. This action cannot be undone."
        actionLabel="Empty Trash"
        actionVariant="destructive"
        onAction={() => {
          emptyTrash()
          setIsEmptyTrashAlertOpen(false)
        }}
      />

      {/* Hidden file inputs for .eml import and composer attachments */}
      <input
        ref={emlFileInputRef}
        type="file"
        accept=".eml,.mbox,message/rfc822"
        className="hidden"
        onChange={handleEmlFileSelect}
      />
      <input
        ref={attachFileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleAttachFiles}
      />
    </AppShell>
  )
}
