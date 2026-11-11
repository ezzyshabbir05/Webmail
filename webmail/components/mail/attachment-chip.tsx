"use client"

import React from "react"
import { Token } from "@astryxdesign/core/Token"
import {
  FileText,
  FileSpreadsheet,
  FileImage,
  FileArchive,
  FileCode,
  Paperclip,
  Download,
} from "lucide-react"
import type { EmailAttachment } from "@/types/webmail"

export function triggerAttachmentDownload(att: EmailAttachment) {
  const downloadUrl =
    att.downloadUrl ||
    `/api/blob/${encodeURIComponent(att.id)}/${encodeURIComponent(att.name)}`

  const link = document.createElement("a")
  link.href = downloadUrl
  link.download = att.name
  link.target = "_blank"
  link.rel = "noopener noreferrer"
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

function getAttachmentIcon(name: string, type?: EmailAttachment["type"]) {
  const ext = name.split(".").pop()?.toLowerCase() || ""
  if (type === "pdf" || ext === "pdf") return <FileText size={13} />
  if (type === "spreadsheet" || ["xlsx", "xls", "csv"].includes(ext)) {
    return <FileSpreadsheet size={13} />
  }
  if (type === "image" || ["png", "jpg", "jpeg", "webp", "gif", "svg"].includes(ext)) {
    return <FileImage size={13} />
  }
  if (type === "archive" || ["zip", "tar", "gz", "7z", "rar"].includes(ext)) {
    return <FileArchive size={13} />
  }
  if (["js", "ts", "json", "html", "css", "py", "rs"].includes(ext)) {
    return <FileCode size={13} />
  }
  return <Paperclip size={13} />
}

function getAttachmentTokenColor(
  name: string,
  type?: EmailAttachment["type"]
): "red" | "green" | "blue" | "purple" | "yellow" | "gray" {
  const ext = name.split(".").pop()?.toLowerCase() || ""
  if (type === "pdf" || ext === "pdf") return "red"
  if (type === "spreadsheet" || ["xlsx", "xls", "csv"].includes(ext)) return "green"
  if (type === "image" || ["png", "jpg", "jpeg", "webp", "gif"].includes(ext)) return "blue"
  if (type === "archive" || ["zip", "tar", "gz", "7z", "rar"].includes(ext)) return "yellow"
  return "gray"
}

interface AttachmentChipProps {
  attachment: EmailAttachment
  size?: "sm" | "md"
  onRemove?: () => void
  isDownloadable?: boolean
}

export function AttachmentChip({
  attachment,
  size = "sm",
  onRemove,
  isDownloadable = true,
}: AttachmentChipProps) {
  return (
    <Token
      label={`${attachment.name} (${attachment.size})`}
      size={size}
      color={getAttachmentTokenColor(attachment.name, attachment.type)}
      icon={getAttachmentIcon(attachment.name, attachment.type)}
      onRemove={onRemove}
      onClick={
        isDownloadable
          ? (e) => {
              e.stopPropagation()
              triggerAttachmentDownload(attachment)
            }
          : undefined
      }
    />
  )
}
