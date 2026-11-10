"use client"

import React from "react"
import { DropdownMenu } from "@astryxdesign/core/DropdownMenu"
import { IconButton } from "@astryxdesign/core/IconButton"
import { Sun, Moon, Monitor, Check } from "lucide-react"
import { useThemeMode } from "@/components/theme-provider"

/**
 * Shared TopNav IconButton + DropdownMenu supporting Light / Dark / System modes.
 */
export function ThemeToggle() {
  const { preference, mode, setMode, mounted } = useThemeMode()

  const activeIcon =
    mounted && preference === "system" ? (
      <Monitor size={17} />
    ) : mode === "dark" ? (
      <Moon size={17} />
    ) : (
      <Sun size={17} />
    )

  return (
    <DropdownMenu
      alignment="end"
      renderTrigger={(triggerProps) => (
        <IconButton
          label="Switch color theme"
          tooltip="Theme: Light / Dark / System"
          variant="ghost"
          size="sm"
          icon={activeIcon}
          {...triggerProps}
        />
      )}
      items={[
        {
          id: "theme-light",
          label: "Light",
          icon: <Sun size={15} />,
          endContent: mounted && preference === "light" ? <Check size={14} /> : undefined,
          onClick: () => setMode("light"),
        },
        {
          id: "theme-dark",
          label: "Dark",
          icon: <Moon size={15} />,
          endContent: mounted && preference === "dark" ? <Check size={14} /> : undefined,
          onClick: () => setMode("dark"),
        },
        {
          id: "theme-system",
          label: "System",
          icon: <Monitor size={15} />,
          endContent: mounted && preference === "system" ? <Check size={14} /> : undefined,
          onClick: () => setMode("system"),
        },
      ]}
    />
  )
}
