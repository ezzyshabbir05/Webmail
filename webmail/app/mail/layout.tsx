import type { Metadata } from "next"
import { MailProvider } from "@/context/mail-context"

export const metadata: Metadata = {
  title: "Inbox — Webmail",
  description: "Next.js Webmail Client powered by Astryx and JMAP",
}

export default function MailLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <MailProvider>{children}</MailProvider>
}
