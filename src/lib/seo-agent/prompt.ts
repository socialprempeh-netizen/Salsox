/**
 * The prompts the SEO agent sends to Claude, built from data and nothing else
 * so they are tested (prompt.test.ts) and stable: the system prompt does not
 * change between runs, which lets the API cache it.
 *
 * Two jobs:
 *  - writing an article for one keyword, in the voice of one or two existing
 *    posts given as style references;
 *  - writing one sentence for each busy page that will link to a newly
 *    published article, and choosing the paragraph it follows.
 */
import { keywordTokens } from "./dedupe"
import type { Opportunity } from "./opportunities"

/** A page the article may link to, with what it is, so links are chosen on meaning. */
export type SitePath = { path: string; name: string; description: string }

/** An existing post shown to the writer as an example of the house style. */
export type StyleReference = { title: string; markdown: string; words: number; keyword?: string; hasFaq: boolean }

export type ArticleBrief = {
  siteName: string
  /** A paragraph on what the product is and does, the only product facts the writer may state. */
  productSummary: string
  keyword: string
  opportunity: Pick<Opportunity, "impressions" | "position" | "page">
  categories: string[]
  paths: SitePath[]
  references: StyleReference[]
  /** Why a previous attempt was rejected, when this is a second attempt. */
  feedback?: string[]
}

/**
 * The one or two best examples for a keyword: substantial posts with an FAQ,
 * the most topically related first (shared words with the keyword and its
 * title), then the longest.
 */
export function chooseStyleReferences(keyword: string, posts: StyleReference[], count = 2): StyleReference[] {
  const target = keywordTokens(keyword)
  const overlap = (post: StyleReference) => {
    const words = keywordTokens(`${post.title} ${post.keyword ?? ""}`)
    let n = 0
    for (const w of target) if (words.has(w)) n++
    return n
  }
  const solid = posts.filter((p) => p.hasFaq && p.words >= 900)
  return (solid.length >= count ? solid : posts)
    .map((post) => ({ post, overlap: overlap(post) }))
    .sort((a, b) => b.overlap - a.overlap || b.post.words - a.post.words || a.post.title.localeCompare(b.post.title))
    .slice(0, count)
    .map(({ post }) => post)
}

export function articleSystemPrompt(siteName: string): string {
  return `You write articles for the blog of ${siteName}. Each article answers one search query people type into Google, and it must be the most useful page on the web for that query, for readers and for answer engines that quote it.

How the article is built:
- Open with two or three sentences that answer the query directly, before any background. Someone who reads only that opening should have their answer.
- Then three to seven sections, each under an H2 (\`## \`) phrased the way a person would ask or search for it. Use H3s inside a section only when it has distinct parts.
- Short paragraphs. Numbered steps for procedures, bullet lists for options, and a Markdown table when comparing things on the same attributes.
- 1,000 to 1,600 words of body text.
- Do not write an H1 (the page shows the title as its heading) or an FAQ section (the FAQ is rendered from the separate faq list you return).
- Return 3 to 6 FAQ entries: real follow-up questions that the body does not already answer in the same words, each answered in two to four plain sentences that stand on their own.

Truthfulness:
- State only what is generally true and verifiable. Never invent statistics, studies, quotes, prices, laws, dates or customer stories. When something varies (by country, by provider), say so instead of picking one answer.
- The product facts you are given are the only things you may say about ${siteName}. Mention it where it genuinely helps with the task the reader has, at most two or three times, never as a sales pitch, and never claim a feature that is not in those facts.
- Legal topics are general information, not legal advice; say so once where it matters.

Links:
- Link on-site only to paths from the list you are given, written as root-relative Markdown links such as [Sign PDF](/sign-pdf). Use two to five of them in the body where they help the reader take the next step. Never invent a path.
- In \`related\`, return two or three paths from the same list that a reader should go to next.

Voice: follow the style references. Plain, specific, calm, written to one reader as "you". No hype, no filler intros ("In today's digital world"), no exclamation marks, no emoji. British or American spelling, whichever the references use.

Metadata:
- title: 20 to 70 characters, containing the query or its natural wording, and specific about what the reader gets.
- description: 70 to 160 characters, one or two sentences saying what the article answers.
- category: exactly one of the existing categories you are given.`
}

const asList = (paths: SitePath[]) => paths.map((p) => `- ${p.path}: ${p.name}. ${p.description}`).join("\n")

export function articleUserPrompt(brief: ArticleBrief): string {
  const references = brief.references
    .map((r, i) => `<style_reference index="${i + 1}" title="${r.title.replace(/"/g, "'")}">\n${r.markdown.trim()}\n</style_reference>`)
    .join("\n\n")
  const ranking = brief.opportunity.page
    ? `It currently shows at an average position of ${brief.opportunity.position.toFixed(1)} (page ${Math.ceil(brief.opportunity.position / 10)}), from ${brief.opportunity.page}, with ${brief.opportunity.impressions} impressions in 90 days and almost no clicks. Write the dedicated page that answers it fully.`
    : `It has ${brief.opportunity.impressions} impressions in 90 days and almost no clicks.`
  return `<product_facts>
${brief.productSummary.trim()}
</product_facts>

<existing_categories>
${brief.categories.join("\n")}
</existing_categories>

<site_paths>
${asList(brief.paths)}
</site_paths>

${references}

Write the article for the search query "${brief.keyword}". ${ranking}${
    brief.feedback?.length ? `\n\nA previous attempt was rejected for these reasons; fix every one:\n${brief.feedback.map((f) => `- ${f}`).join("\n")}` : ""
  }`
}

export type LinkSourceBrief = {
  path: string
  title: string
  /** The page's prose paragraphs, in order, numbered from 0. */
  paragraphs: string[]
}

export function linkSystemPrompt(siteName: string): string {
  return `You add one internal link from an existing page of the ${siteName} website to a newly published article. For each page you are given, pick the paragraph the link fits best after, and write one sentence to go after it: natural in that page's voice, adding something for its reader, with exactly one Markdown link to the article whose anchor text describes what the reader will find (never "click here"). One sentence, under 300 characters, no list markers, no headings. The page must still read well with your sentence in it.`
}

export function linkUserPrompt({ article, sources }: { article: { title: string; description: string; href: string }; sources: LinkSourceBrief[] }): string {
  const pages = sources
    .map((s) => {
      // The first 30 paragraphs are enough to find a place, and keep the prompt short.
      const numbered = s.paragraphs.slice(0, 30).map((p, i) => `[${i}] ${p.replace(/\s+/g, " ").slice(0, 600)}`).join("\n")
      return `<page path="${s.path}" title="${s.title.replace(/"/g, "'")}">\n${numbered}\n</page>`
    })
    .join("\n\n")
  return `<article href="${article.href}">
${article.title}: ${article.description}
</article>

${pages}

Return one entry per page, with its path, the number of the paragraph to follow, and the sentence linking to ${article.href}.`
}
