import type { Metadata } from "next"
import Link from "next/link"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { getFormatter, getTranslations } from "next-intl/server"
import { ArrowLeft, ShieldCheck } from "lucide-react"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { requireUser } from "@/lib/auth"
import { deviceKind, formatDevice, formatIpAddress } from "@/lib/user-agent"
import { SessionList, type SessionRow } from "@/components/settings/session-list"

/**
 * Devices: every session signed in to this account, in account settings.
 *
 * The full list with a sign-out per device and one for all the others. The
 * Settings page keeps a short summary that links here. Rows are read with
 * Prisma, scoped to the caller, for the reason given in
 * src/components/settings/active-sessions.tsx (the library's listSessions
 * wants a session younger than a day, and this page is for the moment
 * somebody suspects an old one). Signing out goes through the library, by
 * id, in src/app/actions/sessions.ts, which redirects back here with a result
 * code.
 *
 * `auth.api.getSession` is read here for one thing the boundary in
 * @/lib/auth does not expose: which row is the current session.
 */

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("dashboard.settings.devices")
  return { title: t("title") }
}

const RESULTS: Record<string, "ok" | "error"> = { "session-revoked": "ok", "sessions-revoked": "ok", session: "error" }

export default async function SessionsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  await requireUser()
  const t = await getTranslations("dashboard.settings.devices")
  const tMessages = await getTranslations("dashboard.settings.messages")
  const format = await getFormatter()
  const current = await auth.api.getSession({ headers: await headers() })
  if (!current) redirect("/login")

  const { ok, error } = await searchParams
  const code = error ?? ok ?? ""
  const result = code in RESULTS ? { text: tMessages(code), kind: RESULTS[code] } : null

  const now = new Date()
  // Expired rows are still rows until something deletes them, and a device
  // that cannot sign in is not an active session.
  const rows = await prisma.session.findMany({
    where: { userId: current.user.id, expiresAt: { gt: now } },
    select: { id: true, createdAt: true, updatedAt: true, ipAddress: true, userAgent: true },
    orderBy: { updatedAt: "desc" },
  })

  // This device first, then most recently active.
  const sessions: SessionRow[] = rows
    .map((row) => ({
      id: row.id,
      device: formatDevice(row.userAgent),
      kind: deviceKind(row.userAgent),
      ip: formatIpAddress(row.ipAddress),
      signedIn: format.dateTime(row.createdAt, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
      lastActive: format.relativeTime(row.updatedAt, now),
      current: row.id === current.session.id,
    }))
    .sort((a, b) => Number(b.current) - Number(a.current))

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-3">
        <Link href="/dashboard/settings" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {t("back")}
        </Link>
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="mt-1 text-muted-foreground">{t("subtitle", { count: sessions.length })}</p>
        </div>
      </div>

      {result && (
        <p
          role={result.kind === "error" ? "alert" : "status"}
          className={
            result.kind === "error"
              ? "border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive"
              : "border border-primary/30 bg-primary/10 px-4 py-2.5 text-sm text-primary-hover"
          }
        >
          {result.text}
        </p>
      )}

      <SessionList sessions={sessions} />

      <div className="flex gap-3 border border-border p-4 text-xs text-muted-foreground">
        <ShieldCheck className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <div className="space-y-1.5">
          <p>{t("tip")}</p>
          {/* The honest caveat, as on the old card: `cookieCache` means a
              revoked session can survive on another device for up to a
              minute. */}
          <p>{t("caveat")}</p>
        </div>
      </div>
    </div>
  )
}
