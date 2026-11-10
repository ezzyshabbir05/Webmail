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
import { TextArea } from "@astryxdesign/core/TextArea"
import { Card } from "@astryxdesign/core/Card"
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput"
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog"
import { AlertDialog } from "@astryxdesign/core/AlertDialog"
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl"
import { Token } from "@astryxdesign/core/Token"
import { Avatar } from "@astryxdesign/core/Avatar"
import { DropdownMenu } from "@astryxdesign/core/DropdownMenu"
import { ProgressBar } from "@astryxdesign/core/ProgressBar"
import { Kbd } from "@astryxdesign/core/Kbd"
import { useToast } from "@astryxdesign/core/Toast"
import {
  Sliders,
  Server,
  UserCheck,
  Plane,
  Folder,
  Inbox,
  Mail,
  Calendar as CalendarIcon,
  Users,
  Filter,
  Keyboard,
  Settings,
  LogOut,
  Plus,
  Trash2,
  Check,
  Sun,
  Moon,
  Monitor,
  Search,
  ShieldCheck,
  HardDrive,
} from "lucide-react"
import { useMail } from "@/context/mail-context"
import { ThemeToggle } from "@/components/theme-toggle"
import { useThemeMode } from "@/components/theme-provider"
import type { MailIdentity, CustomMailboxFolder } from "@/types/webmail"

export default function MailboxSettingsPage() {
  const toast = useToast()
  const {
    identities,
    addIdentity,
    deleteIdentity,
    customFolders,
    createCustomFolder,
    deleteCustomFolder,
    vacationSettings,
    saveVacationSettings,
    activeIdentity,
    quotaInfo,
  } = useMail()
  const storageUsedGB = (quotaInfo.usedBytes / (1024 * 1024 * 1024)).toFixed(1)
  const storageTotalGB = (quotaInfo.totalBytes / (1024 * 1024 * 1024)).toFixed(0)

  const { preference, setMode, emailDarkMode, setEmailDarkMode } = useThemeMode()
  const [activeTab, setActiveTab] = useState<
    "general" | "appearance" | "server" | "identities" | "vacation" | "folders"
  >("general")
  const [search, setSearch] = useState("")

  // General Preferences State
  const [pageSize, setPageSize] = useState<"25" | "50" | "100">("50")
  const [conversationView, setConversationView] = useState(true)
  const [undoSendDelay, setUndoSendDelay] = useState<"5" | "10" | "20" | "30">("10")
  const [defaultReplyAction, setDefaultReplyAction] = useState<"reply" | "reply_all">("reply")
  const [blockRemoteImages, setBlockRemoteImages] = useState(true)
  const [showSnippets, setShowSnippets] = useState(true)

  // Vacation Responder State synced from context
  const [isVacationEnabled, setIsVacationEnabled] = useState(vacationSettings.isEnabled)
  const [vacationSubject, setVacationSubject] = useState(vacationSettings.subject)
  const [vacationBody, setVacationBody] = useState(vacationSettings.body)

  // Add Identity Dialog
  const [isAddIdentityOpen, setIsAddIdentityOpen] = useState(false)
  const [newIdentName, setNewIdentName] = useState("")
  const [newIdentEmail, setNewIdentEmail] = useState("")
  const [newIdentSig, setNewIdentSig] = useState("")

  // Add Folder Dialog
  const [isAddFolderOpen, setIsAddFolderOpen] = useState(false)
  const [newFolderName, setNewFolderName] = useState("")
  const [newFolderColor, setNewFolderColor] = useState("#2563eb")

  // Shortcuts dialog
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false)

  // Confirmation alerts
  const [identToDelete, setIdentToDelete] = useState<MailIdentity | null>(null)
  const [folderToDelete, setFolderToDelete] = useState<CustomMailboxFolder | null>(null)

  const handleSaveGeneralSettings = () => {
    toast({ body: "Mailbox preferences saved successfully." })
  }

  const handleAddIdentity = () => {
    if (!newIdentName.trim() || !newIdentEmail.trim()) return
    addIdentity({
      name: newIdentName.trim(),
      email: newIdentEmail.trim(),
      textSignature: newIdentSig.trim() || undefined,
      isDefault: false,
    })
    setNewIdentName("")
    setNewIdentEmail("")
    setNewIdentSig("")
    setIsAddIdentityOpen(false)
  }

  const handleConfirmDeleteIdentity = () => {
    if (!identToDelete) return
    deleteIdentity(identToDelete.id)
    setIdentToDelete(null)
  }

  const handleCreateFolder = () => {
    if (!newFolderName.trim()) return
    createCustomFolder(newFolderName.trim(), newFolderColor)
    setNewFolderName("")
    setIsAddFolderOpen(false)
  }

  const handleConfirmDeleteFolder = () => {
    if (!folderToDelete) return
    deleteCustomFolder(folderToDelete.id)
    setFolderToDelete(null)
  }

  const sectionTitle =
    activeTab === "general"
      ? "General Mailbox Preferences"
      : activeTab === "appearance"
      ? "Appearance & Themes"
      : activeTab === "server"
      ? "JMAP Server & Storage Quota"
      : activeTab === "identities"
      ? "Sender Identities & Signatures"
      : activeTab === "vacation"
      ? "Vacation Auto-Responder"
      : "Mailbox Folders & Labels"

  return (
    <AppShell
      variant="elevated"
      contentPadding={0}
      height="fill"
      topNav={
        <TopNav
          label="Settings navigation"
          heading={
            <TopNavHeading
              heading="Postarc Webmail"
              headingHref="/mail"
            />
          }
          centerContent={
            <TextInput
              label="Search settings"
              isLabelHidden
              type="search"
              placeholder="Search mailbox settings, accounts, signatures..."
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
          aria-label="Settings sections"
          resizable={{ defaultWidth: 230, minWidth: 180, maxWidth: 380 }}
          topContent={
            <VStack width="100%" padding={1}>
              <Button
                label="Back to Mailbox"
                variant="secondary"
                size="md"
                icon={<Inbox size={16} />}
                width="100%"
                href="/mail"
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
          <SideNavSection title="Mailbox Settings">
            <SideNavItem
              label="General"
              icon={<Sliders size={16} />}
              isSelected={activeTab === "general"}
              onClick={() => setActiveTab("general")}
            />
            <SideNavItem
              label="Appearance & Themes"
              icon={<Sun size={16} />}
              isSelected={activeTab === "appearance"}
              onClick={() => setActiveTab("appearance")}
            />
            <SideNavItem
              label="JMAP Server & Quota"
              icon={<Server size={16} />}
              isSelected={activeTab === "server"}
              onClick={() => setActiveTab("server")}
            />
            <SideNavItem
              label="Identities & Signatures"
              icon={<UserCheck size={16} />}
              isSelected={activeTab === "identities"}
              onClick={() => setActiveTab("identities")}
            />
            <SideNavItem
              label="Vacation Responder"
              icon={<Plane size={16} />}
              isSelected={activeTab === "vacation"}
              onClick={() => setActiveTab("vacation")}
            />
            <SideNavItem
              label="Folders & Labels"
              icon={<Folder size={16} />}
              isSelected={activeTab === "folders"}
              onClick={() => setActiveTab("folders")}
            />
          </SideNavSection>
        </SideNav>
      }
    >
      <Layout
        height="fill"
        defaultHasDividers
        header={
          <LayoutHeader padding={0} label="Settings controls">
            <Section variant="transparent" paddingInline={4} paddingBlock={0} width="100%">
              <Toolbar
                label="Settings actions"
                size="sm"
                startContent={
                  <Heading level={2}>
                    {sectionTitle}
                  </Heading>
                }
                endContent={
                  activeTab === "identities" ? (
                    <Button
                      label="New Identity"
                      variant="primary"
                      size="sm"
                      icon={<Plus size={16} />}
                      onClick={() => setIsAddIdentityOpen(true)}
                    />
                  ) : activeTab === "folders" ? (
                    <Button
                      label="New Folder"
                      variant="primary"
                      size="sm"
                      icon={<Plus size={16} />}
                      onClick={() => setIsAddFolderOpen(true)}
                    />
                  ) : activeTab === "general" ? (
                    <Button
                      label="Save Changes"
                      variant="primary"
                      size="sm"
                      icon={<Check size={16} />}
                      onClick={handleSaveGeneralSettings}
                    />
                  ) : undefined
                }
              />
            </Section>
          </LayoutHeader>
        }
        content={
          <LayoutContent padding={0} isScrollable label="Settings content">
            {/* GENERAL PREFERENCES */}
            {activeTab === "general" && (
              <Section variant="transparent" padding={4} width="100%">
                <VStack gap={4} width="100%">
                  <Text type="body" color="secondary">
                    Configure your daily email handling behaviors, conversation groupings, and message list options.
                  </Text>

                  {/* Conversation View */}
                  <Card padding={4} width="100%">
                    <VStack gap={3}>
                      <VStack gap={0.5}>
                        <Text type="body" weight="semibold">
                          Conversation Threading
                        </Text>
                        <Text type="supporting" color="secondary">
                          Group messages with the exact same subject line together into a single conversation thread.
                        </Text>
                      </VStack>
                      <CheckboxInput
                        label="Enable Conversation View (group emails into threads)"
                        value={conversationView}
                        onChange={(val) => setConversationView(val)}
                      />
                    </VStack>
                  </Card>

                  {/* Page Size & Snippets */}
                  <Card padding={4} width="100%">
                    <VStack gap={3}>
                      <VStack gap={0.5}>
                        <Text type="body" weight="semibold">
                          Message List Density
                        </Text>
                        <Text type="supporting" color="secondary">
                          How many conversations appear on each page in the mailbox.
                        </Text>
                      </VStack>
                      <HStack gap={2} wrap="wrap">
                        <Button
                          label="25 conversations per page"
                          variant={pageSize === "25" ? "primary" : "secondary"}
                          onClick={() => setPageSize("25")}
                        />
                        <Button
                          label="50 conversations per page (Default)"
                          variant={pageSize === "50" ? "primary" : "secondary"}
                          onClick={() => setPageSize("50")}
                        />
                        <Button
                          label="100 conversations per page"
                          variant={pageSize === "100" ? "primary" : "secondary"}
                          onClick={() => setPageSize("100")}
                        />
                      </HStack>
                      <CheckboxInput
                        label="Show text snippet preview in the message list"
                        value={showSnippets}
                        onChange={(val) => setShowSnippets(val)}
                      />
                    </VStack>
                  </Card>

                  {/* Undo Send Cancellation Window */}
                  <Card padding={4} width="100%">
                    <VStack gap={3}>
                      <VStack gap={0.5}>
                        <Text type="body" weight="semibold">
                          Undo Send Delay
                        </Text>
                        <Text type="supporting" color="secondary">
                          Amount of time you have to recall a message after clicking &quot;Send&quot;.
                        </Text>
                      </VStack>
                      <HStack gap={2} wrap="wrap">
                        <Button
                          label="5 seconds"
                          variant={undoSendDelay === "5" ? "primary" : "secondary"}
                          onClick={() => setUndoSendDelay("5")}
                        />
                        <Button
                          label="10 seconds (Recommended)"
                          variant={undoSendDelay === "10" ? "primary" : "secondary"}
                          onClick={() => setUndoSendDelay("10")}
                        />
                        <Button
                          label="20 seconds"
                          variant={undoSendDelay === "20" ? "primary" : "secondary"}
                          onClick={() => setUndoSendDelay("20")}
                        />
                        <Button
                          label="30 seconds"
                          variant={undoSendDelay === "30" ? "primary" : "secondary"}
                          onClick={() => setUndoSendDelay("30")}
                        />
                      </HStack>
                    </VStack>
                  </Card>

                  {/* Default Reply Behavior */}
                  <Card padding={4} width="100%">
                    <VStack gap={3}>
                      <VStack gap={0.5}>
                        <Text type="body" weight="semibold">
                          Default Reply Behavior
                        </Text>
                        <Text type="supporting" color="secondary">
                          Choose whether the primary reply button defaults to single sender or everyone in CC.
                        </Text>
                      </VStack>
                      <HStack gap={2}>
                        <Button
                          label="Reply (Sender only)"
                          variant={defaultReplyAction === "reply" ? "primary" : "secondary"}
                          onClick={() => setDefaultReplyAction("reply")}
                        />
                        <Button
                          label="Reply All (All participants)"
                          variant={defaultReplyAction === "reply_all" ? "primary" : "secondary"}
                          onClick={() => setDefaultReplyAction("reply_all")}
                        />
                      </HStack>
                    </VStack>
                  </Card>

                  {/* Remote Content & Image Privacy */}
                  <Card padding={4} width="100%">
                    <VStack gap={3}>
                      <VStack gap={0.5}>
                        <Text type="body" weight="semibold">
                          Images & Remote Content Privacy
                        </Text>
                        <Text type="supporting" color="secondary">
                          Protect against read tracking pixels and remote telemetry by blocking external images until approved.
                        </Text>
                      </VStack>
                      <CheckboxInput
                        label="Ask before displaying external images and remote tracking pixels"
                        value={blockRemoteImages}
                        onChange={(val) => setBlockRemoteImages(val)}
                      />
                    </VStack>
                  </Card>

                  <HStack hAlign="end">
                    <Button
                      label="Save Mailbox Preferences"
                      variant="primary"
                      icon={<Check size={16} />}
                      onClick={handleSaveGeneralSettings}
                    />
                  </HStack>
                </VStack>
              </Section>
            )}

            {/* APPEARANCE & THEME */}
            {activeTab === "appearance" && (
              <Section variant="transparent" padding={4} width="100%">
                <VStack gap={4} width="100%">
                  <Text type="body" color="secondary">
                    Customize the interface theme and email content rendering mode.
                  </Text>

                  {/* UI App Theme */}
                  <Card padding={4} width="100%">
                    <VStack gap={3}>
                      <VStack gap={0.5}>
                        <Text type="body" weight="semibold">
                          Interface Theme
                        </Text>
                        <Text type="supporting" color="secondary">
                          Select your preferred application color mode.
                        </Text>
                      </VStack>

                      <HStack gap={3} wrap="wrap">
                        <Button
                          label="System"
                          variant={preference === "system" ? "primary" : "secondary"}
                          icon={<Monitor size={16} />}
                          onClick={() => setMode("system")}
                        />
                        <Button
                          label="Light"
                          variant={preference === "light" ? "primary" : "secondary"}
                          icon={<Sun size={16} />}
                          onClick={() => setMode("light")}
                        />
                        <Button
                          label="Dark"
                          variant={preference === "dark" ? "primary" : "secondary"}
                          icon={<Moon size={16} />}
                          onClick={() => setMode("dark")}
                        />
                      </HStack>
                    </VStack>
                  </Card>

                  {/* Email Body Rendering Mode */}
                  <Card padding={4} width="100%">
                    <VStack gap={3}>
                      <VStack gap={0.5}>
                        <Text type="body" weight="semibold">
                          HTML Email Canvas Inversion
                        </Text>
                        <Text type="supporting" color="secondary">
                          Control how inbound HTML newsletters and rich messages are styled while UI dark mode is active.
                        </Text>
                      </VStack>

                      <HStack gap={3} wrap="wrap">
                        <Button
                          label="Smart Dark Mode"
                          variant={emailDarkMode === "smart" ? "primary" : "secondary"}
                          onClick={() => setEmailDarkMode("smart")}
                        />
                        <Button
                          label="Paper Canvas (Keep Light Background)"
                          variant={emailDarkMode === "paper" ? "primary" : "secondary"}
                          onClick={() => setEmailDarkMode("paper")}
                        />
                      </HStack>
                    </VStack>
                  </Card>
                </VStack>
              </Section>
            )}

            {/* JMAP SERVER & STORAGE QUOTA */}
            {activeTab === "server" && (
              <Section variant="transparent" padding={4} width="100%">
                <VStack gap={4} width="100%">
                  <Text type="body" color="secondary">
                    Review your Postarc Mailserver JMAP connectivity, protocol capabilities, and storage quota breakdown.
                  </Text>

                  {/* Server Connection Card */}
                  <Card padding={4} width="100%">
                    <VStack gap={3}>
                      <HStack hAlign="between" vAlign="center" width="100%">
                        <VStack gap={0.5}>
                          <HStack gap={2} vAlign="center">
                            <Server size={18} />
                            <Text type="body" weight="semibold">
                              Postarc Mailserver
                            </Text>
                          </HStack>
                          <Text type="supporting" color="secondary">
                            Session endpoint: /api/jmap (Cloudflare R2 Blob Storage Connected)
                          </Text>
                        </VStack>
                        <Token label="Connected · Sync OK" size="sm" color="green" />
                      </HStack>

                      <VStack gap={1} width="100%">
                        <Text type="body" size="sm" weight="medium">
                          Active Account: {activeIdentity.email}
                        </Text>
                        <Text type="supporting" color="secondary" size="xsm">
                          Server ID: stal_primary_cluster_01 · Protocol: JMAP over HTTP/2
                        </Text>
                      </VStack>
                    </VStack>
                  </Card>

                  {/* Storage Quota Card */}
                  <Card padding={4} width="100%">
                    <VStack gap={3}>
                      <HStack hAlign="between" vAlign="center" width="100%">
                        <HStack gap={2} vAlign="center">
                          <HardDrive size={18} />
                          <Text type="body" weight="semibold">
                            Storage Quota Allocation
                          </Text>
                        </HStack>
                        <Text type="body" size="sm" color="secondary">
                          {storageUsedGB} GB used of {storageTotalGB} GB ({quotaInfo.percent}%)
                        </Text>
                      </HStack>

                      <ProgressBar
                        label="Storage quota"
                        isLabelHidden
                        value={quotaInfo.percent}
                        max={100}
                        variant={quotaInfo.percent >= 80 ? "error" : "accent"}
                      />

                      <HStack gap={4} wrap="wrap">
                        <VStack gap={0.5}>
                          <Text type="supporting" color="secondary" size="xsm">Mail & Threads</Text>
                          <Text type="body" weight="semibold">1.8 GB</Text>
                        </VStack>
                        <VStack gap={0.5}>
                          <Text type="supporting" color="secondary" size="xsm">Attachments & Media</Text>
                          <Text type="body" weight="semibold">0.6 GB</Text>
                        </VStack>
                        <VStack gap={0.5}>
                          <Text type="supporting" color="secondary" size="xsm">Spam & Trash</Text>
                          <Text type="body" weight="semibold">0.1 GB</Text>
                        </VStack>
                        <VStack gap={0.5}>
                          <Text type="supporting" color="secondary" size="xsm">Free Remaining Space</Text>
                          <Text type="body" weight="semibold" color="accent">12.5 GB</Text>
                        </VStack>
                      </HStack>
                    </VStack>
                  </Card>

                  {/* Capabilities Card */}
                  <Card padding={4} width="100%">
                    <VStack gap={2}>
                      <HStack gap={2} vAlign="center">
                        <ShieldCheck size={18} />
                        <Text type="body" weight="semibold">
                          Server Protocol Standards & Security
                        </Text>
                      </HStack>
                      <HStack gap={2} wrap="wrap">
                        <Token label="JMAP Core (RFC 8620)" size="sm" color="blue" />
                        <Token label="JMAP Mail (RFC 8621)" size="sm" color="blue" />
                        <Token label="JMAP Submission" size="sm" color="blue" />
                        <Token label="Sieve Filter (RFC 5228)" size="sm" color="green" />
                        <Token label="TLS 1.3 Strict" size="sm" color="green" />
                        <Token label="SPF / DKIM / DMARC Pass" size="sm" color="green" />
                      </HStack>
                    </VStack>
                  </Card>
                </VStack>
              </Section>
            )}

            {/* IDENTITIES & SIGNATURES */}
            {activeTab === "identities" && (
              <>
                <Section variant="transparent" paddingInline={4} paddingBlock={3} width="100%">
                  <Text type="body" color="secondary">
                    Configure multiple &quot;Send As&quot; identities, alias email addresses, and per-identity signatures.
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
                    {identities.map((ident) => (
                      <ListItem
                        key={ident.id}
                        align="center"
                        label={
                          <HStack gap={2} vAlign="center">
                            <Text type="body" weight="semibold">
                              {ident.name}
                            </Text>
                            <Text type="body" color="secondary">
                              &lt;{ident.email}&gt;
                            </Text>
                            {ident.isDefault && (
                              <Token label="Default" size="sm" color="blue" />
                            )}
                          </HStack>
                        }
                        description={
                          ident.textSignature ? (
                            <Text type="body" color="secondary">
                              Signature: {ident.textSignature.replace(/\n/g, " ")}
                            </Text>
                          ) : undefined
                        }
                        endContent={
                          !ident.isDefault ? (
                            <IconButton
                              label="Delete identity"
                              tooltip="Delete identity"
                              icon={<Trash2 size={16} />}
                              variant="ghost"
                              size="sm"
                              onClick={() => setIdentToDelete(ident)}
                            />
                          ) : undefined
                        }
                      />
                    ))}
                  </List>
                </Section>
              </>
            )}

            {/* VACATION AUTO-RESPONDER */}
            {activeTab === "vacation" && (
              <Section variant="transparent" padding={4} width="100%">
                <VStack gap={4} width="100%">
                  <Text type="body" color="secondary">
                    Automatically reply to incoming messages while you are away or on holiday.
                  </Text>

                  <Card padding={4} width="100%">
                    <VStack gap={3} width="100%">
                      <CheckboxInput
                        label="Enable Out of Office auto-reply"
                        value={isVacationEnabled}
                        onChange={(val) => setIsVacationEnabled(val)}
                      />
                      <TextInput
                        label="Subject Line"
                        value={vacationSubject}
                        onChange={(val) => setVacationSubject(val)}
                        placeholder="Out of Office autoreply..."
                        isDisabled={!isVacationEnabled}
                      />
                      <TextArea
                        label="Auto-Reply Message Body"
                        value={vacationBody}
                        onChange={(val) => setVacationBody(val)}
                        placeholder="I am currently away and will reply upon return..."
                        rows={4}
                        isDisabled={!isVacationEnabled}
                      />
                      <HStack hAlign="end">
                        <Button
                          label="Save Responder Settings"
                          variant="primary"
                          icon={<Check size={16} />}
                          onClick={() => {
                            saveVacationSettings({
                              isEnabled: isVacationEnabled,
                              subject: vacationSubject,
                              body: vacationBody,
                            })
                          }}
                        />
                      </HStack>
                    </VStack>
                  </Card>
                </VStack>
              </Section>
            )}

            {/* MAILBOX FOLDERS */}
            {activeTab === "folders" && (
              <>
                <Section variant="transparent" paddingInline={4} paddingBlock={3} width="100%">
                  <Text type="body" color="secondary">
                    Organize and manage your custom mailbox labels and folders.
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
                    {customFolders.map((folder) => (
                      <ListItem
                        key={folder.id}
                        align="center"
                        startContent={<Folder size={18} color={folder.color || "currentColor"} />}
                        label={
                          <Text type="body" weight="semibold">
                            {folder.name}
                          </Text>
                        }
                        endContent={
                          <IconButton
                            label="Delete folder"
                            tooltip="Delete folder"
                            icon={<Trash2 size={16} />}
                            variant="ghost"
                            size="sm"
                            onClick={() => setFolderToDelete(folder)}
                          />
                        }
                      />
                    ))}
                  </List>
                </Section>
              </>
            )}
          </LayoutContent>
        }
      />

      {/* Canonical Add Identity Dialog */}
      <Dialog
        isOpen={isAddIdentityOpen}
        onOpenChange={setIsAddIdentityOpen}
        purpose="form"
        width={480}
      >
        <Layout
          header={
            <DialogHeader
              title="Create Sender Identity"
              subtitle="Add an email alias or display personality with signature"
              onOpenChange={setIsAddIdentityOpen}
            />
          }
          content={
            <LayoutContent>
              <VStack gap={3}>
                <TextInput
                  label="Display Name"
                  placeholder="e.g. Sales Inquiries"
                  value={newIdentName}
                  onChange={(val) => setNewIdentName(val)}
                />
                <TextInput
                  label="Email Address"
                  placeholder="e.g. sales@domain.com"
                  value={newIdentEmail}
                  onChange={(val) => setNewIdentEmail(val)}
                />
                <TextArea
                  label="Signature (Plain text)"
                  placeholder="Your custom signature..."
                  value={newIdentSig}
                  onChange={(val) => setNewIdentSig(val)}
                  rows={4}
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
                  onClick={() => setIsAddIdentityOpen(false)}
                />
                <Button
                  label="Save Identity"
                  variant="primary"
                  isDisabled={!newIdentName.trim() || !newIdentEmail.trim()}
                  onClick={handleAddIdentity}
                />
              </HStack>
            </LayoutFooter>
          }
        />
      </Dialog>

      {/* Canonical Add Folder Dialog */}
      <Dialog
        isOpen={isAddFolderOpen}
        onOpenChange={setIsAddFolderOpen}
        purpose="form"
        width={440}
      >
        <Layout
          header={
            <DialogHeader
              title="Create Custom Folder"
              subtitle="Organize your messages with a dedicated mailbox folder"
              onOpenChange={setIsAddFolderOpen}
            />
          }
          content={
            <LayoutContent>
              <VStack gap={3}>
                <TextInput
                  label="Folder Name"
                  placeholder="e.g. Clients, Taxes, Architecture"
                  value={newFolderName}
                  onChange={(val) => setNewFolderName(val)}
                />
                <VStack gap={1}>
                  <Text type="body" size="sm" weight="semibold">
                    Folder Tag Color
                  </Text>
                  <SegmentedControl
                    value={newFolderColor}
                    onChange={(val) => setNewFolderColor(val)}
                    label="Folder Color"
                  >
                    <SegmentedControlItem value="#2563eb" label="Blue" />
                    <SegmentedControlItem value="#059669" label="Green" />
                    <SegmentedControlItem value="#d97706" label="Amber" />
                    <SegmentedControlItem value="#8b5cf6" label="Purple" />
                  </SegmentedControl>
                </VStack>
              </VStack>
            </LayoutContent>
          }
          footer={
            <LayoutFooter>
              <HStack hAlign="end" gap={2}>
                <Button
                  label="Cancel"
                  variant="secondary"
                  onClick={() => setIsAddFolderOpen(false)}
                />
                <Button
                  label="Create Folder"
                  variant="primary"
                  isDisabled={!newFolderName.trim()}
                  onClick={handleCreateFolder}
                />
              </HStack>
            </LayoutFooter>
          }
        />
      </Dialog>

      {/* Delete Identity Confirmation AlertDialog */}
      <AlertDialog
        isOpen={!!identToDelete}
        onOpenChange={(open) => {
          if (!open) setIdentToDelete(null)
        }}
        title="Delete Sender Identity?"
        description={`Are you sure you want to delete identity "${identToDelete?.name || ""}" <${identToDelete?.email || ""}>?`}
        actionLabel="Delete Identity"
        actionVariant="destructive"
        onAction={handleConfirmDeleteIdentity}
      />

      {/* Delete Folder Confirmation AlertDialog */}
      <AlertDialog
        isOpen={!!folderToDelete}
        onOpenChange={(open) => {
          if (!open) setFolderToDelete(null)
        }}
        title="Delete Mailbox Folder?"
        description={`Are you sure you want to delete custom folder "${folderToDelete?.name || ""}"? Messages inside will be moved to Archive.`}
        actionLabel="Delete Folder"
        actionVariant="destructive"
        onAction={handleConfirmDeleteFolder}
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
              title="Settings Shortcuts"
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
                      <Text type="body" size="sm">Search settings</Text>
                      <Kbd keys="/" />
                    </HStack>
                    <HStack hAlign="between" vAlign="center">
                      <Text type="body" size="sm">Back to inbox</Text>
                      <Kbd keys="u" />
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
