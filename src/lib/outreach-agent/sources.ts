/**
 * Where the Hunter looks for pain signals: the review pages of each
 * competitor on G2, Capterra and Trustpilot (low ratings are picked out after
 * the page is read), and the Reddit searches, in chosen communities, for
 * posts and comments about a tool's pricing, limits or support, or about
 * leaving it, and the same on Hacker News (hackernews.ts) and X (x.ts). Public complaints about a named tool only: never people
 * directories or profile pages.
 *
 * Review URLs are the sites' own public listing pages, as of October 2026. A
 * site that moves a page shows up in the run log as a failed fetch for that
 * source, not as a crash; update the slug or id here.
 */

export const REVIEW_SOURCES = ["g2", "capterra", "trustpilot"] as const
export type ReviewSource = (typeof REVIEW_SOURCES)[number]
export type LeadSource = ReviewSource | "reddit" | "hackernews" | "x"
/** The sources whose leads come from a post or comment rather than a review page. */
export type ForumSource = Exclude<LeadSource, ReviewSource>

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

// Was redditQueries(competitors): two site-wide searches per competitor
// ("alternative", "expensive"), all four competitors. Replaced by the
// subreddit-scoped pain-topic searches below, which also cover limits and
// support, and by reading comments as well as posts.
// export function redditQueries(competitors: Competitor[] = COMPETITORS): { competitor: Competitor; query: string }[] {
//   return competitors.flatMap((competitor) => [
//     { competitor, query: `"${competitor.name}" alternative` },
//     { competitor, query: `"${competitor.name}" (expensive OR "too expensive" OR "price increase")` },
//   ])
// }

/** The tools searched for on Reddit and Hacker News: the three whose users most often ask for a way out. */
export const FORUM_COMPETITORS: Competitor[] = COMPETITORS.filter((c) => ["docusign", "pandadoc", "dropbox-sign"].includes(c.id))
/** The same list, under the name the Reddit searches were written with. */
export const REDDIT_COMPETITORS = FORUM_COMPETITORS

/**
 * Where people who send contracts, quotes and agreements talk shop: small
 * businesses, freelancers, agents and the people who run their software.
 * Searched together as one multireddit, so this is one request per query.
 * Communities about personal legal trouble are left out on purpose.
 */
export const REDDIT_SUBREDDITS = [
  "smallbusiness",
  "Entrepreneur",
  "startups",
  "SaaS",
  "freelance",
  "consulting",
  "realtors",
  "RealEstate",
  "propertymanagement",
  "Contractor",
  "sales",
  "Accounting",
  "Bookkeeping",
  "LawFirm",
  "nonprofit",
  "sysadmin",
  "msp",
] as const

/**
 * The pain points searched for, and the words that mark them. Support is
 * searched too, but the fix catalogue (fixes.ts) has nothing to say about
 * someone else's support desk, so a complaint only about support is set
 * aside at extraction like any other "other".
 */
export const PAIN_TOPICS = {
  pricing: ["expensive", "pricing", "price increase", "overpriced", "cost", "renewal", "per seat", "cancel"],
  limits: ["limit", "envelope", "quota", "cap", "ran out", "allowance"],
  support: ["support", "customer service", "no response", "locked out"],
  leaving: ["alternative", "switch from", "moving away", "replace"],
} as const
export type PainTopic = keyof typeof PAIN_TOPICS

const searchTerm = (word: string) => (word.includes(" ") ? `"${word}"` : word)

/** Reddit searches: each competitor once per pain topic, inside REDDIT_SUBREDDITS. */
export function redditQueries(competitors: Competitor[] = REDDIT_COMPETITORS): { competitor: Competitor; topic: PainTopic; query: string }[] {
  return competitors.flatMap((competitor) =>
    (Object.keys(PAIN_TOPICS) as PainTopic[]).map((topic) => ({ competitor, topic, query: `"${competitor.name}" (${PAIN_TOPICS[topic].map(searchTerm).join(" OR ")})` }))
  )
}

/** Which pain topics a piece of text touches, by whole word (plurals and past tenses too). Used to pick out comments worth reading. */
export function painIn(text: string): PainTopic[] {
  const lower = text.toLowerCase()
  return (Object.keys(PAIN_TOPICS) as PainTopic[]).filter((topic) => PAIN_TOPICS[topic].some((word) => new RegExp(`\\b${word}(s|es|d|ed|led|ing|ling)?\\b`).test(lower)))
}

/** Which competitor a piece of text is about, by name; null when it names none or several. */
export function competitorIn(text: string, competitors: Competitor[] = COMPETITORS): Competitor | null {
  const lower = text.toLowerCase()
  const named = competitors.filter((c) => lower.includes(c.name.toLowerCase()) || (c.id === "dropbox-sign" && /hellosign|dropboxsign/.test(lower)) || (c.id === "adobe-sign" && /adobe sign|acrobat sign/.test(lower)))
  return named.length === 1 ? named[0] : null
}
