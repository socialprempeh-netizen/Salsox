/**
 * /admin/customers: the per-customer breakdown.
 *
 * One row per account that has sent something or pays for a plan: what they
 * pay us each month, how many documents they sent and finished, and how much
 * Sign & Pay money moved through their documents, per currency. Every figure
 * is grouped in the database (one query each), and the rows are built and
 * sorted by src/lib/admin-customers.ts, which is where the arithmetic is
 * tested. The admin layout already restricts this route to admins; the role
 * is checked again here because the data is everyone's.
 */
import Link from "next/link"
import { redirect } from "next/navigation"
import { getFormatter, getTranslations } from "next-intl/server"
import { getCurrentUser } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { CHECKOUT_BLOCKING_STATUSES } from "@/lib/billing"
import {
  CUSTOMER_SORTS,
  customerRow,
  customerTotals,
  parseCustomerSort,
  sortCustomers,
  type CustomerInput,
} from "@/lib/admin-customers"
import { formatMinorUnits } from "@/lib/esign/payments/select"
import { AdminReveal } from "@/components/admin/admin-reveal"
import { cn } from "@/lib/utils"

const PER_PAGE = 25

type PaymentSum = { userId: string; currency: string; status: string; amount: bigint; count: bigint }

async function loadRows() {
  const [users, documents, payments, purchases] = await Promise.all([
    prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        subscription: { select: { status: true, plan: { select: { name: true, price: true, interval: true } } } },
      },
    }),
    prisma.document.groupBy({ by: ["userId", "status"], _count: { _all: true } }),
    prisma.$queryRaw<PaymentSum[]>`
      SELECT d."userId" AS "userId", p.currency AS currency, p.status::text AS status,
             SUM(p.amount)::bigint AS amount, COUNT(*)::bigint AS count
      FROM "Payment" p JOIN "Document" d ON d.id = p."documentId"
      GROUP BY 1, 2, 3`,
    prisma.purchase.findMany({ where: { status: "COMPLETED" }, select: { userId: true, plan: { select: { name: true } } } }),
  ])

  const docsByUser = new Map<string, CustomerInput["documents"]>()
  for (const d of documents) {
    const list = docsByUser.get(d.userId) ?? []
    list.push({ status: d.status, count: d._count._all })
    docsByUser.set(d.userId, list)
  }
  const paymentsByUser = new Map<string, CustomerInput["payments"]>()
  const paidCount = new Map<string, number>()
  for (const p of payments) {
    const list = paymentsByUser.get(p.userId) ?? []
    list.push({ currency: p.currency, status: p.status, amount: Number(p.amount), count: Number(p.count) })
    paymentsByUser.set(p.userId, list)
    if (p.status === "PAID") paidCount.set(p.userId, (paidCount.get(p.userId) ?? 0) + Number(p.count))
  }
  const lifetime = new Map(purchases.map((p) => [p.userId, p.plan.name]))

  return users
    .map((u) => {
      const live =
        u.subscription && (CHECKOUT_BLOCKING_STATUSES as readonly string[]).includes(u.subscription.status) ? u.subscription.plan : null
      const row = customerRow({
        id: u.id,
        email: u.email,
        name: u.name,
        createdAt: u.createdAt,
        plan: live,
        documents: docsByUser.get(u.id) ?? [],
        payments: paymentsByUser.get(u.id) ?? [],
      })
      return { ...row, planName: row.planName ?? lifetime.get(u.id) ?? null, paidCount: paidCount.get(u.id) ?? 0 }
    })
    // A customer has sent something or pays for something; a bare sign-up
    // is counted in the overview, not listed here.
    .filter((r) => r.documentsSent > 0 || r.planName !== null)
}

function money(map: Record<string, number>): string {
  const entries = Object.entries(map)
  return entries.length === 0 ? "—" : entries.map(([currency, amount]) => formatMinorUnits(amount, currency)).join(" · ")
}

export default async function AdminCustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; page?: string }>
}) {
  const user = await getCurrentUser()
  if (!user || user.role !== "ADMIN") redirect("/dashboard")
  const t = await getTranslations("adminCustomers")
  const format = await getFormatter()
  const params = await searchParams
  const sort = parseCustomerSort(params.sort)
  const parsedPage = Number.parseInt(params.page ?? "1", 10)

  const all = sortCustomers(await loadRows(), sort)
  const totals = customerTotals(all)
  const totalPages = Math.max(1, Math.ceil(all.length / PER_PAGE))
  const page = Number.isFinite(parsedPage) ? Math.min(Math.max(parsedPage, 1), totalPages) : 1
  const rows = all.slice((page - 1) * PER_PAGE, page * PER_PAGE)
  const percent = (rate: number | null) => (rate === null ? "—" : `${Math.round(rate * 100)}%`)
  const href = (next: { sort?: string; page?: number }) =>
    `/admin/customers?sort=${next.sort ?? sort}${next.page && next.page > 1 ? `&page=${next.page}` : ""}`

  const summary = [
    { label: t("customers"), value: String(totals.customers) },
    { label: t("paying"), value: String(totals.payingCustomers) },
    { label: t("monthlyRevenue"), value: formatMinorUnits(totals.monthlyRevenue, "USD") },
    { label: t("documentsSent"), value: String(totals.documentsSent) },
    { label: t("completionRate"), value: percent(totals.completionRate) },
  ]

  return (
    <div className="space-y-6">
      <AdminReveal>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="mt-1 text-muted-foreground">{t("subtitle")}</p>
      </AdminReveal>

      <AdminReveal index={1} className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {summary.map((s) => (
          <div key={s.label} className="border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{s.value}</p>
          </div>
        ))}
        <div className="col-span-2 border border-border bg-card p-4 lg:col-span-5">
          <p className="text-xs text-muted-foreground">{t("volumeTotal")}</p>
          <p className="mt-1 break-words font-semibold tabular-nums">{money(totals.collected)}</p>
        </div>
      </AdminReveal>

      <AdminReveal index={2} className="border border-border bg-card">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">{t("count", { count: all.length })}</p>
          <nav aria-label={t("sortLabel")} className="flex flex-wrap gap-1">
            {CUSTOMER_SORTS.map((s) => (
              <Link
                key={s}
                href={href({ sort: s })}
                aria-current={s === sort ? "true" : undefined}
                className={cn(
                  "border px-3 py-1.5 text-xs font-medium transition-colors",
                  s === sort ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted"
                )}
              >
                {t(`sort.${s}`)}
              </Link>
            ))}
          </nav>
        </div>

        {rows.length === 0 ? (
          <p className="p-8 text-center text-muted-foreground">{t("empty")}</p>
        ) : (
          <>
            {/* Phones: one card per customer. */}
            <ul className="divide-y divide-border md:hidden">
              {rows.map((r) => (
                <li key={r.id} className="p-4">
                  <p className="truncate font-medium">{r.name || r.email}</p>
                  <p className="truncate text-xs text-muted-foreground">{r.email}</p>
                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <dt className="text-muted-foreground">{t("colPlan")}</dt>
                    <dd className="text-right">{r.planName ?? t("free")}</dd>
                    <dt className="text-muted-foreground">{t("colRevenue")}</dt>
                    <dd className="text-right tabular-nums">{formatMinorUnits(r.monthlyRevenue, "USD")}</dd>
                    <dt className="text-muted-foreground">{t("colDocuments")}</dt>
                    <dd className="text-right tabular-nums">{t("sentCompleted", { sent: r.documentsSent, completed: r.documentsCompleted })}</dd>
                    <dt className="text-muted-foreground">{t("colVolume")}</dt>
                    <dd className="break-words text-right tabular-nums">{money(r.collected)}</dd>
                  </dl>
                </li>
              ))}
            </ul>

            {/* From md: the full table. */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead className="border-b border-border text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="p-3 font-medium">{t("colCustomer")}</th>
                    <th className="p-3 font-medium">{t("colPlan")}</th>
                    <th className="p-3 text-right font-medium">{t("colRevenue")}</th>
                    <th className="p-3 text-right font-medium">{t("colDocuments")}</th>
                    <th className="p-3 text-right font-medium">{t("colCompletion")}</th>
                    <th className="p-3 text-right font-medium">{t("colVolume")}</th>
                    <th className="hidden p-3 text-right font-medium lg:table-cell">{t("colRefunded")}</th>
                    <th className="hidden p-3 text-right font-medium xl:table-cell">{t("colJoined")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((r) => (
                    <tr key={r.id} className="hover:bg-muted/40">
                      <td className="max-w-[220px] p-3">
                        <p className="truncate font-medium">{r.name || r.email}</p>
                        <p className="truncate text-xs text-muted-foreground">{r.email}</p>
                      </td>
                      <td className="p-3">{r.planName ?? <span className="text-muted-foreground">{t("free")}</span>}</td>
                      <td className="p-3 text-right tabular-nums">{formatMinorUnits(r.monthlyRevenue, "USD")}</td>
                      <td className="p-3 text-right tabular-nums">{t("sentCompleted", { sent: r.documentsSent, completed: r.documentsCompleted })}</td>
                      <td className="p-3 text-right tabular-nums">{percent(r.completionRate)}</td>
                      <td className="p-3 text-right tabular-nums">{money(r.collected)}</td>
                      <td className="hidden p-3 text-right tabular-nums lg:table-cell">{money(r.refunded)}</td>
                      <td className="hidden whitespace-nowrap p-3 text-right text-muted-foreground xl:table-cell">
                        {format.dateTime(r.createdAt, { dateStyle: "medium" })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-border p-4 text-sm">
            <span className="text-muted-foreground">{t("page", { page, total: totalPages })}</span>
            <div className="flex gap-2">
              {page > 1 && <Link href={href({ page: page - 1 })} className="border border-border px-3 py-1.5 hover:bg-muted">{t("previous")}</Link>}
              {page < totalPages && <Link href={href({ page: page + 1 })} className="border border-border px-3 py-1.5 hover:bg-muted">{t("next")}</Link>}
            </div>
          </div>
        )}
      </AdminReveal>
    </div>
  )
}
