"use client"

import React from "react"
import { HStack } from "@astryxdesign/core/Layout"
import { Text } from "@astryxdesign/core/Text"
import { IconButton } from "@astryxdesign/core/IconButton"
import {
  FileText,
  FileSpreadsheet,
  FileImage,
  FileArchive,
  File,
  Download,
  X,
} from "lucide-react"
import type { EmailAttachment } from "@/types/webmail"

interface AttachmentChipProps {
  attachment: EmailAttachment
  onRemove?: () => void
  readOnly?: boolean
}

export function triggerAttachmentDownload(att: EmailAttachment) {
  const downloadUrl = att.downloadUrl || `/api/blob/${encodeURIComponent(att.id)}/${encodeURIComponent(att.name)}`
  const link = document.createElement("a")
  link.href = downloadUrl
  link.download = att.name
  link.target = "_blank"
  link.rel = "noopener noreferrer"
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

export function AttachmentChip({
  attachment,
  onRemove,
  readOnly = false,
}: AttachmentChipProps) {
  const getFileIcon = (type: EmailAttachment["type"]) => {
    switch (type) {
      case "pdf":
      case "document":
        return <FileText size={14} className="text-primary flex-shrink-0" />
      case "spreadsheet":
        return <FileSpreadsheet size={14} className="text-success flex-shrink-0" />
      case "image":
        return <FileImage size={14} className="text-accent flex-shrink-0" />
      case "archive":
        return <FileArchive size={14} className="text-warning flex-shrink-0" />
      default:
        return <File size={14} className="text-secondary flex-shrink-0" />
    }
  }

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation()
    triggerAttachmentDownload(attachment)
  }

  return (
    <HStack
      gap={1}
      vAlign="center"
      paddingInline={2}
      paddingBlock={1}
      className="rounded border border-border/60 bg-neutral-subtle/50 hover:bg-neutral-subtle transition-colors group cursor-pointer max-w-xs"
      onClick={handleDownload}
    >
      {getFileIcon(attachment.type)}

      <Text type="body" size="sm" maxLines={1} className="max-w-[130px] font-medium">
        {attachment.name}
      </Text>

      {attachment.size && (
        <Text type="supporting" size="xsm" color="secondary" textWrap="nowrap">
          ({attachment.size})
        </Text>
      )}

      {readOnly ? (
        <IconButton
          label={`Download ${attachment.name}`}
          tooltip="Download"
          variant="ghost"
          size="sm"
          icon={<Download size={13} />}
          onClick={handleDownload}
        />
      ) : onRemove ? (
        <IconButton
          label={`Remove ${attachment.name}`}
          tooltip="Remove"
          variant="ghost"
          size="sm"
          icon={<X size={13} />}
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
        />
      ) : null}
    </HStack>
  )
}
