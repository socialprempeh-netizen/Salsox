"use server"

/**
 * Server actions behind the founder's outreach tracker (/admin/outreach):
 * add or edit a conversation, change its status from the list, delete it.
 *
 * Admin only, checked on every call: the page is behind the admin layout, but
 * an action is a public endpoint whatever page renders it. Input is re-parsed
 * with the same rules the form uses (src/lib/outreach.ts), and errors come
 * back as keys the page translates.
 */
import { revalidatePath } from "next/cache"
import { getCurrentUser } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { fromDay, OUTREACH_STATUSES, parseOutreachInput, toDay, type OutreachError, type OutreachStatus } from "@/lib/outreach"

export type OutreachResult = { ok: true } | { ok: false; error: OutreachError | "notFound" }

async function requireAdmin() {
  const user = await getCurrentUser()
  if (!user || user.role !== "ADMIN") throw new Error("Unauthorized")
}

/** The latest contact day accepted: tomorrow in UTC, for admins ahead of it. */
function latestDay() {
  return toDay(new Date(Date.now() + 86_400_000))
}

/** Creates a row, or updates the one `id` names. */
export async function saveOutreachContact(id: string | null, raw: Record<string, unknown>): Promise<OutreachResult> {
  await requireAdmin()
  const parsed = parseOutreachInput(raw, latestDay())
  if (!parsed.ok) return parsed
  const data = { ...parsed.data, contactedAt: fromDay(parsed.data.contactedAt)! }

  if (id) {
    const { count } = await prisma.outreachContact.updateMany({ where: { id }, data })
    if (count === 0) return { ok: false, error: "notFound" }
  } else {
    await prisma.outreachContact.create({ data })
  }
  revalidatePath("/admin/outreach")
  return { ok: true }
}

/** The one-tap change from the list: only the status moves. */
export async function setOutreachStatus(id: string, status: OutreachStatus): Promise<OutreachResult> {
  await requireAdmin()
  if (!OUTREACH_STATUSES.includes(status)) return { ok: false, error: "invalidStatus" }
  const { count } = await prisma.outreachContact.updateMany({ where: { id }, data: { status } })
  if (count === 0) return { ok: false, error: "notFound" }
  revalidatePath("/admin/outreach")
  return { ok: true }
}

export async function deleteOutreachContact(id: string): Promise<OutreachResult> {
  await requireAdmin()
  const { count } = await prisma.outreachContact.deleteMany({ where: { id } })
  if (count === 0) return { ok: false, error: "notFound" }
  revalidatePath("/admin/outreach")
  return { ok: true }
}
