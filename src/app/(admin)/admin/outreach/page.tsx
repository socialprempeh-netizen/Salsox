/**
 * /admin/outreach: the founder's outreach tracker.
 *
 * A plain list of the manual conversations with prospects (who, at which
 * company, on which channel, when, how it is going, and notes), kept here
 * rather than in a spreadsheet so it sits beside the customers it turns into.
 * The page loads every row (a working list of a few hundred at most) and hands
 * them to the client component, which filters, searches and edits in place.
 *
 * The admin layout already restricts this route; the role is checked again
 * here, as on the other admin pages, because the layout is not a guard the
 * page can rely on staying in front of it.
 */
import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { getCurrentUser } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { toDay, type OutreachRow } from "@/lib/outreach"
import { AdminReveal } from "@/components/admin/admin-reveal"
import { OutreachTracker } from "@/components/admin/outreach-tracker"

export default async function AdminOutreachPage() {
  const user = await getCurrentUser()
  if (!user || user.role !== "ADMIN") redirect("/dashboard")
  const t = await getTranslations("admin.outreach")

  const contacts = await prisma.outreachContact.findMany({ orderBy: [{ contactedAt: "desc" }, { name: "asc" }] })
  const rows: OutreachRow[] = contacts.map((c) => ({
    id: c.id,
    name: c.name,
    company: c.company,
    channel: c.channel,
    contactedAt: toDay(c.contactedAt),
    status: c.status,
    notes: c.notes,
  }))

  return (
    <div className="space-y-6">
      <AdminReveal>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="mt-1 text-muted-foreground">{t("subtitle")}</p>
      </AdminReveal>
      <AdminReveal index={1}>
        <OutreachTracker rows={rows} today={toDay(new Date())} />
      </AdminReveal>
    </div>
  )
}
