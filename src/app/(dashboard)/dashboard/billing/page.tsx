import { requireUser } from "@/lib/auth"
import { getFormatter, getLocale, getTranslations } from "next-intl/server"
import { prisma } from "@/lib/prisma"
import { describeDiscount, getEntitlement, trialDaysFor, type DiscountSummary } from "@/lib/billing"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
// Used by the invoice table that PaymentHistory replaced (kept at the end of this file).
// import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ManageBillingButton } from "@/components/billing/manage-billing-button"
import { SubscriptionStatusBadge } from "@/components/billing/subscription-status-badge"
import { PlanCards, type PlanCardData } from "@/components/billing/plan-cards"
import { exampleEnterpriseCard } from "@/components/billing/enterprise-card"
import { CheckoutStatusToast } from "@/components/billing/checkout-status-toast"
import { CancelSubscription } from "@/components/billing/cancel-subscription"
import { Button } from "@/components/ui/button"
import { EXPORT_DOCUMENTS_PER_PART, exportPartCount } from "@/lib/esign/zip-stream"
import { listReceipts } from "@/lib/billing-receipts"
import { formatAmount, receiptHref } from "@/lib/receipts"
import { PaymentHistory, type PaymentHistoryRow } from "@/components/billing/payment-history"

// Invoice statuses come from Stripe as stable codes, like subscription ones;
// their labels live in the message files under `dashboard.billing.invoiceStatus`.
const INVOICE_STATUSES = ["draft", "open", "paid", "uncollectible", "void"]

async function getInvoices(customerId: string | null) {
  if (!customerId || !process.env.STRIPE_SECRET_KEY) return []
  try {
    const { stripe } = await import("@/lib/stripe")
    const invoices = await stripe.invoices.list({ customer: customerId, limit: 10 })
    return invoices.data
  } catch {
    return []
  }
}

// Read live from Stripe, like the invoices. A discount is Stripe's to end (a
// repeating coupon runs out, or you remove it from the dashboard), and a copy
// in the database would go stale without a webhook of its own. Skipped in demo
// mode, whose subscriptions exist only in the seed.
async function getDiscounts(stripeSubscriptionId: string | null): Promise<DiscountSummary[]> {
  if (!stripeSubscriptionId || !process.env.STRIPE_SECRET_KEY || process.env.DEMO_MODE === "true") return []
  try {
    const { stripe } = await import("@/lib/stripe")
    const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId, {
      expand: ["discounts.source.coupon", "discounts.promotion_code"],
    })
    return subscription.discounts.flatMap((discount) => describeDiscount(discount) ?? [])
  } catch {
    return []
  }
}

export default async function BillingPage() {
  const t = await getTranslations("dashboard.billing")
  const tEsign = await getTranslations("esign.billing")
  const format = await getFormatter()
  const currentUser = await requireUser()

  const user = await prisma.user.findUnique({
    where: { id: currentUser.id },
    select: { stripeCustomerId: true, subscription: { select: { id: true } } },
  })

  const entitlement = await getEntitlement(currentUser.id)
  // Large accounts export in parts (src/app/api/export/route.ts).
  const exportParts = exportPartCount(await prisma.document.count({ where: { userId: currentUser.id } }))
  const purchase = entitlement.kind === "lifetime" ? entitlement.purchase : null
  const subscription =
    entitlement.kind === "subscription"
      ? entitlement.subscription
      : entitlement.kind === "lifetime"
        ? entitlement.subscription
        : null
  const [invoices, discounts, receipts] = await Promise.all([
    getInvoices(user?.stripeCustomerId ?? null),
    getDiscounts(!purchase && subscription ? subscription.stripeSubscriptionId : null),
    listReceipts(currentUser.id),
  ])

  // Metered plans are excluded from the grid: they exist for the usage-based
  // example (docs/billing.md) and would be confusing as a self-serve card.
  // In demo mode the one-time plan is excluded too: the grid mirrors the
  // Starter / Pro / Enterprise triad of the demo landing.
  const isDemo = process.env.DEMO_MODE === "true"
  const planRows =
    entitlement.kind === "free"
      ? await prisma.plan.findMany({
        where: {
          isActive: true,
          meterEventName: null,
          ...(isDemo ? { interval: { not: "ONE_TIME" as const } } : {}),
        },
        orderBy: { price: "asc" },
      })
      : []
  // Same rule as the checkout route, so a card only shows the trial a checkout
  // from it would really carry: a free user whose subscription was cancelled
  // still has the row, and gets no second trial.
  const hasHadSubscription = Boolean(user?.subscription)
  const plans: PlanCardData[] = planRows.map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    description: p.description,
    price: p.price,
    interval: p.interval,
    stripePriceId: p.stripePriceId,
    features: p.features,
    trialDays: trialDaysFor(p, hasHadSubscription),
  }))
  const checkoutDisabled = isDemo || !process.env.STRIPE_SECRET_KEY
  const disabledNote = isDemo
    ? t("checkoutDisabledDemo")
    : t("checkoutDisabledStripe")

  const longDate = (date: Date) =>
    format.dateTime(new Date(date), { year: "numeric", month: "long", day: "numeric" })
  const money = (amount: number, currency: string | null) =>
    format.number(amount / 100, { style: "currency", currency: (currency ?? "usd").toUpperCase() })
  const renewalDate = subscription?.currentPeriodEnd ? longDate(subscription.currentPeriodEnd) : null
  // trialEndsAt stays set after a trial is over, so the status decides.
  const trialEndDate =
    subscription?.status === "TRIALING" && subscription.trialEndsAt
      ? longDate(subscription.trialEndsAt)
      : null
  const purchaseDate = purchase ? longDate(purchase.createdAt) : null

  // One history for every payment, whatever took it (src/lib/receipts.ts):
  // paid subscription invoices, one-time purchases and Sign & Pay money
  // received, each with a PDF receipt. Invoices still waiting for payment are
  // listed too, with Stripe's own page to pay them, and no receipt yet.
  const shortDate = (date: Date) => format.dateTime(date, { year: "numeric", month: "short", day: "numeric" })
  const kindLabels = { invoice: t("historyKindInvoice"), purchase: t("historyKindPurchase"), signAndPay: t("historyKindSignAndPay") }
  const locale = await getLocale()
  const hostedInvoice = new Map(invoices.map((invoice) => [invoice.id, invoice.hosted_invoice_url ?? null]))
  const dated: [number, PaymentHistoryRow][] = [
    ...receipts.map((receipt): [number, PaymentHistoryRow] => [receipt.issuedAt.getTime(), {
      key: `${receipt.kind}:${receipt.id}`,
      date: shortDate(receipt.issuedAt),
      description: receipt.description,
      kindLabel: kindLabels[receipt.kind],
      provider: receipt.provider,
      amount: formatAmount(receipt.total, receipt.currency, locale),
      status: receipt.status,
      statusLabel: receipt.status === "refunded" ? t("historyRefunded") : t("invoiceStatus.paid"),
      receiptHref: receiptHref(receipt),
      invoiceHref: receipt.kind === "invoice" ? hostedInvoice.get(receipt.id) ?? null : null,
    }]),
    ...invoices
      .filter((invoice) => invoice.status === "open" || invoice.status === "uncollectible")
      .map((invoice): [number, PaymentHistoryRow] => [(invoice.created ?? 0) * 1000, {
        key: `invoice:${invoice.id}`,
        date: shortDate(new Date((invoice.created ?? 0) * 1000)),
        description: invoice.lines?.data?.[0]?.description ?? kindLabels.invoice,
        kindLabel: kindLabels.invoice,
        provider: "Stripe" as const,
        amount: formatAmount(invoice.total ?? 0, invoice.currency, locale),
        status: invoice.status ?? "open",
        statusLabel: invoice.status && INVOICE_STATUSES.includes(invoice.status) ? t(`invoiceStatus.${invoice.status}`) : t("statusUnknown"),
        receiptHref: null,
        invoiceHref: invoice.hosted_invoice_url ?? null,
      }]),
  ]
  const historyRows = dated.sort((a, b) => b[0] - a[0]).map(([, row]) => row)

  const discountLines = discounts.map((d) => {
    const off =
      d.percentOff != null
        ? t("discountPercent", { percent: d.percentOff })
        : t("discountAmount", { amount: money(d.amountOff ?? 0, d.currency) })
    const duration =
      d.duration === "once"
        ? t("discountOnce")
        : d.endsAt
          ? t("discountUntil", { date: longDate(d.endsAt) })
          : t("discountForever")
    const line = t("discount", { discount: off, duration })
    return d.code ? `${line} · ${t("discountCode", { code: d.code })}` : line
  })

  return (
    <div className="space-y-6">
      <CheckoutStatusToast />
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="mt-1 text-muted-foreground">{t("subtitle")}</p>
      </div>

      <Card className="rounded-none">
        <CardHeader>
          <CardTitle>{t("currentPlan")}</CardTitle>
          <CardDescription>
            {purchase
              ? t("purchasedOn", { date: purchaseDate ?? "" })
              : trialEndDate
                ? t("trialEndsOn", { date: trialEndDate })
                : subscription
                  ? t("renewsOn", { date: renewalDate ?? "" })
                  : t("onFreePlan")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="font-semibold text-lg">
                {purchase?.plan.name ?? subscription?.plan.name ?? t("free")}
              </p>
              {purchase && <Badge variant="success">{t("lifetimeAccess")}</Badge>}
              {!purchase && subscription && <SubscriptionStatusBadge status={subscription.status} />}
              {!purchase && subscription?.cancelAtPeriodEnd && (
                <p className="text-sm text-muted-foreground">{t("cancelsAtPeriodEnd")}</p>
              )}
              {discountLines.map((line) => (
                <p key={line} className="text-sm text-muted-foreground">
                  {line}
                </p>
              ))}
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold">
                {purchase
                  ? `$${(purchase.amount / 100).toFixed(2)}`
                  : subscription
                    ? `$${(subscription.plan.price / 100).toFixed(2)}`
                    : "$0"}
              </p>
              <p className="text-sm text-muted-foreground">
                {purchase
                  ? t("oneTime")
                  : subscription
                    ? `/ ${subscription.plan.interval.toLowerCase()}`
                    : t("perMonth")}
              </p>
            </div>
          </div>
          {purchase && subscription && (
            <p className="text-sm text-muted-foreground">
              {t("alsoSubscribed", { plan: subscription.plan.name })}
            </p>
          )}
          {/* Stated up front, not in the terms: when it renews, and that we
              email first. Cancel is right here, not only inside the portal. */}
          {!purchase && subscription && !subscription.cancelAtPeriodEnd && renewalDate && (
            <p className="bg-muted/60 p-3 text-sm">{tEsign("renewalNotice", { date: renewalDate })}</p>
          )}
          {(subscription || (purchase && user?.stripeCustomerId)) && (
            <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center">
              <ManageBillingButton className="w-full sm:w-auto" />
              {!purchase && subscription && subscription.status !== "CANCELED" && (
                <CancelSubscription cancelling={subscription.cancelAtPeriodEnd} endDate={renewalDate ?? ""} />
              )}
              {subscription && !purchase && (
                <p className="text-sm text-muted-foreground">
                  {t("portalHint")}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {entitlement.kind === "free" && plans.length > 0 && (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">{t("availablePlans")}</h2>
            <p className="text-sm text-muted-foreground">
              {t("availablePlansHint")}
            </p>
          </div>
          <PlanCards
            plans={plans}
            checkoutDisabled={checkoutDisabled}
            disabledNote={disabledNote}
            contactCard={isDemo ? await exampleEnterpriseCard() : undefined}
          />
        </div>
      )}

      <Card className="rounded-none">
        <CardHeader>
          <CardTitle>{tEsign("exportTitle")}</CardTitle>
          <CardDescription>{tEsign("exportBody")}</CardDescription>
        </CardHeader>
        <CardContent>
          {exportParts === 1 ? (
            <Button asChild variant="outline" className="w-full sm:w-auto">
              {/* A file download from a route handler: it must be a full
                  navigation (hence `download`), not a client-side <Link> transition. */}
              <a href="/api/export" download>{tEsign("exportCta")}</a>
            </Button>
          ) : (
            <>
              <p className="mb-3 text-sm text-muted-foreground">
                {tEsign("exportParts", { parts: exportParts, perPart: EXPORT_DOCUMENTS_PER_PART })}
              </p>
              <div className="grid gap-2 sm:grid-cols-3">
                {Array.from({ length: exportParts }, (_, i) => (
                  <Button key={i} asChild variant="outline">
                    <a href={`/api/export?part=${i + 1}`} download>
                      {tEsign("exportPart", { part: i + 1, parts: exportParts })}
                    </a>
                  </Button>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-none">
        <CardHeader>
          <CardTitle>{t("paymentHistory")}</CardTitle>
          <CardDescription>{t("paymentHistoryHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          <PaymentHistory
            rows={historyRows}
            labels={{
              receipt: t("historyReceipt"),
              receiptFor: t("historyReceiptFor"),
              invoice: t("historyInvoice"),
              empty: process.env.STRIPE_SECRET_KEY || historyRows.length > 0 ? t("historyEmpty") : t("noInvoicesStripe"),
            }}
          />
        </CardContent>
      </Card>

    </div>
  )
}

// Replaced by <PaymentHistory> in the page above, which lists one-time
// purchases and Sign & Pay payments (Stripe and Paystack) beside the
// subscription invoices, each with a downloadable PDF receipt. This card
// listed Stripe invoices only, as a four-column table that scrolled sideways
// on a phone, and linked to Stripe for the PDF.
// <Card>
//   <CardHeader>
//     <CardTitle>{t("invoiceHistory")}</CardTitle>
//     <CardDescription>{t("invoiceHistoryHint")}</CardDescription>
//   </CardHeader>
//   <CardContent>
//     {invoices.length === 0 ? (
//       <p className="py-6 text-center text-sm text-muted-foreground">
//         {process.env.STRIPE_SECRET_KEY ? t("noInvoices") : t("noInvoicesStripe")}
//       </p>
//     ) : (
//       <Table>
//         <TableHeader>
//           <TableRow>
//             <TableHead>{t("colDate")}</TableHead>
//             <TableHead>{t("colAmount")}</TableHead>
//             <TableHead>{t("colStatus")}</TableHead>
//             <TableHead>{t("colInvoice")}</TableHead>
//           </TableRow>
//         </TableHeader>
//         <TableBody>
//           {invoices.map((invoice) => (
//             <TableRow key={invoice.id}>
//               <TableCell>
//                 {format.dateTime(new Date((invoice.created ?? 0) * 1000), {
//                   year: "numeric",
//                   month: "short",
//                   day: "numeric",
//                 })}
//               </TableCell>
//               {/* The invoice total in its own currency. The total, not what
//                   has been paid so far, which reads as zero on an open one. */}
//               <TableCell>{money(invoice.total ?? 0, invoice.currency)}</TableCell>
//               <TableCell>
//                 <Badge variant={invoice.status === "paid" ? "success" : "secondary"}>
//                   {invoice.status && INVOICE_STATUSES.includes(invoice.status)
//                     ? t(`invoiceStatus.${invoice.status}`)
//                     : invoice.status ?? t("statusUnknown")}
//                 </Badge>
//               </TableCell>
//               <TableCell>
//                 {invoice.hosted_invoice_url || invoice.invoice_pdf ? (
//                   <div className="flex gap-3">
//                     {invoice.hosted_invoice_url && (
//                       <a
//                         href={invoice.hosted_invoice_url}
//                         target="_blank"
//                         rel="noopener noreferrer"
//                         className="text-sm text-primary hover:underline"
//                       >
//                         {t("viewInvoice")}
//                       </a>
//                     )}
//                     {invoice.invoice_pdf && (
//                       <a
//                         href={invoice.invoice_pdf}
//                         target="_blank"
//                         rel="noopener noreferrer"
//                         className="text-sm text-primary hover:underline"
//                       >
//                         {t("downloadPdf")}
//                       </a>
//                     )}
//                   </div>
//                 ) : (
//                   <span className="text-sm text-muted-foreground">-</span>
//                 )}
//               </TableCell>
//             </TableRow>
//           ))}
//         </TableBody>
//       </Table>
//     )}
//   </CardContent>
// </Card>
