"use client"

import React, { useState } from "react"
import {
  Card,
  VStack,
  HStack,
  Heading,
  Text,
  TextInput,
  Button,
  Banner,
  Icon,
} from "@astryxdesign/core"

interface PostarcAuthProps {
  onSuccess: () => void
}

export function PostarcAuth({ onSuccess }: PostarcAuthProps) {
  const [email, setEmail] = useState("admin@agilique.com")
  const [password, setPassword] = useState("")
  const [serverUrl, setServerUrl] = useState("")
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) {
      setErrorMessage("Please enter both email and password")
      return
    }

    setIsLoading(true)
    setErrorMessage(null)

    // Pure frontend authentication with client-side session persistence
    setTimeout(() => {
      try {
        const cleanEmail = email.trim().toLowerCase()
        const accountId = cleanEmail.split("@")[0] || "admin"
        const sessionData = {
          email: cleanEmail,
          accountId,
          serverUrl: serverUrl.trim() || "http://mail.agilique.com",
          authenticated: true,
        }

        if (typeof window !== "undefined") {
          localStorage.setItem("postarc_user", JSON.stringify(sessionData))
        }

        setIsLoading(false)
        onSuccess()
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : "Error initializing session")
        setIsLoading(false)
      }
    }, 300)
  }

  return (
    <VStack
      align="center"
      justify="center"
      className="w-full min-h-screen bg-canvas p-4"
    >
      <Card width={420} elevation="med" padding={4}>
        <form onSubmit={handleSignIn}>
          <VStack gap={5}>
            <VStack gap={2} align="center" className="text-center">
              <VStack
                align="center"
                justify="center"
                className="w-12 h-12 rounded-xl bg-primary text-primary-foreground"
              >
                <Icon icon="info" size="lg" />
              </VStack>
              <Heading level={2}>Postarc Webmail</Heading>
              <Text type="supporting">
                Sign in to your Postarc Mail account
              </Text>
            </VStack>

            {errorMessage && (
              <Banner
                status="error"
                title="Authentication Error"
                description={errorMessage}
                isDismissable
                onDismiss={() => setErrorMessage(null)}
              />
            )}

            <VStack gap={4}>
              <TextInput
                label="Email Address"
                type="email"
                value={email}
                onChange={(val) => setEmail(val)}
                placeholder="name@yourdomain.com"
                autoComplete="email"
                hasAutoFocus
                isRequired
                width="100%"
              />

              <TextInput
                label="Password"
                type="password"
                value={password}
                onChange={(val) => setPassword(val)}
                placeholder="••••••••••••"
                autoComplete="current-password"
                isRequired
                width="100%"
              />

              {showAdvanced && (
                <TextInput
                  label="Postarc Mailserver Host"
                  type="url"
                  value={serverUrl}
                  onChange={(val) => setServerUrl(val)}
                  placeholder="http://mail.agilique.com"
                  description="Optional JMAP server host endpoint"
                  width="100%"
                />
              )}

              <HStack justify="between" align="center">
                <Button
                  variant="ghost"
                  size="sm"
                  label={showAdvanced ? "Hide Host Config" : "Custom Mail Server"}
                  onClick={() => setShowAdvanced(!showAdvanced)}
                />
              </HStack>

              <Button
                variant="primary"
                label={isLoading ? "Signing In..." : "Sign In"}
                isLoading={isLoading}
                width="100%"
                type="submit"
              />
            </VStack>

            <VStack gap={1} align="center" className="text-center">
              <Text size="xsm" type="supporting">
                Postarc Webmail — Next.js 16 &amp; Astryx Design System
              </Text>
            </VStack>
          </VStack>
        </form>
      </Card>
    </VStack>
  )
}
