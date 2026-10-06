import type { Metadata } from "next"
import { setRequestLocale } from "next-intl/server"
import { Hero } from "@/components/landing/hero"
import { Features } from "@/components/landing/features"
import { ExploreLinks } from "@/components/landing/explore-links"
import { Pricing } from "@/components/landing/pricing"
import { PlanPricing } from "@/components/landing/plan-pricing"
import { FAQ } from "@/components/landing/faq"
import { siteConfig } from "@/config/site"
import { pageMetadata } from "@/lib/metadata"
import { isKitSite } from "@/config/kit"
import { jsonLdScript } from "@/lib/json-ld"
import { organizationJsonLd, websiteJsonLd } from "@/lib/structured-data"
import { pendingSetup } from "@/lib/setup-status"
import { SetupGuide } from "@/components/setup-guide"
// Not read here any more: see `revalidate` below.
// import { getCurrentUser } from "@/lib/auth"
import { heroCtaHref } from "@/lib/landing-cta"

export const metadata: Metadata = pageMetadata({
  title: siteConfig.seoTitle ?? `${siteConfig.name} | ${siteConfig.tagline}`,
  description: siteConfig.description,
  path: "/",
})

// Replaced by organizationJsonLd() in src/lib/structured-data.ts, which the
// About page reads too: two inline copies of "who we are" would drift.
// /**
//  * Identifies the site itself to search engines: the name to show, the logo to
//  * pick, and the profiles that are the same entity. Built from `siteConfig`,
//  * so rebranding the kit rebrands this too.
//  */
// const organizationJsonLd = {
//   "@context": "https://schema.org",
//   "@type": "Organization",
//   name: siteConfig.name,
//   url: siteConfig.url,
//   description: siteConfig.description,
//   logo: `${siteConfig.url}/icon`,
//   sameAs: [siteConfig.links.githubOrg, siteConfig.links.x].filter(Boolean),
// }

/**
 * Static, regenerated at most every five minutes. The page used to read the
 * session for the hero's button, which rendered it per request with
 * `Cache-Control: no-store`; that choice is now made in the browser
 * (src/components/landing/session-aware.tsx). Five minutes is how long a
 * change to the plans (prices, copy) can take to show in the pricing section.
 */
export const revalidate = 300

export default async function LandingPage({ params }: { params: Promise<{ locale: string }> }) {
  // Every layout and page under [locale] states its locale itself: Next
  // renders them independently, so the call in [locale]/layout.tsx does not
  // reach this one, and without it next-intl reads a request header, which
  // makes the page dynamic (next-intl's static rendering setup).
  setRequestLocale((await params).locale)
  // A fresh clone has no database yet, and the plans below come from one: this
  // page used to open on a stack trace. Development only, and not on the kit's
  // own site, whose tiers are hand-written and need no database.
  const setup = isKitSite ? null : await pendingSetup()
  if (setup) return <SetupGuide step={setup} />

  // Pricing comes from your Plan rows. The kit's own site (KIT_SITE="true")
  // swaps in the hand-written open source tiers instead: a free one plus a
  // waitlist for a paid one.
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript([organizationJsonLd(), websiteJsonLd()]) }}
      />
      {/* <Hero ctaHref={heroCtaHref({ isKitSite, signedIn: Boolean(await getCurrentUser()) })} /> */}
      <Hero ctaHrefs={{ signedOut: heroCtaHref({ isKitSite, signedIn: false }), signedIn: heroCtaHref({ isKitSite, signedIn: true }) }} />
      <Features />
      {/* Links into the solutions, free tools and comparisons: the start of
          the internal linking plan (explore-links.tsx). */}
      <ExploreLinks />
      {isKitSite ? <Pricing /> : <PlanPricing />}
      <FAQ withJsonLd />
    </>
  )
}
