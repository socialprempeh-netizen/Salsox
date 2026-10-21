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
// The list sits in the shared Panel now, like every other admin page.
// import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Download, Inbox, MailCheck, MailQuestion, Mails } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { AdminPageHeader, Empty, Panel, StatGrid, StatTile } from "@/components/admin/admin-ui"
// Panel and StatGrid bring their own entrance motion.
// import { AdminReveal } from "@/components/admin/admin-reveal"

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
      <AdminPageHeader title={t("waitlistTitle")} subtitle={tc("subtitle")} icon={Mails} />
      <StatGrid className="lg:grid-cols-2">
        <StatTile label={t("confirmed")} value={waitlistConfirmed} tone="good" icon={MailCheck} />
        <StatTile label={t("pending")} value={waitlistPending} tone={waitlistPending > 0 ? "warn" : "default"} icon={MailQuestion} />
      </StatGrid>
      <Panel
        title={tc("latest")}
        hint={tc("counts", { confirmed: waitlistConfirmed, pending: waitlistPending })}
        icon={Inbox}
        index={2}
        flush
        action={
          <>
            {/* A file download from a route handler, not a page. `next/link`
                would prefetch it, turning a CSV export into a background
                request; the rule cannot tell a route handler from a page. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/api/admin/newsletter-export" className="inline-flex h-9 items-center gap-2 border border-border bg-card px-3.5 text-sm font-medium transition-colors hover:border-primary/40 hover:bg-primary/[0.04]">
              <Download aria-hidden className="h-4 w-4" />
              {t("exportCsv")}
            </a>
          </>
        }
      >
          <div className="p-4 sm:p-5">
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
              {waitlistRecent.length === 0 && <Empty icon={Inbox}>{t("noSubscribers")}</Empty>}
            </div>

            {/* Sentence-case headers, as the console's other tables have. */}
            <div className="hidden md:block [&_th]:normal-case [&_th]:tracking-normal">
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
          </div>
      </Panel>
    </div>
  )
}
