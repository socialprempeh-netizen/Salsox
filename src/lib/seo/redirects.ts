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
  { source: "/vs/docusign", destination: "/compare/docusign" },
  { source: "/vs/dropbox-sign", destination: "/compare/dropbox-sign" },
  { source: "/vs/hellosign", destination: "/compare/dropbox-sign" },
  { source: "/compare/hellosign", destination: "/compare/dropbox-sign" },
  { source: "/vs/pandadoc", destination: "/compare/pandadoc" },
  // Blog and resources are one hub: /resources is the name some people expect.
  { source: "/resources", destination: "/blog" },
]

/** In the shape next.config's `redirects()` returns: 301, not Next's default 308. */
export function seoRedirectsForNext() {
  return SEO_REDIRECTS.map((r) => ({ source: r.source, destination: r.destination, statusCode: 301 as const }))
}
