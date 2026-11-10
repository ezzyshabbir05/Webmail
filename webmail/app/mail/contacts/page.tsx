"use client"

export const dynamic = "force-dynamic"

import React, { useState } from "react"
import { useRouter } from "next/navigation"
import { AppShell } from "@astryxdesign/core/AppShell"
import { TopNav, TopNavHeading } from "@astryxdesign/core/TopNav"
import { SideNav, SideNavItem, SideNavSection } from "@astryxdesign/core/SideNav"
import { Table, type TableColumn, pixel, proportional } from "@astryxdesign/core/Table"
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
import { Text, Heading } from "@astryxdesign/core/Text"
import { Button } from "@astryxdesign/core/Button"
import { IconButton } from "@astryxdesign/core/IconButton"
import { TextInput } from "@astryxdesign/core/TextInput"
import { Token } from "@astryxdesign/core/Token"
import { Avatar } from "@astryxdesign/core/Avatar"
import { DropdownMenu } from "@astryxdesign/core/DropdownMenu"
import { ProgressBar } from "@astryxdesign/core/ProgressBar"
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog"
import { AlertDialog } from "@astryxdesign/core/AlertDialog"
import { Card } from "@astryxdesign/core/Card"
import { Kbd } from "@astryxdesign/core/Kbd"
import { ThemeToggle } from "@/components/theme-toggle"
import {
  Users,
  Search,
  Plus,
  Mail,
  Trash2,
  Inbox,
  Calendar as CalendarIcon,
  Filter,
  Keyboard,
  Settings,
  LogOut,
} from "lucide-react"
import { useMail } from "@/context/mail-context"
import { postarcClient } from "@/lib/jmap/client"
import type { MailContact } from "@/types/webmail"

export default function ContactsPage() {
  const router = useRouter()
  const { contacts, openCompose, activeIdentity, quotaInfo } = useMail()
  const storageUsedGB = (quotaInfo.usedBytes / (1024 * 1024 * 1024)).toFixed(1)
  const storageTotalGB = (quotaInfo.totalBytes / (1024 * 1024 * 1024)).toFixed(0)

  const [contactList, setContactList] = useState<MailContact[]>(contacts)
  const [search, setSearch] = useState("")
  const [selectedGroup, setSelectedGroup] = useState<string>("All")
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false)
  const [contactToDelete, setContactToDelete] = useState<MailContact | null>(null)

  // Form states
  const [newName, setNewName] = useState("")
  const [newEmail, setNewEmail] = useState("")
  const [newPhone, setNewPhone] = useState("")
  const [newCompany, setNewCompany] = useState("")
  const [newGroup] = useState<MailContact["group"]>("Work")

  const filteredContacts = contactList.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.email.toLowerCase().includes(search.toLowerCase()) ||
      (c.company && c.company.toLowerCase().includes(search.toLowerCase()))
    const matchesGroup = selectedGroup === "All" || c.group === selectedGroup
    return matchesSearch && matchesGroup
  })

  const handleAddContact = () => {
    if (!newName.trim() || !newEmail.trim()) return
    const newId = `c_${Date.now()}`
    const newEntry: MailContact = {
      id: newId,
      name: newName.trim(),
      email: newEmail.trim(),
      phone: newPhone.trim() || undefined,
      company: newCompany.trim() || undefined,
      group: newGroup,
    }
    setContactList((prev) => [newEntry, ...prev])
    postarcClient
      .setContactCards({
        create: {
          [newId]: {
            name: { full: newEntry.name },
            emails: { primary: { address: newEntry.email } },
            phones: newEntry.phone ? { primary: { number: newEntry.phone } } : undefined,
            organizations: newEntry.company ? { primary: { name: newEntry.company } } : undefined,
            categories: { [newEntry.group]: true },
          },
        },
      })
      .catch(() => {})
    setNewName("")
    setNewEmail("")
    setNewPhone("")
    setNewCompany("")
    setIsAddOpen(false)
  }

  const handleConfirmDelete = () => {
    if (!contactToDelete) return
    const id = contactToDelete.id
    setContactList((prev) => prev.filter((c) => c.id !== id))
    postarcClient.setContactCards({ destroy: [id] }).catch(() => {})
    setContactToDelete(null)
  }

  const columns: TableColumn<MailContact>[] = [
    {
      key: "contact",
      header: "Name",
      width: pixel(260),
      renderCell: (item) => (
        <HStack gap={3} vAlign="center">
          <Avatar name={item.name} size={32} />
          <VStack gap={0}>
            <Text type="body" weight="semibold">
              {item.name}
            </Text>
            {item.company && (
              <Text type="supporting" color="secondary">
                {item.company}
              </Text>
            )}
          </VStack>
        </HStack>
      ),
    },
    {
      key: "email",
      header: "Email Address",
      width: proportional(1),
      renderCell: (item) => (
        <Text type="body" color="secondary">
          {item.email}
        </Text>
      ),
    },
    {
      key: "phone",
      header: "Phone",
      width: pixel(180),
      renderCell: (item) => (
        <Text type="body" color="secondary">
          {item.phone || "—"}
        </Text>
      ),
    },
    {
      key: "group",
      header: "Group",
      width: pixel(120),
      renderCell: (item) => (
        <Token label={item.group} size="sm" color="gray" />
      ),
    },
    {
      key: "actions",
      header: "",
      width: pixel(100),
      renderCell: (item) => (
        <HStack gap={1} hAlign="end">
          <IconButton
            label={`Email ${item.name}`}
            tooltip={`Email ${item.name}`}
            icon={<Mail size={15} />}
            variant="ghost"
            size="sm"
            onClick={() => {
              openCompose({ to: item.email })
              router.push("/mail")
            }}
          />
          <IconButton
            label={`Delete ${item.name}`}
            tooltip={`Delete ${item.name}`}
            icon={<Trash2 size={15} />}
            variant="ghost"
            size="sm"
            onClick={() => setContactToDelete(item)}
          />
        </HStack>
      ),
    },
  ]

  return (
    <AppShell
      variant="elevated"
      contentPadding={0}
      height="fill"
      topNav={
        <TopNav
          label="Contacts navigation"
          heading={
            <TopNavHeading
              heading="Postarc Webmail"
              headingHref="/mail"
            />
          }
          centerContent={
            <TextInput
              label="Search contacts"
              isLabelHidden
              type="search"
              placeholder="Search contacts by name, email, company..."
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
          aria-label="Contact groups"
          resizable={{ defaultWidth: 230, minWidth: 180, maxWidth: 380 }}
          topContent={
            <VStack width="100%" padding={1}>
              <Button
                label="New Contact"
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
          <SideNavSection title="Groups">
            {["All", "Work", "Clients", "Favorites", "Personal"].map((grp) => (
              <SideNavItem
                key={grp}
                label={grp}
                icon={<Users size={16} />}
                isSelected={selectedGroup === grp}
                onClick={() => setSelectedGroup(grp)}
              />
            ))}
          </SideNavSection>
        </SideNav>
      }
    >
      <Layout
        height="fill"
        defaultHasDividers
        header={
          <LayoutHeader padding={0} label="Contacts controls">
            <Section variant="transparent" paddingInline={4} paddingBlock={0} width="100%">
              <Toolbar
                label="Contacts actions"
                size="sm"
                startContent={
                  <Heading level={2}>
                    {selectedGroup} Contacts ({filteredContacts.length})
                  </Heading>
                }
                endContent={
                  <Button
                    label="New Contact"
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
          <LayoutContent padding={0} isScrollable label="Contacts table">
            <Table
              columns={columns}
              data={filteredEmailsAdapter(filteredContacts)}
              idKey="id"
              density="balanced"
              hasHover
            />
          </LayoutContent>
        }
      />

      {/* Canonical Add Contact Dialog */}
      <Dialog
        isOpen={isAddOpen}
        onOpenChange={setIsAddOpen}
        purpose="form"
        width={480}
      >
        <Layout
          header={
            <DialogHeader
              title="Create New Contact"
              subtitle="Add a person or team member to your address book"
              onOpenChange={setIsAddOpen}
            />
          }
          content={
            <LayoutContent>
              <VStack gap={3}>
                <TextInput
                  label="Full Name"
                  placeholder="e.g. John Doe"
                  value={newName}
                  onChange={(val) => setNewName(val)}
                />
                <TextInput
                  label="Email Address"
                  placeholder="e.g. john.doe@company.com"
                  value={newEmail}
                  onChange={(val) => setNewEmail(val)}
                />
                <TextInput
                  label="Phone Number"
                  placeholder="+1 (555) 000-0000"
                  value={newPhone}
                  onChange={(val) => setNewPhone(val)}
                />
                <TextInput
                  label="Company"
                  placeholder="Organization or Studio"
                  value={newCompany}
                  onChange={(val) => setNewCompany(val)}
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
                  onClick={() => setIsAddOpen(false)}
                />
                <Button
                  label="Save Contact"
                  variant="primary"
                  isDisabled={!newName.trim() || !newEmail.trim()}
                  onClick={handleAddContact}
                />
              </HStack>
            </LayoutFooter>
          }
        />
      </Dialog>

      {/* Delete Contact Confirmation AlertDialog */}
      <AlertDialog
        isOpen={!!contactToDelete}
        onOpenChange={(open) => {
          if (!open) setContactToDelete(null)
        }}
        title="Delete Contact?"
        description={`Are you sure you want to delete ${contactToDelete?.name || "this contact"}? This action cannot be undone.`}
        actionLabel="Delete Contact"
        actionVariant="destructive"
        onAction={handleConfirmDelete}
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
              title="Contacts Shortcuts"
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
                      <Text type="body" size="sm">Create new contact</Text>
                      <Kbd keys="c" />
                    </HStack>
                    <HStack hAlign="between" vAlign="center">
                      <Text type="body" size="sm">Search contacts</Text>
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

function filteredEmailsAdapter(items: MailContact[]): (MailContact & Record<string, unknown>)[] {
  return items as (MailContact & Record<string, unknown>)[]
}
