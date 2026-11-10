"use client"

import React, { createContext, useContext, useEffect, useState } from "react"
import { ThemeProvider as NextThemesProvider, useTheme as useNextTheme } from "next-themes"
import { Theme } from "@astryxdesign/core/theme"
import { ToastViewport } from "@astryxdesign/core/Toast"
import { themes, defaultThemeSlug } from "../astryx-themes"

export type ThemePreference = "light" | "dark" | "system"
export type ResolvedThemeMode = "light" | "dark"
export type EmailDarkMode = "smart" | "paper"

interface ThemeContextType {
  /** User-selected theme preference ("light", "dark", or "system") */
  preference: ThemePreference
  /** Resolved effective mode ("light" or "dark") */
  mode: ResolvedThemeMode
  /** How HTML emails render while UI dark mode is active */
  emailDarkMode: EmailDarkMode
  /** Update HTML email dark mode strategy */
  setEmailDarkMode: (strategy: EmailDarkMode) => void
  /** Set explicit preference ("light", "dark", or "system") */
  setMode: (mode: ThemePreference) => void
  /** Cycle or toggle theme */
  toggleTheme: () => void
  /** Whether client hydration has mounted */
  mounted: boolean
}

const ThemeContext = createContext<ThemeContextType>({
  preference: "system",
  mode: "light",
  emailDarkMode: "smart",
  setEmailDarkMode: () => {},
  setMode: () => {},
  toggleTheme: () => {},
  mounted: false,
})

export function useThemeMode() {
  return useContext(ThemeContext)
}

function AstryxThemeBridge({
  children,
  initialResolvedMode,
}: {
  children: React.ReactNode
  initialResolvedMode?: ResolvedThemeMode
}) {
  const { theme, setTheme, resolvedTheme } = useNextTheme()
  const [mounted, setMounted] = useState(false)
  const [emailDarkMode, setEmailDarkModeState] = useState<EmailDarkMode>("smart")

  useEffect(() => {
    setMounted(true)
    try {
      const saved = window.localStorage.getItem("webmail-email-dark-mode")
      if (saved === "smart" || saved === "paper") {
        setEmailDarkModeState(saved)
      }
    } catch {
      // Ignore storage read restrictions
    }
  }, [])

  const setEmailDarkMode = (strategy: EmailDarkMode) => {
    setEmailDarkModeState(strategy)
    try {
      window.localStorage.setItem("webmail-email-dark-mode", strategy)
    } catch {
      // Ignore storage write restrictions
    }
  }

  const preference: ThemePreference =
    theme === "light" || theme === "dark" || theme === "system" ? theme : "system"

  const resolvedMode: ResolvedThemeMode = mounted
    ? resolvedTheme === "dark"
      ? "dark"
      : "light"
    : initialResolvedMode ?? "light"

  // Before client hydration completes on a cold visit with no SSR cookie, pass "system"
  // so Astryx <Theme> avoids stamping data-theme="light" over next-themes's pre-paint html.dark
  const astryxMode: "light" | "dark" | "system" = mounted
    ? resolvedMode
    : initialResolvedMode ?? "system"

  // Sync resolved mode cookie so subsequent SSR loads have zero flash
  useEffect(() => {
    if (!mounted) return
    const nextCookieMode = resolvedTheme === "dark" ? "dark" : "light"
    try {
      document.cookie = `webmail-theme=${nextCookieMode}; path=/; max-age=31536000; SameSite=Lax`
    } catch {
      // Ignore cookie write restrictions
    }
  }, [mounted, resolvedTheme])

  const setMode = (nextMode: ThemePreference) => {
    setTheme(nextMode)
  }

  const toggleTheme = () => {
    setTheme(resolvedMode === "dark" ? "light" : "dark")
  }

  const activeTheme = themes[defaultThemeSlug] || themes.neutral

  return (
    <ThemeContext.Provider
      value={{
        preference,
        mode: resolvedMode,
        emailDarkMode,
        setEmailDarkMode,
        setMode,
        toggleTheme,
        mounted,
      }}
    >
      <Theme theme={activeTheme} mode={astryxMode}>
        {children}
        <ToastViewport />
      </Theme>
    </ThemeContext.Provider>
  )
}

export function AppThemeProvider({
  children,
  initialResolvedMode,
}: {
  children: React.ReactNode
  initialResolvedMode?: ResolvedThemeMode
}) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      themes={["light", "dark", "system"]}
      disableTransitionOnChange
    >
      <AstryxThemeBridge initialResolvedMode={initialResolvedMode}>
        {children}
      </AstryxThemeBridge>
    </NextThemesProvider>
  )
}
