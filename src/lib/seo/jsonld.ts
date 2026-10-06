/**
 * Structured data for the landing, tool, comparison and use-case pages, and
 * for the hubs that list them. Site-wide graphs (Organization, WebSite) live
 * in src/lib/structured-data.ts; offers in src/lib/pricing-jsonld.ts.
 *
 * The rule throughout: describe what the page actually shows, nothing more.
 * A free tool is a WebApplication with a zero-price offer because it is one;
 * no page carries ratings or reviews, because there are none to mark up; a
 * FAQPage appears only where the questions are printed on the page. Search
 * engines treat misleading markup as spam, and a reader who clicks a rich
 * result that the page does not back up does not come back.
 *
 * Every graph here is checked by src/lib/seo/validate-jsonld.ts in tests and
 * by the crawler audit (e2e/seo.spec.ts).
 */
import { siteConfig } from "@/config/site"
import { breadcrumbJsonLd, type Crumb } from "@/lib/breadcrumb"

const abs = (path: string) => `${siteConfig.url}${path}`

/** Questions and answers printed on the page, as a FAQPage. Null when there are none. */
export function faqPageJsonLd(faq: { q: string; a: string }[]) {
  if (faq.length === 0) return null
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  }
}

/** The page itself, tied to the site and its publisher by @id. */
export function webPageJsonLd({
  path,
  name,
  description,
  dateModified,
  type = "WebPage",
}: {
  path: string
  name: string
  description: string
  dateModified?: string
  type?: "WebPage" | "CollectionPage"
}) {
  return {
    "@context": "https://schema.org",
    "@type": type,
    "@id": `${abs(path)}#webpage`,
    url: abs(path),
    name,
    description,
    inLanguage: "en",
    isPartOf: { "@id": `${siteConfig.url}/#website` },
    publisher: { "@id": `${siteConfig.url}/#organization` },
    ...(dateModified ? { dateModified } : {}),
  }
}

/**
 * A free tool that runs in the browser. Free is a fact here, not a teaser:
 * the tool works without an account, so the offer is zero.
 */
export function webApplicationJsonLd({ path, name, description, features }: { path: string; name: string; description: string; features: string[] }) {
  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    "@id": `${abs(path)}#app`,
    name,
    description,
    url: abs(path),
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web browser",
    browserRequirements: "Requires JavaScript. Works in current versions of Chrome, Safari, Firefox and Edge.",
    isAccessibleForFree: true,
    featureList: features,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    provider: { "@id": `${siteConfig.url}/#organization` },
  }
}

/** A hub listing other pages, as an ItemList of their URLs. */
export function itemListJsonLd(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: items.map((item, i) => ({ "@type": "ListItem", position: i + 1, name: item.name, url: abs(item.path) })),
  }
}

export { breadcrumbJsonLd, type Crumb }
