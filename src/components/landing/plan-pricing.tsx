import { getTranslations } from "next-intl/server"
import { prisma } from "@/lib/prisma"
import { jsonLdScript } from "@/lib/json-ld"
import { softwareApplicationJsonLd } from "@/lib/pricing-jsonld"
import { PlanCards, type PlanCardData } from "@/components/billing/plan-cards"
// The example "Enterprise / Custom" card is no longer shown here: see below.
// import { exampleEnterpriseCard } from "@/components/billing/enterprise-card"
import { Reveal } from "@/components/landing/reveal"
import { FREE_DOCUMENTS_PER_MONTH } from "@/lib/esign/plans"

/**
 * The pricing section, rendered from your `Plan` rows: this is what the kit
 * ships by default, so changing your pricing means editing data, not
 * components. Visitors have no session yet, so the cards link to sign-in
 * instead of opening a checkout.
 *
 * Selling an open source project instead of a product? `<Pricing />` in
 * `pricing.tsx` is a hand-written alternative (free tier plus a waitlist for
 * a paid one), enabled with KIT_SITE="true".
 */
/**
 * The plans, read when the page is (re)generated rather than per visit: the
 * landing and pricing pages are static now, regenerated every few minutes.
 *
 * Two failures are handled differently on purpose. At build time a database
 * that cannot be reached must not fail the deploy (builds never needed one
 * before the page was static), so the section is left out and the first
 * regeneration fills it in. During a regeneration the error is thrown: Next
 * then keeps serving the last good page instead of caching one with no
 * pricing for the next five minutes.
 */
async function loadPlanRows() {
  try {
    return await prisma.plan.findMany({
      // One-time plans (Lifetime) are included now: they were left to the
      // billing page, so the public page never showed the $299 Lifetime offer.
      // where: { isActive: true, meterEventName: null, interval: { not: "ONE_TIME" } },
      where: { isActive: true, meterEventName: null },
      orderBy: { price: "asc" },
    })
  } catch (error) {
    if (process.env.NEXT_PHASE !== "phase-production-build") throw error
    console.warn("[pricing] database unreachable at build time; the section fills in on the first regeneration")
    return []
  }
}

export async function PlanPricing({
  heading = "h2",
  withJsonLd = false,
}: {
  heading?: "h1" | "h2"
  withJsonLd?: boolean
}) {
  const t = await getTranslations("planPricing")
  const isDemo = process.env.DEMO_MODE === "true"
  // See `Pricing`: h2 under the hero on the landing, h1 when it is the
  // heading of /pricing. The styling does not change.
  const Heading = heading

  // Metered plans stay docs-only. Was: "one-time plans (Lifetime) live on the
  // billing page, the landing shows the classic recurring triad": the cards
  // are now Personal and Business (monthly or yearly) and Lifetime.
  // const planRows = await prisma.plan.findMany({ ... }), read per request
  // until the landing page became static; see loadPlanRows below.
  const planRows = await loadPlanRows()
  if (planRows.length === 0) return null

  const plans: PlanCardData[] = planRows.map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    description: p.description,
    price: p.price,
    interval: p.interval,
    stripePriceId: p.stripePriceId,
    features: p.features,
    // A visitor has never subscribed, so the trial is theirs to take: shown
    // here as on the billing page (it was left out, hiding Business's trial).
    trialDays: p.trialDays,
  }))

  return (
    <section id="pricing" className="bg-muted/30 py-24">
      {/* The figures on this page, in a form something other than a person can
          read. Built from the same rows the cards render, so the price in a
          search result cannot disagree with the price on screen. */}
      {withJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: jsonLdScript(
              softwareApplicationJsonLd(
                plans.map((plan) => ({
                  name: plan.name,
                  price: plan.price,
                  interval: plan.interval,
                }))
              )
            ),
          }}
        />
      )}
      <div className="mx-auto max-w-6xl px-6 lg:px-12">
        <Reveal className="mb-16 text-center">
          <Heading className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            {t("title")}
          </Heading>
          <p className="mt-4 text-lg text-muted-foreground">
            {isDemo ? t("subtitleDemo") : t("subtitle", { free: FREE_DOCUMENTS_PER_MONTH })}
          </p>
        </Reveal>

        <Reveal delay={100}>
          {/* `plans`: where the menu's Pricing link lands (PRICING_HREF in
              src/lib/site-nav.ts), so the cards open in view instead of
              below the heading. html's scroll-padding-top clears the navbar. */}
          <div id="plans" className="mx-auto max-w-5xl">
            {/* Was contactCard={await exampleEnterpriseCard()}: a kit example
                ("Enterprise, Custom") that took the place where Lifetime
                belongs. Removed from the public page; the billing page
                still shows it. */}
            <PlanCards plans={plans} ctaHref="/login" />
          </div>
        </Reveal>
      </div>
    </section>
  )
}
