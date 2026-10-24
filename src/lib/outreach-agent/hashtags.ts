/**
 * Hashtag suggestions for the social studio's X and Facebook drafts, worked
 * out from each post's own words rather than asked of a model: the same post
 * always gets the same suggestions, they cost nothing, and a tag is only
 * suggested when the post actually talks about its subject.
 *
 * Two lists per post:
 *  - contextual: tags for the topics the text mentions (contracts, getting
 *    paid, hiring, real estate, freelancing...), most relevant first;
 *  - evergreen: the niche's standing set (e-signatures, small business,
 *    SaaS and business tools), the tags worth having on any post.
 *
 * Each platform has its own budget: X counts every character against 280
 * and reads best with one or two tags; Facebook takes a few. A tag already
 * in the post is never suggested again. Pure, tested in hashtags.test.ts.
 */

/** The niche's standing tags, most useful first. */
export const EVERGREEN_HASHTAGS = ["#esignature", "#SmallBusiness", "#SaaS", "#BusinessTools", "#Productivity", "#DigitalSignature", "#Paperless", "#Entrepreneur", "#SmallBusinessOwner", "#Startup"] as const

/** A topic: the words that mean the post is about it, and the tags it earns. */
type Topic = { match: RegExp; tags: string[] }

const TOPICS: Topic[] = [
  { match: /\b(contracts?|agreements?|sign(ed|s|ing)?|signatures?)\b/i, tags: ["#Contracts", "#eSign"] },
  { match: /\b(pay(ment|ments|ing|s)?|paid|deposits?|invoices?|invoicing|get(ting)? paid|cash ?flow)\b/i, tags: ["#GetPaid", "#Invoicing", "#CashFlow"] },
  { match: /\b(mobile money|m-?pesa|momo)\b/i, tags: ["#MobileMoney"] },
  { match: /\b(phones?|mobile|smartphones?|on the go)\b/i, tags: ["#MobileFirst"] },
  { match: /\bwhats ?app\b/i, tags: ["#WhatsAppBusiness"] },
  { match: /\b(freelanc(e|er|ers|ing)|solopreneurs?|self-employed)\b/i, tags: ["#Freelancer", "#FreelanceLife"] },
  { match: /\b(clients?|customers?)\b/i, tags: ["#ClientExperience"] },
  { match: /\b(hir(e|es|ing)|offer letters?|onboard(ing)?|employees?|staff|hr)\b/i, tags: ["#HR", "#Hiring"] },
  { match: /\b(real estate|leases?|landlords?|tenants?|rentals?|property)\b/i, tags: ["#RealEstate", "#PropertyManagement"] },
  { match: /\b(nda|non-?disclosure)\b/i, tags: ["#NDA"] },
  { match: /\b(pdfs?)\b/i, tags: ["#PDF"] },
  { match: /\b(templates?)\b/i, tags: ["#Templates"] },
  { match: /\b(remote|distributed team|work from home)\b/i, tags: ["#RemoteWork"] },
  { match: /\b(workflows?|automat(e|ed|ion)|save time|hours)\b/i, tags: ["#Workflow", "#Automation"] },
  { match: /\b(audit trail|secure|security|tamper|verify|verification|legal(ly)?|binding|compliance)\b/i, tags: ["#Compliance", "#LegalTech"] },
  { match: /\b(sales|deals?|proposals?|quotes?|close)\b/i, tags: ["#Sales", "#Proposals"] },
  { match: /\b(agency|agencies|consultants?|consulting)\b/i, tags: ["#Agency", "#Consulting"] },
  { match: /\b(startups?|founders?)\b/i, tags: ["#Startup", "#Founders"] },
]

/** How many tags each platform reads best with, in total and from each list. */
export const HASHTAG_BUDGET: Record<"X" | "FACEBOOK", { contextual: number; evergreen: number; total: number }> = {
  X: { contextual: 3, evergreen: 3, total: 2 },
  FACEBOOK: { contextual: 5, evergreen: 5, total: 4 },
}

const key = (tag: string) => tag.replace(/^#/, "").toLowerCase()

/** The hashtags already in a post's text, lower-cased without the #. */
export function hashtagsIn(text: string): Set<string> {
  return new Set([...text.matchAll(/(^|\s)#([\p{L}\p{N}_]+)/gu)].map((m) => m[2].toLowerCase()))
}

export type HashtagSuggestions = { contextual: string[]; evergreen: string[]; recommended: number }

/**
 * Suggestions for one post: topic tags in order of how often the post
 * mentions each topic, then the evergreen set, neither repeating a tag the
 * post already has or the other list already offers. `recommended` is how
 * many to add in all, for the platform.
 */
export function suggestHashtags(platform: "X" | "FACEBOOK", text: string): HashtagSuggestions {
  const budget = HASHTAG_BUDGET[platform]
  const present = hashtagsIn(text)
  // Hashtags themselves are not prose: "#Contracts" must not count as mentioning contracts.
  const prose = text.replace(/(^|\s)#[\p{L}\p{N}_]+/gu, " ")
  const scored = TOPICS.map((topic, order) => ({ topic, order, hits: [...prose.matchAll(new RegExp(topic.match.source, "gi"))].length }))
    .filter((t) => t.hits > 0)
    .sort((a, b) => b.hits - a.hits || a.order - b.order)
  const seen = new Set(present)
  const take = (tags: readonly string[], limit: number) => {
    const out: string[] = []
    for (const tag of tags) {
      if (out.length >= limit) break
      if (seen.has(key(tag))) continue
      seen.add(key(tag))
      out.push(tag)
    }
    return out
  }
  const contextual = take(scored.flatMap((t) => t.topic.tags), budget.contextual)
  const evergreen = take(EVERGREEN_HASHTAGS, budget.evergreen)
  return { contextual, evergreen, recommended: Math.max(0, budget.total - present.size) }
}

/**
 * The post with a tag added at the end (on its own line on Facebook, after a
 * space on X), or removed if it is already there.
 */
export function toggleHashtag(platform: "X" | "FACEBOOK", text: string, tag: string): string {
  const k = key(tag)
  if (hashtagsIn(text).has(k)) {
    return text
      .replace(new RegExp(`(^|\\s)#${k}(?=\\s|$)`, "giu"), "")
      .replace(/[ \t]+$/gm, "")
      .replace(/\n{3,}/g, "\n\n")
      .trimEnd()
  }
  const body = text.trimEnd()
  // Facebook: tags gather on a last line of their own; X: they follow the sentence.
  const lastLine = body.split("\n").at(-1) ?? ""
  const tagsLine = /^(\s*#[\p{L}\p{N}_]+)+\s*$/u.test(lastLine)
  if (platform === "FACEBOOK") return tagsLine ? `${body} ${tag}` : `${body}\n\n${tag}`
  return `${body} ${tag}`
}
