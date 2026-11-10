import type { Metadata } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import { AppThemeProvider } from "@/components/theme-provider";

export const metadata: Metadata = {
  title: "Webmail — JMAP Mail Client",
  description: "Next.js Webmail Client powered by Astryx and JMAP",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const savedTheme = cookieStore.get("webmail-theme")?.value;
  const ssrResolvedMode =
    savedTheme === "dark" || savedTheme === "light" ? savedTheme : undefined;

  return (
    <html
      lang="en"
      data-astryx-theme="neutral"
      data-theme={ssrResolvedMode}
      className={ssrResolvedMode}
      suppressHydrationWarning
    >
      <body className="bg-body text-primary min-h-dvh antialiased" suppressHydrationWarning>
        <AppThemeProvider initialResolvedMode={ssrResolvedMode}>
          {children}
        </AppThemeProvider>
      </body>
    </html>
  );
}
