/**
 * /admin/documents: the Documents section of the admin console.
 *
 * Every account's documents by state over a chosen period: sent, signed
 * (completed), pending, declined, expired, cancelled and drafts, plus what
 * failed along the way (invitations that never went out, payments that
 * failed). Below, the latest documents with their sender and progress.
 *
 * Read only, and titles only: an admin sees what moved, not what the
 * documents say. Opening one is the sender's to do from their dashboard.
 */
import { redirect } from "next/navigation"
import { getFormatter, getTranslations } from "next-intl/server"
import { getCurrentUser } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { daysAgo, parseWindow, rate, WINDOWS } from "@/lib/admin/analytics"
import { loadHealthCounts } from "@/lib/admin/health-data"
import { Ban, CircleCheckBig, Clock3, FilePen, FileSignature, FileX2, Hourglass, ListChecks, Send, TriangleAlert } from "lucide-react"
import { AdminPageHeader, Chip, Empty, Panel, ScrollTable, StatGrid, StatTile, WindowPicker, type Tone } from "@/components/admin/admin-ui"

const STATUS_TONE: Record<string, Tone> = { COMPLETED: "good", PENDING: "info", DRAFT: "default", REJECTED: "bad", EXPIRED: "warn", CANCELLED: "warn" }

export default async function AdminDocumentsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const user = await getCurrentUser()
  if (!user || user.role !== "ADMIN") redirect("/dashboard")
  const t = await getTranslations("adminConsole.documents")
  const tc = await getTranslations("adminConsole.common")
  const format = await getFormatter()
  const days = parseWindow((await searchParams).days)
  const since = daysAgo(days)

  const [byStatus, drafts, failedPayments, counts, recent] = await Promise.all([
    prisma.document.groupBy({ by: ["status"], where: { sentAt: { gte: since } }, _count: { _all: true } }),
    prisma.document.count({ where: { status: "DRAFT", createdAt: { gte: since } } }),
    prisma.payment.count({ where: { status: "FAILED", updatedAt: { gte: since } } }),
    loadHealthCounts(),
    prisma.document.findMany({
      where: { status: { not: "DRAFT" } },
      orderBy: { sentAt: "desc" },
      take: 25,
      select: {
        id: true,
        title: true,
        status: true,
        sentAt: true,
        paymentAmount: true,
        user: { select: { email: true } },
        recipients: { select: { signingStatus: true, role: true } },
      },
    }),
  ])

  const count = (status: string) => byStatus.find((s) => s.status === status)?._count._all ?? 0
  const sent = byStatus.reduce((n, s) => n + s._count._all, 0)
  const completion = rate(count("COMPLETED"), sent)
  const when = (d: Date | null) => (d ? format.dateTime(d, { dateStyle: "medium" }) : "—")

  return (
    <div className="space-y-6">
      <AdminPageHeader title={t("title")} subtitle={t("subtitle", { days })} icon={FileSignature}>
        <WindowPicker path="/admin/documents" current={days} windows={WINDOWS} label={tc("period")} format={(d) => tc("days", { days: d })} />
      </AdminPageHeader>

      <StatGrid>
        <StatTile label={t("sent")} value={sent} hint={t("drafts", { count: drafts })} icon={Send} />
        <StatTile label={t("signed")} value={count("COMPLETED")} tone="good" hint={completion === null ? undefined : t("completion", { percent: Math.round(completion * 100) })} icon={CircleCheckBig} meter={completion} />
        <StatTile label={t("pending")} value={count("PENDING")} tone="info" icon={Hourglass} meter={sent ? count("PENDING") / sent : null} />
        <StatTile label={t("failed")} value={counts.undeliveredInvites + failedPayments} tone={counts.undeliveredInvites + failedPayments > 0 ? "bad" : "default"} hint={t("failedHint", { invites: counts.undeliveredInvites, payments: failedPayments })} href="/admin/health" icon={TriangleAlert} />
      </StatGrid>

      <StatGrid index={2}>
        <StatTile label={t("declined")} value={count("REJECTED")} tone={count("REJECTED") > 0 ? "warn" : "default"} href="/admin/moderation" icon={FileX2} />
        <StatTile label={t("expired")} value={count("EXPIRED")} icon={Clock3} />
        <StatTile label={t("cancelled")} value={count("CANCELLED")} icon={Ban} />
        <StatTile label={t("draftsLabel")} value={drafts} icon={FilePen} />
      </StatGrid>

      <Panel title={t("recentTitle")} hint={t("recentHint")} flush index={3} icon={ListChecks}>
        {recent.length === 0 ? (
          <Empty icon={FileSignature}>{t("empty")}</Empty>
        ) : (
          <>
            {/* Phone: a card per document. */}
            <ul className="divide-y divide-border md:hidden">
              {recent.map((d) => {
                const signers = d.recipients.filter((r) => r.role !== "VIEWER")
                return (
                  <li key={d.id} className="space-y-1.5 p-4 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 truncate font-medium">{d.title}</p>
                      <Chip tone={STATUS_TONE[d.status]}>{tc(`docStatus.${d.status}`)}</Chip>
                    </div>
                    <p className="truncate text-xs text-muted-foreground">{d.user.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {t("progress", { signed: signers.filter((r) => r.signingStatus === "SIGNED").length, total: signers.length })} · {when(d.sentAt)}
                    </p>
                  </li>
                )
              })}
            </ul>
            <div className="hidden md:block">
              <ScrollTable>
                <thead>
                  <tr>
                    <th>{t("colDocument")}</th>
                    <th>{t("colSender")}</th>
                    <th>{t("colStatus")}</th>
                    <th>{t("colProgress")}</th>
                    <th>{t("colSent")}</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((d) => {
                    const signers = d.recipients.filter((r) => r.role !== "VIEWER")
                    return (
                      <tr key={d.id}>
                        <td className="max-w-[16rem] truncate font-medium">
                          {d.title}
                          {d.paymentAmount ? <span className="ml-2"><Chip>{t("signAndPay")}</Chip></span> : null}
                        </td>
                        <td className="max-w-[14rem] truncate text-muted-foreground">{d.user.email}</td>
                        <td>
                          <Chip tone={STATUS_TONE[d.status]}>{tc(`docStatus.${d.status}`)}</Chip>
                        </td>
                        <td className="tabular-nums">{t("progress", { signed: signers.filter((r) => r.signingStatus === "SIGNED").length, total: signers.length })}</td>
                        <td className="whitespace-nowrap text-muted-foreground">{when(d.sentAt)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </ScrollTable>
            </div>
          </>
        )}
      </Panel>
    </div>
  )
}
