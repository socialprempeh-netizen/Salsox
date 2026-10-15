/**
 * /admin/users/waitlist: the Waitlist tab of the Users section.
 *
 * The newsletter and pre-launch waitlist card that sat at the bottom of the
 * old admin overview, moved here unchanged when the console was organised
 * into sections (src/lib/admin/sections.ts): confirmed and pending counts, the
 * latest signups, and the CSV export. People on the list are prospective
 * users, which is why it lives under Users.
 */
import { redirect } from "next/navigation"
import { getFormatter, getTranslations } from "next-intl/server"
import { getCurrentUser } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { AdminPageHeader } from "@/components/admin/admin-ui"
import { AdminReveal } from "@/components/admin/admin-reveal"

export default async function AdminWaitlistPage() {
  const user = await getCurrentUser()
  if (!user || user.role !== "ADMIN") redirect("/dashboard")
  const t = await getTranslations("admin")
  const tc = await getTranslations("adminConsole.waitlist")
  const format = await getFormatter()
  const date = (d: Date) => format.dateTime(d, { month: "short", day: "numeric", year: "numeric" })

  const [waitlistConfirmed, waitlistPending, waitlistRecent] = await Promise.all([
    prisma.newsletterSubscriber.count({ where: { confirmedAt: { not: null }, unsubscribedAt: null } }),
    prisma.newsletterSubscriber.count({ where: { confirmedAt: null, unsubscribedAt: null } }),
    // Was the latest 8 on the overview; a page of its own shows more.
    prisma.newsletterSubscriber.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
  ])

  const state = (sub: (typeof waitlistRecent)[number]) =>
    sub.unsubscribedAt ? (
      <Badge variant="outline">{t("unsubscribed")}</Badge>
    ) : sub.confirmedAt ? (
      <Badge variant="success">{t("confirmed")}</Badge>
    ) : (
      <Badge variant="secondary">{t("pending")}</Badge>
    )

  return (
    <div className="space-y-6">
      <AdminPageHeader title={t("waitlistTitle")} subtitle={tc("subtitle")} />
      <AdminReveal index={1}>
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>{tc("latest")}</CardTitle>
                <CardDescription>{tc("counts", { confirmed: waitlistConfirmed, pending: waitlistPending })}</CardDescription>
              </div>
              {/* A file download from a route handler, not a page. `next/link`
                  would prefetch it, turning a CSV export into a background
                  request; the rule cannot tell a route handler from a page. */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a href="/api/admin/newsletter-export" className="inline-flex h-9 items-center border border-border px-4 text-sm hover:bg-muted">
                {t("exportCsv")}
              </a>
            </div>
          </CardHeader>
          <CardContent>
            {/* Cards below `md`, a table above, as on the other admin lists. */}
            <div className="space-y-3 md:hidden">
              {waitlistRecent.map((sub) => (
                <div key={sub.id} className="border border-border p-4">
                  <p className="truncate text-sm font-medium text-foreground">{sub.email}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {state(sub)}
                    <span className="text-sm text-muted-foreground">{sub.source}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{date(sub.createdAt)}</span>
                  </div>
                </div>
              ))}
              {waitlistRecent.length === 0 && <p className="py-8 text-center text-muted-foreground">{t("noSubscribers")}</p>}
            </div>

            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[220px]">{t("colEmail")}</TableHead>
                    <TableHead>{t("colSource")}</TableHead>
                    <TableHead>{t("colStatus")}</TableHead>
                    <TableHead className="hidden lg:table-cell">{t("colRequested")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {waitlistRecent.map((sub) => (
                    <TableRow key={sub.id}>
                      <TableCell>
                        <span className="text-sm font-medium text-foreground">{sub.email}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">{sub.source}</span>
                      </TableCell>
                      <TableCell>{state(sub)}</TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <span className="whitespace-nowrap text-sm text-muted-foreground">{date(sub.createdAt)}</span>
                      </TableCell>
                    </TableRow>
                  ))}
                  {waitlistRecent.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                        {t("noSubscribers")}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </AdminReveal>
    </div>
  )
}
