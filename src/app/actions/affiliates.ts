"use server"

/**
 * Joining the affiliate program from /dashboard/affiliate. The form checks
 * the code as it is typed; this re-checks everything, as the server must
 * (src/lib/affiliates.ts has the rules).
 *
 * Also the admin's "Mark paid" on /admin/revenue/affiliates, which records
 * that an affiliate's cleared balance in one currency has been sent.
 */
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { getAdminUser, getCurrentUser } from "@/lib/auth"
import { joinAffiliateProgram, recordAffiliatePayout } from "@/lib/affiliates-store"

export type JoinAffiliateResult = { ok: true } | { ok: false; error: "unauthorized" | "invalid" | "taken" | "already" | "terms" }

const schema = z.object({ code: z.string().max(64), terms: z.literal(true) })

export async function joinAffiliate(input: { code: string; terms: boolean }): Promise<JoinAffiliateResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: "unauthorized" }
  const parsed = schema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues.some((i) => i.path[0] === "terms") ? "terms" : "invalid" }
  const result = await joinAffiliateProgram(user.id, parsed.data.code)
  if (!result.ok) return result
  revalidatePath("/dashboard/affiliate")
  return { ok: true }
}

const payoutSchema = z.object({ affiliateId: z.string().min(1).max(64), currency: z.string().regex(/^[a-z]{3}$/) })

/**
 * Records a payout. Admins only, with their second factor passed on this
 * session (getAdminUser), as for every admin write. `rows: 0` means another
 * admin, or a second press, recorded it already.
 */
export async function recordAffiliatePayoutAction(affiliateId: unknown, currency: unknown): Promise<{ ok: true; rows: number; amount: number } | { ok: false }> {
  const admin = await getAdminUser()
  if (!admin || admin.role !== "ADMIN") return { ok: false }
  const parsed = payoutSchema.safeParse({ affiliateId, currency })
  if (!parsed.success) return { ok: false }
  const result = await recordAffiliatePayout(parsed.data.affiliateId, parsed.data.currency)
  revalidatePath("/admin/revenue/affiliates")
  return { ok: true, ...result }
}
