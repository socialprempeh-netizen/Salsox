"use server"

/**
 * Joining the affiliate program from /dashboard/affiliate. The form checks
 * the code as it is typed; this re-checks everything, as the server must
 * (src/lib/affiliates.ts has the rules).
 */
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { getCurrentUser } from "@/lib/auth"
import { joinAffiliateProgram } from "@/lib/affiliates-store"

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
