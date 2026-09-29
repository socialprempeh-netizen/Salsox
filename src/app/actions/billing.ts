"use server"

/**
 * In-app cancellation and resumption.
 *
 * DocuSign-style tools are notorious for burying cancellation. Here it is one
 * button on the billing page, next to the Stripe portal: cancelling stops the
 * subscription at the end of the period already paid for (no partial-period
 * surprise), and resuming undoes it until then. The database is updated at
 * once so the page reflects the change; the Stripe webhook confirms it.
 */
import { revalidatePath } from "next/cache"
import { getTranslations } from "next-intl/server"
import { getCurrentUser } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export type BillingActionState = { ok?: boolean; error?: string }

async function setCancelAtPeriodEnd(cancel: boolean): Promise<BillingActionState> {
  const t = await getTranslations("esign.errors")
  const user = await getCurrentUser()
  if (!user) return { error: t("unauthorized") }
  const subscription = await prisma.subscription.findUnique({ where: { userId: user.id } })
  if (!subscription || subscription.status === "CANCELED") return { error: t("noSubscription") }
  if (!process.env.STRIPE_SECRET_KEY) return { error: t("generic") }

  try {
    const { stripe } = await import("@/lib/stripe")
    await stripe.subscriptions.update(subscription.stripeSubscriptionId, { cancel_at_period_end: cancel })
  } catch (error) {
    console.error("[billing] cancel/resume failed", error)
    return { error: t("generic") }
  }
  await prisma.subscription.update({ where: { id: subscription.id }, data: { cancelAtPeriodEnd: cancel } })
  revalidatePath("/dashboard/billing")
  revalidatePath("/dashboard")
  return { ok: true }
}

export async function cancelSubscriptionAction(): Promise<BillingActionState> {
  return setCancelAtPeriodEnd(true)
}

export async function resumeSubscriptionAction(): Promise<BillingActionState> {
  return setCancelAtPeriodEnd(false)
}
