"use client"

export const dynamic = "force-dynamic"

import React, { useState } from "react"
import { AppShell } from "@astryxdesign/core/AppShell"
import { TopNav, TopNavHeading } from "@astryxdesign/core/TopNav"
import { SideNav, SideNavItem, SideNavSection } from "@astryxdesign/core/SideNav"
import {
  VStack,
  HStack,
  Layout,
  LayoutHeader,
  LayoutContent,
  LayoutFooter,
} from "@astryxdesign/core/Layout"
import { Toolbar } from "@astryxdesign/core/Toolbar"
import { Section } from "@astryxdesign/core/Section"
import { List, ListItem } from "@astryxdesign/core/List"
import { Text, Heading } from "@astryxdesign/core/Text"
import { Button } from "@astryxdesign/core/Button"
import { IconButton } from "@astryxdesign/core/IconButton"
import { TextInput } from "@astryxdesign/core/TextInput"
import { Token } from "@astryxdesign/core/Token"
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput"
import { Avatar } from "@astryxdesign/core/Avatar"
import { DropdownMenu } from "@astryxdesign/core/DropdownMenu"
import { ProgressBar } from "@astryxdesign/core/ProgressBar"
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog"
import { AlertDialog } from "@astryxdesign/core/AlertDialog"
import { Card } from "@astryxdesign/core/Card"
import { Kbd } from "@astryxdesign/core/Kbd"
import { ThemeToggle } from "@/components/theme-toggle"
import { useMail } from "@/context/mail-context"
import {
  Filter,
  Plus,
  Trash2,
  Inbox,
  Mail,
  Calendar as CalendarIcon,
  Users,
  Keyboard,
  ShieldCheck,
  Search,
  Settings,
  LogOut,
} from "lucide-react"
import type { SieveFilterRule } from "@/types/webmail"

const INITIAL_RULES: SieveFilterRule[] = []

const INITIAL_SPAM_RULES: SieveFilterRule[] = []

export default function FiltersPage() {
  const { activeIdentity, quotaInfo } = useMail()
  const storageUsedGB = (quotaInfo.usedBytes / (1024 * 1024 * 1024)).toFixed(1)
  const storageTotalGB = (quotaInfo.totalBytes / (1024 * 1024 * 1024)).toFixed(0)

  const [activeFilterSet, setActiveFilterSet] = useState<"active" | "spam">("active")
  const [rules, setRules] = useState<SieveFilterRule[]>(INITIAL_RULES)
  const [spamRules, setSpamRules] = useState<SieveFilterRule[]>(INITIAL_SPAM_RULES)
  const [search, setSearch] = useState("")
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false)
  const [ruleToDelete, setRuleToDelete] = useState<SieveFilterRule | null>(null)

  // Form states
  const [ruleName, setRuleName] = useState("")
  const [field, setField] = useState<SieveFilterRule["conditionField"]>("from")
  const [operator, setOperator] = useState<SieveFilterRule["conditionOperator"]>("contains")
  const [value, setValue] = useState("")
  const [action, setAction] = useState<SieveFilterRule["actionType"]>("move_to_folder")
  const [target, setTarget] = useState("Archive")

  const currentRules = (activeFilterSet === "active" ? rules : spamRules).filter((r) => {
    if (!search.trim()) return true
    return (
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.conditionValue.toLowerCase().includes(search.toLowerCase()) ||
      (r.actionTarget && r.actionTarget.toLowerCase().includes(search.toLowerCase()))
    )
  })

  const handleToggleRule = (id: string) => {
    if (activeFilterSet === "active") {
      setRules((prev) =>
        prev.map((r) => (r.id === id ? { ...r, isEnabled: !r.isEnabled } : r))
      )
    } else {
      setSpamRules((prev) =>
        prev.map((r) => (r.id === id ? { ...r, isEnabled: !r.isEnabled } : r))
      )
    }
  }

  const handleConfirmDeleteRule = () => {
    if (!ruleToDelete) return
    if (activeFilterSet === "active") {
      setRules((prev) => prev.filter((r) => r.id !== ruleToDelete.id))
    } else {
      setSpamRules((prev) => prev.filter((r) => r.id !== ruleToDelete.id))
    }
    setRuleToDelete(null)
  }

  const handleAddRule = () => {
    if (!ruleName.trim() || !value.trim()) return
    const newR: SieveFilterRule = {
      id: `rule_${Date.now()}`,
      name: ruleName.trim(),
      isEnabled: true,
      conditionField: field,
      conditionOperator: operator,
      conditionValue: value.trim(),
      actionType: action,
      actionTarget: action === "move_to_folder" ? target : undefined,
    }
    if (activeFilterSet === "active") {
      setRules((prev) => [...prev, newR])
    } else {
      setSpamRules((prev) => [...prev, newR])
    }
    setRuleName("")
    setValue("")
    setIsAddOpen(false)
  }

  return (
    <AppShell
      variant="elevated"
      contentPadding={0}
      height="fill"
      topNav={
        <TopNav
          label="Filters navigation"
          heading={
            <TopNavHeading
              heading="Postarc Webmail"
              headingHref="/mail"
            />
          }
          centerContent={
            <TextInput
              label="Search rules"
              isLabelHidden
              type="search"
              placeholder="Search filter and spam rules..."
              value={search}
              onChange={(val) => setSearch(val)}
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
                onClick={() => setIsShortcutsOpen(true)}
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
                    label: "Mail",
                    href: "/mail",
                    icon: <Mail size={16} />,
                  },
                  {
                    label: "Calendar",
                    href: "/mail/calendar",
                    icon: <CalendarIcon size={16} />,
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
          aria-label="Filter sets"
          resizable={{ defaultWidth: 230, minWidth: 180, maxWidth: 380 }}
          topContent={
            <VStack width="100%" padding={1}>
              <Button
                label={
                  activeFilterSet === "active"
                    ? "Create Filter Rule"
                    : "Create Spam Rule"
                }
                variant="primary"
                size="md"
                icon={<Plus size={16} />}
                width="100%"
                onClick={() => setIsAddOpen(true)}
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
          <SideNavSection title="Quick Links">
            <SideNavItem
              label="Inbox"
              icon={<Inbox size={16} />}
              href="/mail"
            />
          </SideNavSection>
          <SideNavSection title="Filter Sets">
            <SideNavItem
              label="Active Rules"
              icon={<Filter size={16} />}
              isSelected={activeFilterSet === "active"}
              onClick={() => setActiveFilterSet("active")}
            />
            <SideNavItem
              label="Spam & Security Rules"
              icon={<ShieldCheck size={16} />}
              isSelected={activeFilterSet === "spam"}
              onClick={() => setActiveFilterSet("spam")}
            />
          </SideNavSection>
        </SideNav>
      }
    >
      <Layout
        height="fill"
        defaultHasDividers
        header={
          <LayoutHeader padding={0} label="Filters controls">
            <Section variant="transparent" paddingInline={4} paddingBlock={0} width="100%">
              <Toolbar
                label="Filter actions"
                size="sm"
                startContent={
                  <Heading level={2}>
                    {activeFilterSet === "active"
                      ? "Sieve Filtering Rules"
                      : "Antispam & Security Rules"}
                  </Heading>
                }
                endContent={
                  <Button
                    label={
                      activeFilterSet === "active"
                        ? "Create Filter Rule"
                        : "Create Spam Rule"
                    }
                    variant="primary"
                    size="sm"
                    icon={<Plus size={16} />}
                    onClick={() => setIsAddOpen(true)}
                  />
                }
              />
            </Section>
          </LayoutHeader>
        }
        content={
          <LayoutContent padding={0} isScrollable label="Sieve rules">
            <Section variant="transparent" paddingInline={4} paddingBlock={3} width="100%">
              <Text type="body" color="secondary">
                {activeFilterSet === "active"
                  ? "Incoming messages are evaluated sequentially by Postarc Mailserver according to these rules."
                  : "Automated spam score gates, DNSBL blacklists, and SPF/DMARC validation rules applied before mailbox delivery."}
              </Text>
            </Section>
            <Section
              variant="transparent"
              dividers={["top"]}
              paddingInline={4}
              paddingBlock={0}
              width="100%"
            >
              <List edge="bleed" hasDividers density="balanced">
                {currentRules.map((rule) => (
                  <ListItem
                    key={rule.id}
                    align="center"
                    startContent={
                      <CheckboxInput
                        label={`Enable ${rule.name}`}
                        isLabelHidden
                        value={rule.isEnabled}
                        onChange={() => handleToggleRule(rule.id)}
                      />
                    }
                    label={
                      <HStack gap={2} vAlign="center">
                        <Text type="body" weight="semibold">
                          {rule.name}
                        </Text>
                        <Token
                          label={rule.isEnabled ? "Active" : "Disabled"}
                          size="sm"
                          color={rule.isEnabled ? "green" : "gray"}
                        />
                      </HStack>
                    }
                    description={
                      <Text type="body" color="secondary">
                        IF {rule.conditionField.toUpperCase()} {rule.conditionOperator} &quot;{rule.conditionValue}&quot; THEN{" "}
                        {rule.actionType.replace(/_/g, " ").toUpperCase()}
                        {rule.actionTarget ? ` → ${rule.actionTarget}` : ""}
                      </Text>
                    }
                    endContent={
                      <IconButton
                        label="Delete filter rule"
                        tooltip="Delete filter rule"
                        icon={<Trash2 size={16} />}
                        variant="ghost"
                        size="sm"
                        onClick={() => setRuleToDelete(rule)}
                      />
                    }
                  />
                ))}
              </List>
            </Section>
          </LayoutContent>
        }
      />

      {/* Canonical Create Sieve Filter Dialog */}
      <Dialog
        isOpen={isAddOpen}
        onOpenChange={setIsAddOpen}
        purpose="form"
        width={480}
      >
        <Layout
          header={
            <DialogHeader
              title={
                activeFilterSet === "active"
                  ? "Create Sieve Filter Rule"
                  : "Create Spam & Security Rule"
              }
              subtitle="Define matching condition criteria and target disposition"
              onOpenChange={setIsAddOpen}
            />
          }
          content={
            <LayoutContent>
              <VStack gap={3}>
                <TextInput
                  label="Rule Name"
                  placeholder="e.g. Move receipts to Invoices"
                  value={ruleName}
                  onChange={(val) => setRuleName(val)}
                />
                <HStack gap={2} width="100%">
                  <TextInput
                    label="Field (from, subject, body)"
                    value={field}
                    onChange={(val) => setField(val as SieveFilterRule["conditionField"])}
                    width="50%"
                  />
                  <TextInput
                    label="Condition"
                    value={operator}
                    onChange={(val) => setOperator(val as SieveFilterRule["conditionOperator"])}
                    width="50%"
                  />
                </HStack>
                <TextInput
                  label="Condition Value"
                  placeholder="e.g. invoice, billing@, newsletter"
                  value={value}
                  onChange={(val) => setValue(val)}
                />
                <TextInput
                  label="Action Type"
                  value={action}
                  onChange={(val) => setAction(val as SieveFilterRule["actionType"])}
                />
                {action === "move_to_folder" && (
                  <TextInput
                    label="Target Folder"
                    value={target}
                    onChange={(val) => setTarget(val)}
                  />
                )}
              </VStack>
            </LayoutContent>
          }
          footer={
            <LayoutFooter>
              <HStack hAlign="end" gap={2}>
                <Button
                  label="Cancel"
                  variant="secondary"
                  onClick={() => setIsAddOpen(false)}
                />
                <Button
                  label="Save Filter Rule"
                  variant="primary"
                  isDisabled={!ruleName.trim() || !value.trim()}
                  onClick={handleAddRule}
                />
              </HStack>
            </LayoutFooter>
          }
        />
      </Dialog>

      {/* Delete Rule Confirmation AlertDialog */}
      <AlertDialog
        isOpen={!!ruleToDelete}
        onOpenChange={(open) => {
          if (!open) setRuleToDelete(null)
        }}
        title="Delete Filter Rule?"
        description={`Are you sure you want to delete "${ruleToDelete?.name || "this rule"}"? This rule will no longer run on incoming mail.`}
        actionLabel="Delete Rule"
        actionVariant="destructive"
        onAction={handleConfirmDeleteRule}
      />

      {/* Shortcuts Guide Dialog */}
      <Dialog
        isOpen={isShortcutsOpen}
        onOpenChange={setIsShortcutsOpen}
        width={500}
      >
        <Layout
          header={
            <DialogHeader
              title="Filters Shortcuts"
              subtitle="Quick keys for navigation"
              onOpenChange={setIsShortcutsOpen}
            />
          }
          content={
            <LayoutContent>
              <VStack gap={2} width="100%">
                <Card variant="muted" padding={2}>
                  <VStack gap={1.5}>
                    <HStack hAlign="between" vAlign="center">
                      <Text type="body" size="sm">Create new rule</Text>
                      <Kbd keys="c" />
                    </HStack>
                    <HStack hAlign="between" vAlign="center">
                      <Text type="body" size="sm">Search rules</Text>
                      <Kbd keys="/" />
                    </HStack>
                  </VStack>
                </Card>
              </VStack>
            </LayoutContent>
          }
          footer={
            <LayoutFooter>
              <HStack hAlign="end">
                <Button
                  label="Done"
                  variant="primary"
                  onClick={() => setIsShortcutsOpen(false)}
                />
              </HStack>
            </LayoutFooter>
          }
        />
      </Dialog>
    </AppShell>
  )
}
