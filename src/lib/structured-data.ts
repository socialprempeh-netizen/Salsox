import { siteConfig } from "@/config/site"

/**
 * Schema.org graphs that describe the site itself rather than one piece of
 * content on it: who publishes it (Organization), what it is (WebSite), the
 * About page, and a docs guide.
 *
 * They used to be written inline on the landing page, which is fine for one
 * page and wrong for two: the About page describes the same organisation, and
 * two hand-written copies of "who we are" drift, the one nobody looks at
 * first. Each graph is built from `siteConfig`, so it says what the page shows.
 *
 * The page-specific graphs stay with their own data: offers in
 * `pricing-jsonld.ts`, trails in `breadcrumb.ts`, articles in the blog post.
 */

/** Identifies the publisher: the name to show, the logo, the same-as profiles. */
export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${siteConfig.url}/#organization`,
    name: siteConfig.name,
    url: siteConfig.url,
    description: siteConfig.description,
    logo: `${siteConfig.url}/icon`,
    email: siteConfig.contactEmail,
    sameAs: [siteConfig.links.githubOrg, siteConfig.links.x].filter(Boolean),
  }
}

/**
 * The site as a whole, linked to its publisher by `@id`. This is where a
 * search engine reads the site name it shows above a result, instead of
 * guessing it from the domain.
 */
export function websiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${siteConfig.url}/#website`,
    name: siteConfig.name,
    url: siteConfig.url,
    description: siteConfig.description,
    publisher: { "@id": `${siteConfig.url}/#organization` },
  }
}

/** The About page, whose subject is the organisation above. */
export function aboutPageJsonLd({ path = "/about" }: { path?: string } = {}) {
  return {
    "@context": "https://schema.org",
    "@type": "AboutPage",
    url: `${siteConfig.url}${path}`,
    name: `About ${siteConfig.name}`,
    mainEntity: organizationJsonLd(),
  }
}

/**
 * A documentation guide. `inLanguage` follows the text actually served, which
 * on an untranslated page is the English fallback, not the URL's locale.
 */
export function techArticleJsonLd({
  title,
  description,
  path,
  inLanguage,
}: {
  title: string
  description?: string
  path: string
  inLanguage: string
}) {
  return {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: title,
    ...(description ? { description } : {}),
    inLanguage,
    url: `${siteConfig.url}${path}`,
    mainEntityOfPage: `${siteConfig.url}${path}`,
    publisher: { "@id": `${siteConfig.url}/#organization` },
  }
}
