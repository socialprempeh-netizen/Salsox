/**
 * Hashtags for the social agent's drafts, worked out from each post's own
 * words rather than asked of a model: the same post always gets the same
 * tags, they cost nothing, and a topic tag is only used when the post
 * actually talks about its subject. Was for the studio's X and Facebook
 * drafts only; every platform that shows hashtags now has a set (Reddit has
 * none: hashtags read as spam there).
 *
 * Two lists per post:
 *  - contextual: tags for the topics the text mentions (contracts, getting
 *    paid, hiring, real estate, freelancing...), most relevant first;
 *  - evergreen: the niche's standing set (e-signatures, small business,
 *    SaaS and business tools), the tags worth having on any post, chosen
 *    per platform: LinkedIn's audience follows professional tags, TikTok's
 *    discovery runs on its own (#BusinessTok, #SmallBusinessTips).
 *
 * Each platform has its own budget: X counts every character against 280
 * and reads best with one or two tags; LinkedIn and YouTube three (YouTube
 * shows the first three above the title); Facebook and TikTok four. A tag
 * already in the post is never suggested again.
 *
 * The agent no longer asks the model for hashtags: autoHashtags adds this
 * set to every new draft, half topic tags and half evergreen, within the
 * platform's length limit, and the studio's picker edits it from there.
 * Pure, tested in hashtags.test.ts.
 */

/** The platforms whose posts carry hashtags: every one the agent drafts for except Reddit. */
export type HashtagPlatform = "X" | "FACEBOOK" | "LINKEDIN" | "TIKTOK" | "YOUTUBE"

export const isHashtagPlatform = (platform: string): platform is HashtagPlatform => platform in HASHTAG_BUDGET

/** The niche's standing tags, most useful first: X's and Facebook's set. */
export const EVERGREEN_HASHTAGS = ["#esignature", "#SmallBusiness", "#SaaS", "#BusinessTools", "#Productivity", "#DigitalSignature", "#Paperless", "#Entrepreneur", "#SmallBusinessOwner", "#Startup"] as const

/** Each platform's standing set, most useful first. */
export const EVERGREEN_BY_PLATFORM: Record<HashtagPlatform, readonly string[]> = {
  X: EVERGREEN_HASHTAGS,
  FACEBOOK: EVERGREEN_HASHTAGS,
  LINKEDIN: ["#esignature", "#SmallBusiness", "#Productivity", "#DigitalTransformation", "#Entrepreneurship", "#FutureOfWork", "#LegalTech", "#SalesTips"],
  TIKTOK: ["#SmallBusinessTips", "#BusinessTok", "#esignature", "#EntrepreneurTips", "#SmallBusiness", "#SideHustle", "#Productivity", "#Freelancer"],
  YOUTUBE: ["#esignature", "#SmallBusinessTips", "#Productivity", "#HowTo", "#DigitalSignature", "#SmallBusiness"],
}

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
export const HASHTAG_BUDGET: Record<HashtagPlatform, { contextual: number; evergreen: number; total: number }> = {
  X: { contextual: 3, evergreen: 3, total: 2 },
  FACEBOOK: { contextual: 5, evergreen: 5, total: 4 },
  LINKEDIN: { contextual: 4, evergreen: 4, total: 3 },
  TIKTOK: { contextual: 5, evergreen: 5, total: 4 },
  YOUTUBE: { contextual: 4, evergreen: 4, total: 3 },
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
export function suggestHashtags(platform: HashtagPlatform, text: string): HashtagSuggestions {
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
  const evergreen = take(EVERGREEN_BY_PLATFORM[platform], budget.evergreen)
  return { contextual, evergreen, recommended: Math.max(0, budget.total - present.size) }
}

/**
 * The post with a tag added at the end (on its own line on Facebook,
 * LinkedIn, TikTok and YouTube, after a space on X), or removed if it is
 * already there.
 */
export function toggleHashtag(platform: HashtagPlatform, text: string, tag: string): string {
  const k = key(tag)
  if (hashtagsIn(text).has(k)) {
    return text
      .replace(new RegExp(`(^|\\s)#${k}(?=\\s|$)`, "giu"), "")
      .replace(/[ \t]+$/gm, "")
      .replace(/\n{3,}/g, "\n\n")
      .trimEnd()
  }
  const body = text.trimEnd()
  // Everywhere but X, tags gather on a last line of their own; on X they follow the sentence.
  const lastLine = body.split("\n").at(-1) ?? ""
  const tagsLine = /^(\s*#[\p{L}\p{N}_]+)+\s*$/u.test(lastLine)
  if (platform !== "X") return tagsLine ? `${body} ${tag}` : `${body}\n\n${tag}`
  return `${body} ${tag}`
}

/**
 * The agent's own pick for a new draft: `text` with tags added up to the
 * platform's budget (less any it already has), topic tags for about half and
 * evergreen ones for the rest, either list filling in when the other runs
 * short. A tag that would take the text past `limit` is skipped. `context`
 * is what the topics are read from, when the tags go somewhere other than
 * the words (YouTube's go in the description; the topics are in the title
 * and caption too).
 */
export function autoHashtags(platform: HashtagPlatform, text: string, limit: number, context = text): string {
  const present = hashtagsIn(text)
  const total = HASHTAG_BUDGET[platform].total - present.size
  if (total <= 0) return text
  // The tags already there go along, so they are not suggested again.
  const { contextual, evergreen } = suggestHashtags(platform, `${context}\n${[...present].map((t) => `#${t}`).join(" ")}`)
  const fromTopics = Math.min(contextual.length, Math.ceil(total / 2))
  const picked = [...contextual.slice(0, fromTopics), ...evergreen.slice(0, total - fromTopics)]
  // Too few evergreen tags left: the remaining topic tags fill in.
  for (const tag of contextual.slice(fromTopics)) if (picked.length < total) picked.push(tag)
  let out = text
  for (const tag of picked) {
    const next = toggleHashtag(platform, out, tag)
    if (next.length <= limit) out = next
  }
  return out
}
