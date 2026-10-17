/**
 * Permanent (301) redirects for URLs that answer a search intent another page
 * already owns, applied by next.config.ts.
 *
 * Imported by next.config.ts with a relative path, so no `@/` imports here.
 *
 * Each entry exists because the obvious URL for a query and the page that
 * best answers it differ, and two pages for one intent would compete with each
 * other and read as duplicates to a search engine:
 *
 * - "sign PDF online" is what the free signing tool does, so the landing URL
 *   points at the tool rather than being a second page about the same thing;
 * - the DocuSign-alternative variants (free, for small businesses) are
 *   sections of one page, not three near-identical pages;
 * - "PDF signing software" and "cheap e-signature software" are the same
 *   intents as document signing software and the free e-signature page.
 *
 * The test beside this file checks every destination is a real page and that
 * no redirect points at another redirect (chains cost a crawl hop each).
 * Redirect sources also appear as `aliases` in the destination page's
 * frontmatter, which is what stops someone writing a page for them later.
 */

export type SeoRedirect = { source: string; destination: string }

/**
 * The old /docs section (content/docs, two guides) was replaced by the Help
 * Center at /resources/help (src/lib/help.ts), which covers the same ground
 * in more, shorter guides. Each guide goes to the Help Center guide that
 * answers the same question; anything else under /docs to the Help Center's
 * front page. The pages under src/app/[locale]/(docs) and (public)/docs are
 * left in place, unreachable behind these, so the earlier approach stays
 * readable. Specific entries come before the catch-all: Next.js applies the
 * first match. Spelled out (not imported from lib/help) because this file is
 * loaded by next.config.ts with a relative path.
 */
export const DOCS_REDIRECTS: SeoRedirect[] = [
  { source: "/docs", destination: "/resources/help" },
  { source: "/docs/getting-started", destination: "/resources/help/send-a-document-step-by-step" },
  { source: "/docs/billing-and-plans", destination: "/resources/help/plans-and-what-they-include" },
  { source: "/docs/:path*", destination: "/resources/help" },
]

export const SEO_REDIRECTS: SeoRedirect[] = [
  { source: "/sign-pdf-online", destination: "/sign-pdf" },
  { source: "/docusign-alternative", destination: "/alternatives/docusign" },
  { source: "/free-docusign-alternative", destination: "/alternatives/docusign" },
  { source: "/docusign-alternative-for-small-business", destination: "/alternatives/docusign" },
  { source: "/pdf-signing-software", destination: "/document-signing-software" },
  { source: "/cheap-esignature-software", destination: "/free-esignature" },
  { source: "/e-signature", destination: "/online-esignature" },
  { source: "/electronic-signature", destination: "/online-esignature" },
  // Comparison wording people type, to the one comparison page each.
  // Reversed when the comparisons moved from /compare/{slug} to /vs/{slug}:
  // the /vs/ URLs are now the pages, and the old /compare/ URLs point at them.
  // { source: "/vs/docusign", destination: "/compare/docusign" },
  // { source: "/vs/dropbox-sign", destination: "/compare/dropbox-sign" },
  // { source: "/vs/hellosign", destination: "/compare/dropbox-sign" },
  // { source: "/compare/hellosign", destination: "/compare/dropbox-sign" },
  // { source: "/vs/pandadoc", destination: "/compare/pandadoc" },
  { source: "/compare/docusign", destination: "/vs/docusign" },
  { source: "/compare/dropbox-sign", destination: "/vs/dropbox-sign" },
  { source: "/compare/pandadoc", destination: "/vs/pandadoc" },
  { source: "/vs/hellosign", destination: "/vs/dropbox-sign" },
  { source: "/compare/hellosign", destination: "/vs/dropbox-sign" },
  { source: "/vs/airslate-signnow", destination: "/vs/signnow" },
  // Wording people type for the newer pages, to the one page each.
  { source: "/vs/adobe-sign", destination: "/vs/adobe-acrobat-sign" },
  { source: "/vs/jotform", destination: "/vs/jotform-sign" },
  { source: "/audit-trail", destination: "/esignature-audit-trail" },
  { source: "/collect-payments", destination: "/sign-and-pay" },
  { source: "/contract-management", destination: "/online-contract-management" },
  // Blog and resources are one hub: /resources is the name some people expect.
  { source: "/resources", destination: "/blog" },
  ...DOCS_REDIRECTS,
]

/** In the shape next.config's `redirects()` returns: 301, not Next's default 308. */
export function seoRedirectsForNext() {
  return SEO_REDIRECTS.map((r) => ({ source: r.source, destination: r.destination, statusCode: 301 as const }))
}
