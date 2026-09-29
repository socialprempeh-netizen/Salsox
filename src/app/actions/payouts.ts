"use server"

/**
 * Connecting a sender's payout account for Sign & Pay: Stripe Connect
 * (Express onboarding, hosted by Stripe) or a Paystack subaccount (created
 * from bank details the sender enters here).
 */
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { getTranslations } from "next-intl/server"
import { z } from "zod"
import { getCurrentUser } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { siteConfig } from "@/config/site"
import { startStripeOnboarding } from "@/lib/esign/payments/stripe"
import { createPaystackSubaccount } from "@/lib/esign/payments/paystack"
import { getProvider } from "@/lib/esign/payments"

export type PayoutState = { error?: string; ok?: boolean }

async function fail(code: string): Promise<PayoutState> {
  const t = await getTranslations("esign.errors")
  return { error: t.has(code) ? t(code) : t("generic") }
}

export async function connectStripeAction(): Promise<PayoutState> {
  const user = await getCurrentUser()
  if (!user) return fail("unauthorized")
  if (!getProvider("STRIPE").isConfigured()) return fail("payoutUnavailable")

  const existing = await prisma.payoutAccount.findUnique({ where: { userId_provider: { userId: user.id, provider: "STRIPE" } } })
  let url: string
  try {
    const onboarding = await startStripeOnboarding({
      email: user.email ?? "",
      existingAccountId: existing?.externalAccountId,
      returnUrl: `${siteConfig.url}/dashboard/payouts?stripe=return`,
      refreshUrl: `${siteConfig.url}/dashboard/payouts?stripe=refresh`,
    })
    await prisma.payoutAccount.upsert({
      where: { userId_provider: { userId: user.id, provider: "STRIPE" } },
      create: { userId: user.id, provider: "STRIPE", externalAccountId: onboarding.externalAccountId },
      update: { externalAccountId: onboarding.externalAccountId },
    })
    url = onboarding.url
  } catch (error) {
    console.error("[payouts] stripe onboarding failed", error)
    return fail("payoutUnavailable")
  }
  redirect(url)
}

/** Re-reads readiness from the provider (after onboarding, or on demand). */
export async function refreshPayoutStatusAction(): Promise<PayoutState> {
  const user = await getCurrentUser()
  if (!user) return fail("unauthorized")
  const accounts = await prisma.payoutAccount.findMany({ where: { userId: user.id } })
  for (const account of accounts) {
    const provider = getProvider(account.provider)
    if (!provider.isConfigured()) continue
    try {
      const ready = await provider.isPayoutReady(account.externalAccountId)
      await prisma.payoutAccount.update({ where: { id: account.id }, data: { ready } })
    } catch (error) {
      console.error("[payouts] status refresh failed", account.provider, error)
    }
  }
  revalidatePath("/dashboard/payouts")
  return { ok: true }
}

const paystackSchema = z.object({
  businessName: z.string().trim().min(2).max(100),
  bankCode: z.string().trim().min(2).max(20),
  accountNumber: z.string().trim().regex(/^\d{6,20}$/),
})

export async function connectPaystackAction(_prev: PayoutState, formData: FormData): Promise<PayoutState> {
  const user = await getCurrentUser()
  if (!user) return fail("unauthorized")
  if (!getProvider("PAYSTACK").isConfigured()) return fail("payoutUnavailable")
  const parsed = paystackSchema.safeParse({
    businessName: formData.get("businessName"),
    bankCode: formData.get("bankCode"),
    accountNumber: formData.get("accountNumber"),
  })
  if (!parsed.success) return fail("invalidInput")
  try {
    const code = await createPaystackSubaccount(parsed.data)
    await prisma.payoutAccount.upsert({
      where: { userId_provider: { userId: user.id, provider: "PAYSTACK" } },
      create: { userId: user.id, provider: "PAYSTACK", externalAccountId: code, ready: true },
      update: { externalAccountId: code, ready: true },
    })
  } catch (error) {
    console.error("[payouts] paystack subaccount failed", error)
    return fail("payoutRejected")
  }
  revalidatePath("/dashboard/payouts")
  return { ok: true }
}
