"use client"

/**
 * The last-resort error boundary: shown when the root layout itself fails
 * (src/app/error.tsx covers everything below it). The error is reported to
 * Sentry and the same ErrorView is shown (error-view-lazy.tsx).
 *
 * It replaces the root layout, so it brings what the layout would have:
 * its own <html> and <body>, the global stylesheet, the font, the brand
 * colour override (built from NEXT_PUBLIC_ variables, so it is known in the
 * browser too) and the theme. And it
 * sits outside every message provider, so it loads its own messages. They
 * come from the message file like every other string, through a dynamic
 * import: a static one would put the whole file in the bundle of every page,
 * which this boundary is part of, for a screen that is almost never shown.
 */
import { useEffect, useState } from "react"
import { Inter } from "next/font/google"
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl"
import { RotateCw } from "lucide-react"
import * as Sentry from "@sentry/nextjs"
import { LazyErrorView } from "@/components/error-view-lazy"
import { pickMessages } from "@/i18n/client-messages"
import { routing } from "@/i18n/routing"
import { brandOverrideCss } from "@/config/brand"
import "./globals.css"

// The root layout's font, under the same variable, so the text matches.
const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" })

export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const [messages, setMessages] = useState<AbstractIntlMessages | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    // The theme the root layout's inline script would have set: the visitor's
    // choice, or the system's.
    try {
      const theme = localStorage.getItem("theme")
      if (theme === "dark" || (theme === null && matchMedia("(prefers-color-scheme: dark)").matches)) {
        document.documentElement.classList.add("dark")
      }
    } catch {
      // Storage blocked: the light theme stands.
    }
    let live = true
    import("@/locales/en.json")
      .then((file) => live && setMessages(pickMessages(file.default as unknown as Record<string, unknown>, ["errorBoundary"]) as AbstractIntlMessages))
      .catch(() => {
        // LazyErrorView, which reports the error, will not render: report here.
        Sentry.captureException(error)
        if (live) setFailed(true)
      })
    return () => {
      live = false
    }
  }, [error])

  return (
    <html lang={routing.defaultLocale} className={inter.variable}>
      <body className="flex min-h-[100dvh] flex-col bg-background text-foreground antialiased">
        <style dangerouslySetInnerHTML={{ __html: brandOverrideCss() }} />
        {messages ? (
          <NextIntlClientProvider locale={routing.defaultLocale} messages={messages}>
            <LazyErrorView error={error} retry={retry} />
          </NextIntlClientProvider>
        ) : (
          failed && (
            // Not even the message file could load (the network is down, or
            // a deploy removed the chunk). A reload is the only useful act,
            // and there are no words to label it with, so it is an icon, with
            // the one string here that is not in the message file.
            <main className="flex flex-1 items-center justify-center">
              <button
                type="button"
                onClick={() => window.location.reload()}
                aria-label="Reload"
                className="flex h-12 w-12 items-center justify-center border border-border text-foreground"
              >
                <RotateCw className="h-5 w-5" aria-hidden="true" />
              </button>
            </main>
          )
        )}
      </body>
    </html>
  )
}
