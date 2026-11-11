"use client"

import React from "react"
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog"
import { Layout, LayoutContent, VStack, HStack } from "@astryxdesign/core/Layout"
import { Text } from "@astryxdesign/core/Text"
import { Card } from "@astryxdesign/core/Card"
import { Kbd } from "@astryxdesign/core/Kbd"

interface ShortcutsDialogProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
}

export function ShortcutsDialog({ isOpen, onOpenChange }: ShortcutsDialogProps) {
  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      width={560}
      aria-label="Keyboard Shortcuts"
    >
      <Layout
        header={
          <DialogHeader
            title="Keyboard Shortcuts"
            subtitle="Accelerate your workflow with Postarc & Gmail compatible keyboard keys"
            onOpenChange={onOpenChange}
          />
        }
        content={
          <LayoutContent isScrollable>
            <VStack gap={4} width="100%">
              {/* Navigation & Reading */}
              <VStack gap={1.5} width="100%">
                <Text type="body" size="sm" weight="semibold">
                  Navigation & Reading
                </Text>
                <Card variant="muted" padding={2}>
                  <VStack gap={1.5}>
                    <HStack hAlign="between" vAlign="center">
                      <Text type="body" size="sm">
                        Next / previous email in list
                      </Text>
                      <HStack gap={1}>
                        <Kbd keys="j" />
                        <Kbd keys="k" />
                      </HStack>
                    </HStack>
                    <HStack hAlign="between" vAlign="center">
                      <Text type="body" size="sm">
                        Open selected email
                      </Text>
                      <HStack gap={1}>
                        <Kbd keys="enter" />
                        <Kbd keys="o" />
                      </HStack>
                    </HStack>
                    <HStack hAlign="between" vAlign="center">
                      <Text type="body" size="sm">
                        Back to email list
                      </Text>
                      <HStack gap={1}>
                        <Kbd keys="u" />
                        <Kbd keys="esc" />
                      </HStack>
                    </HStack>
                  </VStack>
                </Card>
              </VStack>

              {/* Selection & Actions */}
              <VStack gap={1.5} width="100%">
                <Text type="body" size="sm" weight="semibold">
                  Selection & Actions
                </Text>
                <Card variant="muted" padding={2}>
                  <VStack gap={1.5}>
                    <HStack hAlign="between" vAlign="center">
                      <Text type="body" size="sm">
                        Select / deselect email thread
                      </Text>
                      <Kbd keys="x" />
                    </HStack>
                    <HStack hAlign="between" vAlign="center">
                      <Text type="body" size="sm">
                        Archive email
                      </Text>
                      <Kbd keys="e" />
                    </HStack>
                    <HStack hAlign="between" vAlign="center">
                      <Text type="body" size="sm">
                        Delete / Move to Trash
                      </Text>
                      <Kbd keys="#" />
                    </HStack>
                    <HStack hAlign="between" vAlign="center">
                      <Text type="body" size="sm">
                        Star / unstar thread
                      </Text>
                      <Kbd keys="s" />
                    </HStack>
                    <HStack hAlign="between" vAlign="center">
                      <Text type="body" size="sm">
                        Mark as unread
                      </Text>
                      <Kbd keys="_" />
                    </HStack>
                  </VStack>
                </Card>
              </VStack>

              {/* Composition & Sending */}
              <VStack gap={1.5} width="100%">
                <Text type="body" size="sm" weight="semibold">
                  Composition & Sending
                </Text>
                <Card variant="muted" padding={2}>
                  <VStack gap={1.5}>
                    <HStack hAlign="between" vAlign="center">
                      <Text type="body" size="sm">
                        Compose new email
                      </Text>
                      <Kbd keys="c" />
                    </HStack>
                    <HStack hAlign="between" vAlign="center">
                      <Text type="body" size="sm">
                        Send message (in composer or reply)
                      </Text>
                      <Kbd keys="mod+enter" />
                    </HStack>
                    <HStack hAlign="between" vAlign="center">
                      <Text type="body" size="sm">
                        Reply to active thread
                      </Text>
                      <Kbd keys="r" />
                    </HStack>
                    <HStack hAlign="between" vAlign="center">
                      <Text type="body" size="sm">
                        Reply all
                      </Text>
                      <Kbd keys="a" />
                    </HStack>
                    <HStack hAlign="between" vAlign="center">
                      <Text type="body" size="sm">
                        Forward thread
                      </Text>
                      <Kbd keys="f" />
                    </HStack>
                  </VStack>
                </Card>
              </VStack>
            </VStack>
          </LayoutContent>
        }
      />
    </Dialog>
  )
}
