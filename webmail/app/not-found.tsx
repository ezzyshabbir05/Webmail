export const dynamic = "force-dynamic"

import { Center } from "@astryxdesign/core/Center"
import { VStack } from "@astryxdesign/core/Layout"
import { Heading, Text } from "@astryxdesign/core/Text"
import { Button } from "@astryxdesign/core/Button"
import { Inbox } from "lucide-react"

export default function NotFound() {
  return (
    <Center minHeight="100dvh" width="100%" className="bg-body text-primary">
      <VStack gap={2} vAlign="center" hAlign="center">
        <Inbox size={48} />
        <Heading level={2}>Page Not Found</Heading>
        <Text type="body" color="secondary" size="sm">
          The requested mailbox route does not exist.
        </Text>
        <Button label="Back to Mailbox" variant="primary" size="md" href="/mail" />
      </VStack>
    </Center>
  )
}
