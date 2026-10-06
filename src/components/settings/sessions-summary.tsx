import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { ChevronRight, Monitor, Smartphone, Tablet, HelpCircle } from "lucide-react"
import { prisma } from "@/lib/prisma"
import { requireUser } from "@/lib/auth"
import { deviceKind, formatDevice } from "@/lib/user-agent"
import { FadeUp } from "@/components/motion/fade-up"

/**
 * The "Devices" section of Settings: how many devices are signed in, the
 * most recent few, and the way to the full page
 * (/dashboard/settings/sessions), where each can be signed out.
 *
 * It replaced the full list that lived in this card (active-sessions.tsx),
 * because Settings also opens as a modal, and a list of devices with a
 * confirmation per row is a page's worth of interface, not a modal's.
 * Entrance through FadeUp (framer-motion, reduced-motion aware).
 */
const ICONS = { phone: Smartphone, tablet: Tablet, desktop: Monitor } as const

export async function SessionsSummary() {
  const user = await requireUser()
  const t = await getTranslations("dashboard.settings.devices")
  const sessions = await prisma.session.findMany({
    where: { userId: user.id, expiresAt: { gt: new Date() } },
    select: { id: true, userAgent: true },
    orderBy: { updatedAt: "desc" },
  })
  const shown = sessions.slice(0, 3)

  return (
    <FadeUp className="space-y-3 text-sm">
      <p className="text-muted-foreground">{t("summary", { count: sessions.length })}</p>
      <ul className="divide-y divide-border border border-border">
        {shown.map((session) => {
          const kind = deviceKind(session.userAgent)
          const Icon = kind ? ICONS[kind] : HelpCircle
          return (
            <li key={session.id} className="flex items-center gap-3 px-3 py-2.5">
              <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="truncate">{formatDevice(session.userAgent) ?? t("unknownDevice")}</span>
            </li>
          )
        })}
      </ul>
      <Link
        href="/dashboard/settings/sessions"
        className="inline-flex h-10 w-full items-center justify-between gap-2 border border-border px-4 text-sm font-medium transition-colors hover:bg-secondary sm:w-auto"
      >
        {t("manage")} <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </FadeUp>
  )
}
