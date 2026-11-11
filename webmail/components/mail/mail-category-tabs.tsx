"use client"

import React from "react"
import { TabList, Tab } from "@astryxdesign/core/TabList"
import { Badge } from "@astryxdesign/core/Badge"
import { Section } from "@astryxdesign/core/Section"
import { Inbox, Tag, Users, Info } from "lucide-react"
import type { EmailCategory } from "@/types/webmail"

interface MailCategoryTabsProps {
  activeCategory: EmailCategory
  onCategoryChange: (cat: EmailCategory) => void
  unreadCounts: {
    primary: number
    promotions: number
    social: number
    updates: number
  }
}

export function MailCategoryTabs({
  activeCategory,
  onCategoryChange,
  unreadCounts,
}: MailCategoryTabsProps) {
  return (
    <Section variant="transparent" paddingInline={4} paddingBlock={0} width="100%">
      <TabList
        value={activeCategory}
        onChange={(val) => onCategoryChange(val as EmailCategory)}
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
  )
}
