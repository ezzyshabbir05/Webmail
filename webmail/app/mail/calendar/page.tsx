"use client"

export const dynamic = "force-dynamic"

import React, { useState, useEffect } from "react"
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
import { Token } from "@astryxdesign/core/Token"
import { Card } from "@astryxdesign/core/Card"
import { Avatar } from "@astryxdesign/core/Avatar"
import { DropdownMenu } from "@astryxdesign/core/DropdownMenu"
import { ProgressBar } from "@astryxdesign/core/ProgressBar"
import { Calendar } from "@astryxdesign/core/Calendar"
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog"
import { AlertDialog } from "@astryxdesign/core/AlertDialog"
import { EmptyState } from "@astryxdesign/core/EmptyState"
import { Kbd } from "@astryxdesign/core/Kbd"
import { ThemeToggle } from "@/components/theme-toggle"
import { useMail } from "@/context/mail-context"
import {
  Calendar as CalendarIcon,
  Plus,
  Clock,
  Inbox,
  Mail,
  Users,
  Filter,
  Keyboard,
  Search,
  Trash2,
  MapPin,
  FileText,
  Settings,
  LogOut,
} from "lucide-react"
import { postarcClient } from "@/lib/jmap/client"
import type { CalendarEvent } from "@/types/webmail"

type ISODate = `${number}${number}${number}${number}-${number}${number}-${number}${number}`

export default function CalendarPage() {
  const { activeIdentity, quotaInfo } = useMail()
  const storageUsedGB = (quotaInfo.usedBytes / (1024 * 1024 * 1024)).toFixed(1)
  const storageTotalGB = (quotaInfo.totalBytes / (1024 * 1024 * 1024)).toFixed(0)

  const [events, setEvents] = useState<(CalendarEvent & { date: string })[]>([])
  const todayIso = new Date().toISOString().split("T")[0] as ISODate
  const [selectedISODate, setSelectedISODate] = useState<ISODate>(todayIso)
  const [activeCategory, setActiveCategory] = useState<"All" | "Work" | "Personal" | "Important">("All")
  const [search, setSearch] = useState("")

  // Fetch Live JSCalendar events from Postarc Mailserver
  useEffect(() => {
    postarcClient
      .getCalendarEvents()
      .then((jmapEvents) => {
        if (jmapEvents && jmapEvents.length > 0) {
          const mapped = jmapEvents.map((ev) => {
            const datePart = (ev.start || todayIso).split("T")[0]
            const timePart = (ev.start || "").split("T")[1] || "10:00 AM"
            return {
              id: ev.id,
              date: datePart,
              title: ev.title,
              start: timePart.slice(0, 5),
              end: (ev.end || "").split("T")[1]?.slice(0, 5) || "11:00 AM",
              category: (Object.keys(ev.categories || {})[0] || "Work") as CalendarEvent["category"],
              location: Object.values(ev.locations || {})[0]?.name,
              description: ev.description,
            }
          })
          setEvents(mapped)
        }
      })
      .catch(() => {})
  }, [todayIso])

  // Dialog & Alert states
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false)
  const [eventToDelete, setEventToDelete] = useState<string | null>(null)

  // Form states
  const [newTitle, setNewTitle] = useState("")
  const [newStart, setNewStart] = useState("10:00 AM")
  const [newEnd, setNewEnd] = useState("11:00 AM")
  const [newLocation, setNewLocation] = useState("")
  const [newDescription, setNewDescription] = useState("")
  const [newEventCategory, setNewEventCategory] = useState<CalendarEvent["category"]>("Work")

  const handleAddEvent = () => {
    if (!newTitle.trim()) return
    const newId = `ev_${Date.now()}`
    const newEv: CalendarEvent & { date: string } = {
      id: newId,
      date: selectedISODate,
      title: newTitle.trim(),
      start: newStart,
      end: newEnd,
      location: newLocation.trim() || undefined,
      description: newDescription.trim() || undefined,
      category: newEventCategory,
    }
    setEvents((prev) => [...prev, newEv])
    postarcClient
      .setCalendarEvents({
        create: {
          [newId]: {
            title: newEv.title,
            start: `${selectedISODate}T${newStart}:00`,
            end: `${selectedISODate}T${newEnd}:00`,
            description: newEv.description,
            locations: newEv.location ? { loc: { name: newEv.location } } : undefined,
            categories: { [newEv.category]: true },
          },
        },
      })
      .catch(() => {})
    setNewTitle("")
    setNewLocation("")
    setNewDescription("")
    setIsAddOpen(false)
  }

  const handleDeleteEvent = () => {
    if (!eventToDelete) return
    const id = eventToDelete
    setEvents((prev) => prev.filter((e) => e.id !== id))
    postarcClient.setCalendarEvents({ destroy: [id] }).catch(() => {})
    setEventToDelete(null)
  }

  const filteredEvents = events.filter((ev) => {
    const matchesSearch =
      !search.trim() ||
      ev.title.toLowerCase().includes(search.toLowerCase()) ||
      (ev.location && ev.location.toLowerCase().includes(search.toLowerCase())) ||
      (ev.description && ev.description.toLowerCase().includes(search.toLowerCase()))

    const matchesDate = ev.date === selectedISODate

    const matchesCategory =
      activeCategory === "All"
        ? true
        : activeCategory === "Work"
        ? ev.category === "Work" || ev.category === "Meeting"
        : ev.category === activeCategory

    return matchesSearch && matchesDate && matchesCategory
  })

  // Format nice human date for the agenda heading
  const parsedDate = new Date(`${selectedISODate}T00:00:00`)
  const readableSelectedDate = parsedDate.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  })

  return (
    <AppShell
      variant="elevated"
      contentPadding={0}
      height="fill"
      topNav={
        <TopNav
          label="Calendar navigation"
          heading={
            <TopNavHeading
              heading="Postarc Webmail"
              headingHref="/mail"
            />
          }
          centerContent={
            <TextInput
              label="Search events"
              isLabelHidden
              type="search"
              placeholder="Search events and agendas..."
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
          aria-label="Calendars"
          resizable={{ defaultWidth: 230, minWidth: 180, maxWidth: 380 }}
          topContent={
            <VStack width="100%" padding={1}>
              <Button
                label="New Event"
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
          <SideNavSection title="Calendars">
            <SideNavItem
              label="All Events"
              icon={<CalendarIcon size={16} />}
              isSelected={activeCategory === "All"}
              onClick={() => setActiveCategory("All")}
            />
            <SideNavItem
              label="Work"
              icon={<CalendarIcon size={16} />}
              isSelected={activeCategory === "Work"}
              onClick={() => setActiveCategory("Work")}
            />
            <SideNavItem
              label="Personal"
              icon={<CalendarIcon size={16} />}
              isSelected={activeCategory === "Personal"}
              onClick={() => setActiveCategory("Personal")}
            />
            <SideNavItem
              label="Important"
              icon={<Clock size={16} />}
              isSelected={activeCategory === "Important"}
              onClick={() => setActiveCategory("Important")}
            />
          </SideNavSection>
        </SideNav>
      }
    >
      <Layout
        height="fill"
        defaultHasDividers
        header={
          <LayoutHeader padding={0} label="Calendar controls">
            <Section variant="transparent" paddingInline={4} paddingBlock={0} width="100%">
              <Toolbar
                label="Calendar actions"
                size="sm"
                startContent={
                  <Heading level={2}>
                    {readableSelectedDate}
                  </Heading>
                }
                endContent={
                  <HStack gap={2} vAlign="center">
                    <Token
                      label={`${filteredEvents.length} ${
                        filteredEvents.length === 1 ? "event" : "events"
                      }`}
                      size="sm"
                      color="blue"
                    />
                    <Button
                      label="New Event"
                      variant="primary"
                      size="sm"
                      icon={<Plus size={16} />}
                      onClick={() => setIsAddOpen(true)}
                    />
                  </HStack>
                }
              />
            </Section>
          </LayoutHeader>
        }
        content={
          <LayoutContent padding={0} isScrollable label="Calendar split agenda">
            <Section variant="transparent" paddingInline={4} paddingBlock={3} width="100%">
              <HStack gap={4} vAlign="start" width="100%">
                {/* Left Pane: Astryx Calendar Month Grid Component */}
                <Card variant="muted" padding={3}>
                  <VStack gap={3}>
                    <Calendar
                      mode="single"
                      value={selectedISODate}
                      onChange={(val) => {
                        if (typeof val === "string") {
                          setSelectedISODate(val as ISODate)
                        }
                      }}
                    />
                    <VStack gap={1} width="100%">
                      <Text type="supporting" color="secondary" size="xsm">
                        Click any date on the grid to inspect scheduled agendas and meetings.
                      </Text>
                    </VStack>
                  </VStack>
                </Card>

                {/* Right Pane: Day Schedule Agenda */}
                <VStack gap={3} width="100%">
                  <Card variant="default" padding={3}>
                    <HStack hAlign="between" vAlign="center" width="100%">
                      <VStack gap={0.5}>
                        <Heading level={3}>Schedule for {readableSelectedDate}</Heading>
                        <Text type="supporting" color="secondary" size="sm">
                          Filter: {activeCategory}
                        </Text>
                      </VStack>
                      <Button
                        label="Add to this day"
                        variant="secondary"
                        size="sm"
                        icon={<Plus size={14} />}
                        onClick={() => setIsAddOpen(true)}
                      />
                    </HStack>
                  </Card>

                  {filteredEvents.length > 0 ? (
                    <List
                      edge="bleed"
                      hasDividers
                      density="balanced"
                    >
                      {filteredEvents.map((ev) => (
                        <ListItem
                          key={ev.id}
                          align="center"
                          startContent={<Clock size={18} className="text-info" />}
                          label={
                            <Text type="body" weight="semibold">
                              {ev.title}
                            </Text>
                          }
                          description={
                            <VStack gap={0.5} width="100%">
                              <HStack gap={2} vAlign="center">
                                <Text type="body" color="secondary">
                                  {ev.start} – {ev.end}
                                </Text>
                                {ev.location && (
                                  <HStack gap={1} vAlign="center">
                                    <MapPin size={12} />
                                    <Text type="supporting" color="secondary">
                                      {ev.location}
                                    </Text>
                                  </HStack>
                                )}
                              </HStack>
                              {ev.description && (
                                <Text type="supporting" color="secondary">
                                  {ev.description}
                                </Text>
                              )}
                            </VStack>
                          }
                          endContent={
                            <HStack gap={2} vAlign="center">
                              <Token
                                label={ev.category}
                                size="sm"
                                color={
                                  ev.category === "Work" || ev.category === "Meeting"
                                    ? "blue"
                                    : ev.category === "Important"
                                    ? "purple"
                                    : "gray"
                                }
                              />
                              <IconButton
                                label="Delete event"
                                tooltip="Delete event"
                                variant="ghost"
                                size="sm"
                                icon={<Trash2 size={15} />}
                                onClick={() => setEventToDelete(ev.id)}
                              />
                            </HStack>
                          }
                        />
                      ))}
                    </List>
                  ) : (
                    <Card variant="muted" padding={4}>
                      <EmptyState
                        icon={<CalendarIcon size={36} />}
                        title="No events scheduled for this day"
                        description={`There are no ${
                          activeCategory === "All" ? "" : activeCategory.toLowerCase() + " "
                        }events on ${readableSelectedDate}.`}
                        actions={
                          <Button
                            label="Create Event"
                            variant="primary"
                            icon={<Plus size={15} />}
                            onClick={() => setIsAddOpen(true)}
                          />
                        }
                      />
                    </Card>
                  )}
                </VStack>
              </HStack>
            </Section>
          </LayoutContent>
        }
      />

      {/* Canonical Create Event Dialog */}
      <Dialog
        isOpen={isAddOpen}
        onOpenChange={setIsAddOpen}
        purpose="form"
        width={480}
      >
        <Layout
          header={
            <DialogHeader
              title="Create Calendar Event"
              subtitle={`Schedule an appointment or reminder for ${readableSelectedDate}`}
              onOpenChange={setIsAddOpen}
            />
          }
          content={
            <LayoutContent>
              <VStack gap={3}>
                <TextInput
                  label="Event Title"
                  placeholder="e.g. Client Sync Meeting"
                  value={newTitle}
                  onChange={(val) => setNewTitle(val)}
                />
                <HStack gap={2} width="100%">
                  <TextInput
                    label="Start Time"
                    value={newStart}
                    onChange={(val) => setNewStart(val)}
                    width="50%"
                  />
                  <TextInput
                    label="End Time"
                    value={newEnd}
                    onChange={(val) => setNewEnd(val)}
                    width="50%"
                  />
                </HStack>
                <TextInput
                  label="Location / Link"
                  placeholder="e.g. Conference Room A or Meeting URL"
                  value={newLocation}
                  onChange={(val) => setNewLocation(val)}
                />
                <TextArea
                  label="Description"
                  placeholder="Agenda notes..."
                  value={newDescription}
                  onChange={(val) => setNewDescription(val)}
                  rows={3}
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
                  label="Save Event"
                  variant="primary"
                  isDisabled={!newTitle.trim()}
                  onClick={handleAddEvent}
                />
              </HStack>
            </LayoutFooter>
          }
        />
      </Dialog>

      {/* Delete Event Confirmation AlertDialog */}
      <AlertDialog
        isOpen={!!eventToDelete}
        onOpenChange={(open) => {
          if (!open) setEventToDelete(null)
        }}
        title="Delete Event?"
        description="Are you sure you want to delete this calendar event? This action cannot be undone."
        actionLabel="Delete Event"
        actionVariant="destructive"
        onAction={handleDeleteEvent}
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
              title="Calendar Shortcuts"
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
                      <Text type="body" size="sm">Create new event</Text>
                      <Kbd keys="c" />
                    </HStack>
                    <HStack hAlign="between" vAlign="center">
                      <Text type="body" size="sm">Search events</Text>
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
