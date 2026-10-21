/**
 * Where the Hunter looks for pain signals: the review pages of each
 * competitor on G2, Capterra and Trustpilot (low ratings are picked out after
 * the page is read), and the Reddit searches for people asking for an
 * alternative. Public complaints about a named tool only: never people
 * directories or profile pages.
 *
 * Review URLs are the sites' own public listing pages, as of October 2026. A
 * site that moves a page shows up in the run log as a failed fetch for that
 * source, not as a crash; update the slug or id here.
 */

export const REVIEW_SOURCES = ["g2", "capterra", "trustpilot"] as const
export type ReviewSource = (typeof REVIEW_SOURCES)[number]
export type LeadSource = ReviewSource | "reddit"

export type Competitor = {
  id: string
  name: string
  /** g2.com/products/<slug>/reviews */
  g2?: string
  /** capterra.com/p/<id>/<slug>/reviews/ */
  capterra?: { id: number; slug: string }
  /** trustpilot.com/review/<domain> */
  trustpilot?: string
}

export const COMPETITORS: Competitor[] = [
  { id: "docusign", name: "DocuSign", g2: "docusign", capterra: { id: 121506, slug: "Docusign" }, trustpilot: "docusign.com" },
  { id: "pandadoc", name: "PandaDoc", g2: "pandadoc", capterra: { id: 131735, slug: "PandaDoc" }, trustpilot: "pandadoc.com" },
  // Capterra lists Dropbox Sign under its old name, HelloSign.
  { id: "dropbox-sign", name: "Dropbox Sign", g2: "dropbox-sign", capterra: { id: 144797, slug: "HelloSign" }, trustpilot: "hellosign.com" },
  // Capterra has no listing for Acrobat Sign on its own (only Acrobat as a
  // whole), so G2 and Trustpilot only.
  { id: "adobe-sign", name: "Adobe Acrobat Sign", g2: "adobe-acrobat-sign", trustpilot: "adobe.com" },
]

export type SourcePage = { source: ReviewSource; competitor: Competitor; url: string }

/** Every review page to read, for the competitors and sources given. */
export function reviewPages(competitors: Competitor[] = COMPETITORS, sources: readonly ReviewSource[] = REVIEW_SOURCES): SourcePage[] {
  const pages: SourcePage[] = []
  for (const competitor of competitors) {
    for (const source of sources) {
      const url =
        source === "g2" && competitor.g2
          ? `https://www.g2.com/products/${competitor.g2}/reviews`
          : source === "capterra" && competitor.capterra
            ? `https://www.capterra.com/p/${competitor.capterra.id}/${competitor.capterra.slug}/reviews/`
            : source === "trustpilot" && competitor.trustpilot
              ? // Trustpilot filters by star in the query string: the lowest two only.
                `https://www.trustpilot.com/review/${competitor.trustpilot}?stars=1&stars=2`
              : null
      if (url) pages.push({ source, competitor, url })
    }
  }
  return pages
}

/** Reddit searches: people asking to leave a tool, or for something cheaper or simpler. */
export function redditQueries(competitors: Competitor[] = COMPETITORS): { competitor: Competitor; query: string }[] {
  return competitors.flatMap((competitor) => [
    { competitor, query: `"${competitor.name}" alternative` },
    { competitor, query: `"${competitor.name}" (expensive OR "too expensive" OR "price increase")` },
  ])
}

/** Which competitor a piece of text is about, by name; null when it names none or several. */
export function competitorIn(text: string, competitors: Competitor[] = COMPETITORS): Competitor | null {
  const lower = text.toLowerCase()
  const named = competitors.filter((c) => lower.includes(c.name.toLowerCase()) || (c.id === "dropbox-sign" && lower.includes("hellosign")) || (c.id === "adobe-sign" && /adobe sign|acrobat sign/.test(lower)))
  return named.length === 1 ? named[0] : null
}
