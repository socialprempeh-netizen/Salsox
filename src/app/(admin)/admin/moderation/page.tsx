/**
 * /admin/moderation: who to look at, and why.
 *
 * Three lists. Flagged accounts, with the signals that flagged them (rules in
 * src/lib/esign/moderation.ts, over the last 30 days); the latest reasons
 * recipients gave for declining, which is where "this is a scam" shows up
 * first; and the latest Sign & Pay disputes and refunds.
 *
 * Read only. There is no suspend switch yet: the User table has no field for
 * it, and adding one is a migration to run deliberately. Until then the
 * response to a bad account is the sending limits, which already apply, and
 * contacting or removing the account.
 */
import { redirect } from "next/navigation"
import { getFormatter, getTranslations } from "next-intl/server"
import { getCurrentUser } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { AUDIT } from "@/lib/esign/audit"
import { emailConfirmationRequired, dailyWindowStart } from "@/lib/esign/sending-limits"
import { MODERATION, moderationSignals, rankFlagged, type SenderActivity } from "@/lib/esign/moderation"
import { formatMinorUnits } from "@/lib/esign/payments/select"
import { AdminReveal } from "@/components/admin/admin-reveal"
import { cn } from "@/lib/utils"

type RecipientCounts = { userId: string; total: bigint; rejected: bigint }
type DisputeCounts = { userId: string; disputes: bigint }

async function flaggedAccounts(now: Date) {
  const windowStart = new Date(now.getTime() - MODERATION.windowDays * 24 * 60 * 60 * 1000)
  const [inWindow, completed, lastDay, recipients, disputes] = await Promise.all([
    prisma.document.groupBy({ by: ["userId"], where: { sentAt: { gte: windowStart } }, _count: { _all: true } }),
    prisma.document.groupBy({ by: ["userId"], where: { sentAt: { gte: windowStart }, status: "COMPLETED" }, _count: { _all: true } }),
    prisma.document.groupBy({ by: ["userId"], where: { sentAt: { gte: dailyWindowStart(now) } }, _count: { _all: true } }),
    prisma.$queryRaw<RecipientCounts[]>`
      SELECT d."userId" AS "userId", COUNT(*)::bigint AS total,
             COUNT(*) FILTER (WHERE r."signingStatus" = 'REJECTED')::bigint AS rejected
      FROM "Recipient" r JOIN "Document" d ON d.id = r."documentId"
      WHERE d."sentAt" >= ${windowStart}
      GROUP BY 1`,
    prisma.$queryRaw<DisputeCounts[]>`
      SELECT d."userId" AS "userId", COUNT(*)::bigint AS disputes
      FROM "AuditEvent" a JOIN "Document" d ON d.id = a."documentId"
      WHERE a.type = ${AUDIT.PAYMENT_DISPUTED}
      GROUP BY 1`,
  ])

  const count = (rows: { userId: string; _count: { _all: number } }[]) => new Map(rows.map((r) => [r.userId, r._count._all]))
  const sent = count(inWindow)
  const done = count(completed)
  const day = count(lastDay)
  const recip = new Map(recipients.map((r) => [r.userId, { total: Number(r.total), rejected: Number(r.rejected) }]))
  const disp = new Map(disputes.map((r) => [r.userId, Number(r.disputes)]))

  const ids = [...new Set([...sent.keys(), ...disp.keys()])]
  if (ids.length === 0) return []
  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, email: true, name: true, createdAt: true, emailVerified: true },
  })
  const confirmation = emailConfirmationRequired()

  return rankFlagged(
    users.map((u) => {
      const activity: SenderActivity = {
        accountCreatedAt: u.createdAt,
        emailVerified: u.emailVerified,
        documentsLast24h: day.get(u.id) ?? 0,
        documentsInWindow: sent.get(u.id) ?? 0,
        completedInWindow: done.get(u.id) ?? 0,
        rejectedRecipients: recip.get(u.id)?.rejected ?? 0,
        totalRecipients: recip.get(u.id)?.total ?? 0,
        disputes: disp.get(u.id) ?? 0,
      }
      return { ...u, activity, signals: moderationSignals(activity, now, confirmation) }
    })
  )
}

export default async function AdminModerationPage() {
  const user = await getCurrentUser()
  if (!user || user.role !== "ADMIN") redirect("/dashboard")
  const t = await getTranslations("adminModeration")
  const format = await getFormatter()
  const now = new Date()
  const when = (d: Date) => format.dateTime(d, { dateStyle: "medium", timeStyle: "short" })

  const [flagged, rejections, paymentEvents] = await Promise.all([
    flaggedAccounts(now),
    prisma.recipient.findMany({
      where: { signingStatus: "REJECTED", rejectionReason: { not: null } },
      orderBy: { updatedAt: "desc" },
      take: 20,
      select: {
        id: true,
        email: true,
        rejectionReason: true,
        updatedAt: true,
        document: { select: { title: true, user: { select: { email: true } } } },
      },
    }),
    prisma.auditEvent.findMany({
      where: { type: { in: [AUDIT.PAYMENT_DISPUTED, AUDIT.PAYMENT_DISPUTE_CLOSED, AUDIT.PAYMENT_REFUNDED] } },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, type: true, data: true, createdAt: true, document: { select: { title: true, user: { select: { email: true } } } } },
    }),
  ])

  const eventAmount = (data: unknown) => {
    const d = data as { amount?: number; currency?: string } | null
    return d?.amount !== undefined && d.currency ? formatMinorUnits(d.amount, d.currency) : ""
  }

  return (
    <div className="space-y-6">
      <AdminReveal>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="mt-1 text-muted-foreground">{t("subtitle", { days: MODERATION.windowDays })}</p>
      </AdminReveal>

      <AdminReveal index={1} className="border border-border bg-card">
        <div className="border-b border-border p-4">
          <h2 className="font-semibold">{t("flaggedTitle")}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{t("flaggedHint")}</p>
        </div>
        {flagged.length === 0 ? (
          <p className="p-8 text-center text-muted-foreground">{t("flaggedEmpty")}</p>
        ) : (
          <ul className="divide-y divide-border">
            {flagged.map((a) => (
              <li key={a.id} className="flex flex-col gap-3 p-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <p className="truncate font-medium">{a.name || a.email}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {a.email} · {t("joined", { date: format.dateTime(a.createdAt, { dateStyle: "medium" }) })}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("activity", {
                      sent: a.activity.documentsInWindow,
                      completed: a.activity.completedInWindow,
                      recipients: a.activity.totalRecipients,
                    })}
                  </p>
                </div>
                <ul className="flex flex-wrap gap-1.5 lg:max-w-[55%] lg:justify-end">
                  {a.signals.map((s) => (
                    <li
                      key={s.kind}
                      className={cn(
                        "border px-2 py-1 text-xs font-medium",
                        s.severity === "high"
                          ? "border-destructive/40 bg-destructive/10 text-destructive"
                          : "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                      )}
                    >
                      {t(`signal.${s.kind}`, s.values)}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </AdminReveal>

      <div className="grid gap-6 lg:grid-cols-2">
        <AdminReveal index={2} className="border border-border bg-card">
          <div className="border-b border-border p-4">
            <h2 className="font-semibold">{t("rejectionsTitle")}</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">{t("rejectionsHint")}</p>
          </div>
          {rejections.length === 0 ? (
            <p className="p-8 text-center text-muted-foreground">{t("rejectionsEmpty")}</p>
          ) : (
            <ul className="divide-y divide-border">
              {rejections.map((r) => (
                <li key={r.id} className="p-4 text-sm">
                  <p className="break-words">&ldquo;{r.rejectionReason}&rdquo;</p>
                  <p className="mt-1 break-words text-xs text-muted-foreground">
                    {t("rejectionMeta", { recipient: r.email, title: r.document.title, sender: r.document.user.email, when: when(r.updatedAt) })}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </AdminReveal>

        <AdminReveal index={3} className="border border-border bg-card">
          <div className="border-b border-border p-4">
            <h2 className="font-semibold">{t("paymentsTitle")}</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">{t("paymentsHint")}</p>
          </div>
          {paymentEvents.length === 0 ? (
            <p className="p-8 text-center text-muted-foreground">{t("paymentsEmpty")}</p>
          ) : (
            <ul className="divide-y divide-border">
              {paymentEvents.map((e) => (
                <li key={e.id} className="p-4 text-sm">
                  <p className="font-medium">
                    {t(`paymentEvent.${e.type}`)} {eventAmount(e.data)}
                  </p>
                  <p className="mt-1 break-words text-xs text-muted-foreground">
                    {t("paymentMeta", { title: e.document.title, sender: e.document.user.email, when: when(e.createdAt) })}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </AdminReveal>
      </div>
    </div>
  )
}
