"use server"

/**
 * Server actions for the public signing page. The token in the URL is the
 * signer's only credential, so every action takes it and the engine
 * re-validates it on each call (src/lib/esign/signing.ts).
 */
import { revalidatePath } from "next/cache"
import { getTranslations } from "next-intl/server"
import { checkRateLimit } from "@/lib/rate-limit"
import { completeSigning, rejectSigning, saveField, startPayment, type FieldInputValue } from "@/lib/esign/signing"

export type SigningActionState = { ok?: boolean; error?: string; url?: string; documentCompleted?: boolean }

async function fail(code: string): Promise<SigningActionState> {
  const t = await getTranslations("esign.errors")
  return { error: t.has(code) ? t(code) : t("generic") }
}

/** Per-token budget: a signer needs a few dozen calls; a script needs thousands. */
async function allowed(token: string) {
  return checkRateLimit(`esign:sign:${token}`, 200, 10 * 60 * 1000)
}

export async function saveFieldAction(token: string, fieldId: string, input: FieldInputValue): Promise<SigningActionState> {
  if (!(await allowed(token))) return fail("rateLimited")
  const result = await saveField(token, String(fieldId), {
    value: typeof input?.value === "string" ? input.value : null,
    imageDataUrl: typeof input?.imageDataUrl === "string" ? input.imageDataUrl : null,
    typedText: typeof input?.typedText === "string" ? input.typedText : null,
  })
  return result.ok ? { ok: true } : fail(result.error)
}

export async function completeSigningAction(token: string): Promise<SigningActionState> {
  if (!(await allowed(token))) return fail("rateLimited")
  const result = await completeSigning(token)
  if (!result.ok) return fail(result.error)
  revalidatePath(`/sign/${token}`)
  return { ok: true, documentCompleted: result.documentCompleted }
}

export async function rejectSigningAction(token: string, reason: string): Promise<SigningActionState> {
  if (!(await allowed(token))) return fail("rateLimited")
  const result = await rejectSigning(token, String(reason ?? ""))
  if (!result.ok) return fail(result.error)
  revalidatePath(`/sign/${token}`)
  return { ok: true }
}

export async function startPaymentAction(token: string): Promise<SigningActionState> {
  if (!(await allowed(token))) return fail("rateLimited")
  try {
    const result = await startPayment(token)
    return result.ok ? { ok: true, url: result.url } : fail(result.error)
  } catch (error) {
    console.error("[esign] start payment failed", error)
    return fail("paymentFailed")
  }
}
