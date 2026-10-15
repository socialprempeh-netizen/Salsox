/**
 * Everything /admin/revenue and /admin/revenue/reconciliation show for one
 * period, gathered in one place: Salsox's own records from the database and
 * the live reports from Stripe and Paystack (provider-reports.ts), fetched in
 * parallel. The two pages read the same object, so the summary and the
 * reconciliation can never be computed from different data.
 *
 * Where each revenue figure comes from, so nothing is counted twice:
 * - subscription revenue: Stripe's paid invoices (our database does not keep
 *   invoices);
 * - one-time revenue: our Purchase rows (their Stripe checkouts are only used
 *   to reconcile, never added);
 * - platform fees: Stripe application fees and Paystack's integration share;
 * - Sign & Pay volume: our Payment rows. It is the senders' money and is
 *   reported as volume, never as revenue.
 */
import { prisma } from "@/lib/prisma"
import { PLAN_CURRENCY } from "@/lib/stripe-plan-prices"
import { monthlyEquivalent } from "@/lib/metrics"
import { paystackReport, stripeReport, type PaystackReport, type ProviderReport, type StripeReport } from "./provider-reports"
import { parseFxTable, revenueByKind, signAndPayVolume, type RevenueLine } from "./revenue"

export async function loadRevenue(since: Date) {
  const [payments, purchases, activeSubscriptions, subscriptions, stripe, paystack] = await Promise.all([
    prisma.payment.findMany({
      where: { createdAt: { gte: since } },
      select: {
        id: true,
        provider: true,
        providerRef: true,
        amount: true,
        currency: true,
        status: true,
        createdAt: true,
        paidAt: true,
        documentId: true,
        document: { select: { title: true, user: { select: { email: true } } } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.purchase.findMany({
      where: { createdAt: { gte: since } },
      select: { id: true, stripePaymentIntentId: true, amount: true, currency: true, status: true, createdAt: true, user: { select: { email: true } }, plan: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.subscription.findMany({ where: { status: { in: ["ACTIVE", "TRIALING"] } }, select: { status: true, plan: { select: { price: true, interval: true } } } }),
    prisma.subscription.findMany({ select: { id: true, stripeSubscriptionId: true, status: true, user: { select: { email: true } } } }),
    stripeReport(since),
    paystackReport(since),
  ])

  // MRR counts paying subscriptions only; a trial has not paid yet.
  const mrr = activeSubscriptions.filter((s) => s.status === "ACTIVE").reduce((sum, s) => sum + monthlyEquivalent(s.plan), 0)
  const volume = signAndPayVolume(payments)

  const revenueLines: RevenueLine[] = [
    ...(stripe.state === "ok" ? stripe.subscriptionInvoices : []),
    ...purchases.filter((p) => p.status === "COMPLETED").map((p) => ({ id: p.id, kind: "oneTime" as const, currency: p.currency, amount: p.amount })),
    ...(stripe.state === "ok" ? stripe.platformFees : []),
    ...(paystack.state === "ok"
      ? Object.entries(paystack.summary.platformShare).map(([currency, amount]) => ({ id: `paystack-share-${currency}`, kind: "platformFee" as const, currency, amount }))
      : []),
  ]

  return {
    since,
    mrr: { amount: mrr, currency: PLAN_CURRENCY.toUpperCase() },
    payments,
    purchases,
    subscriptions,
    volume,
    revenue: revenueByKind(revenueLines),
    /**
     * False when a revenue source could not be read in full (Stripe down or
     * truncated, Paystack erroring), so the total is incomplete and says so.
     * Paystack not being configured at all is complete: there is nothing to read.
     */
    revenueComplete: stripe.state === "ok" && !stripe.truncated && paystack.state !== "error" && !(paystack.state === "ok" && paystack.truncated),
    fx: parseFxTable(process.env.ADMIN_FX_RATES),
    stripe: stripe as ProviderReport<StripeReport>,
    paystack: paystack as ProviderReport<PaystackReport>,
  }
}

export type RevenueData = Awaited<ReturnType<typeof loadRevenue>>
