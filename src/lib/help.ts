import fs from "node:fs"
import path from "node:path"
import matter from "gray-matter"

/**
 * The Help Center (/resources/help): step-by-step articles and video
 * recording scripts, as Markdown files.
 *
 * - content/help/articles/<slug>.md is one article. Frontmatter: `title`,
 *   `description` (one sentence, also the meta description), `category` (one
 *   of HELP_CATEGORIES) and `order` within the category. The body is plain
 *   Markdown and has at least one numbered list: the steps.
 * - content/help/videos/<category>.md is the recording script for that
 *   category's tutorial. Frontmatter: `title`, `summary`, `minutes` (the
 *   expected running time). Once a video exists, `video:` takes its URL and
 *   the card plays it instead of showing "Coming soon"; the script stays.
 *
 * Writing an article is a commit, like a blog post. help.test.ts checks every
 * file: a known category, numbered steps, a description short enough for
 * search results, and internal links that lead somewhere.
 *
 * Category names and blurbs are interface text, so they live in the message
 * file (`help.categories.<id>`); this file only fixes their order.
 */

export const HELP_CATEGORIES = [
  "getting-started",
  "sending",
  "fields-and-signing",
  "templates",
  "sign-and-pay",
  "account-and-billing",
  "security",
  // Webhooks and the API, for connecting other software.
  "developers",
  "troubleshooting",
] as const

export type HelpCategory = (typeof HELP_CATEGORIES)[number]

export type HelpArticle = {
  slug: string
  title: string
  description: string
  category: HelpCategory
  order: number
  content: string
  /** How many numbered steps the article has, for its card. */
  steps: number
}

export type VideoScript = {
  category: HelpCategory
  title: string
  summary: string
  minutes: number
  /** The finished video's URL, once recorded. Absent: "Coming soon". */
  video?: string
  content: string
}

export const HELP_PATH = "/resources/help"
export const helpArticlePath = (slug: string) => `${HELP_PATH}/${slug}`
export const HELP_VIDEOS_PATH = `${HELP_PATH}/videos`

const ROOT = path.join(process.cwd(), "content", "help")

const isCategory = (value: unknown): value is HelpCategory => HELP_CATEGORIES.includes(value as HelpCategory)

/** Top-level numbered list items ("1. Do this"), the article's steps. */
export function countSteps(markdown: string): number {
  return markdown.split("\n").filter((line) => /^\d+\.\s+\S/.test(line)).length
}

/** Reads one article file's text. Throws on a missing or wrong field, so a bad file fails the build. */
export function parseArticle(slug: string, raw: string): HelpArticle {
  const { data, content } = matter(raw)
  const problems: string[] = []
  if (typeof data.title !== "string" || !data.title.trim()) problems.push("title")
  if (typeof data.description !== "string" || !data.description.trim()) problems.push("description")
  if (!isCategory(data.category)) problems.push(`category (${String(data.category)})`)
  if (typeof data.order !== "number") problems.push("order")
  if (problems.length) throw new Error(`content/help/articles/${slug}.md: missing or invalid ${problems.join(", ")}`)
  return { slug, title: data.title, description: data.description, category: data.category, order: data.order, content, steps: countSteps(content) }
}

/** Reads one video script file's text. Throws on a missing or wrong field. */
export function parseVideoScript(category: string, raw: string): VideoScript {
  const { data, content } = matter(raw)
  if (!isCategory(category)) throw new Error(`content/help/videos/${category}.md: not a help category`)
  const problems: string[] = []
  if (typeof data.title !== "string" || !data.title.trim()) problems.push("title")
  if (typeof data.summary !== "string" || !data.summary.trim()) problems.push("summary")
  if (typeof data.minutes !== "number") problems.push("minutes")
  if (data.video !== undefined && typeof data.video !== "string") problems.push("video")
  if (problems.length) throw new Error(`content/help/videos/${category}.md: missing or invalid ${problems.join(", ")}`)
  return { category, title: data.title, summary: data.summary, minutes: data.minutes, video: data.video || undefined, content }
}

function markdownFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir).filter((f) => f.endsWith(".md"))
}

/** Every article, by category order and then by `order`. */
export function getHelpArticles(): HelpArticle[] {
  const dir = path.join(ROOT, "articles")
  return markdownFiles(dir)
    .map((f) => parseArticle(f.replace(/\.md$/, ""), fs.readFileSync(path.join(dir, f), "utf8")))
    .sort((a, b) => HELP_CATEGORIES.indexOf(a.category) - HELP_CATEGORIES.indexOf(b.category) || a.order - b.order || a.slug.localeCompare(b.slug))
}

export function getHelpArticle(slug: string): HelpArticle | undefined {
  return getHelpArticles().find((a) => a.slug === slug)
}

/** The articles grouped by category, in category order. Empty categories are kept, so every one can be checked. */
export function helpByCategory(articles = getHelpArticles()): { category: HelpCategory; articles: HelpArticle[] }[] {
  return HELP_CATEGORIES.map((category) => ({ category, articles: articles.filter((a) => a.category === category) }))
}

/** One script per category, in category order. */
export function getVideoScripts(): VideoScript[] {
  const dir = path.join(ROOT, "videos")
  return markdownFiles(dir)
    .map((f) => parseVideoScript(f.replace(/\.md$/, ""), fs.readFileSync(path.join(dir, f), "utf8")))
    .sort((a, b) => HELP_CATEGORIES.indexOf(a.category) - HELP_CATEGORIES.indexOf(b.category))
}

/** The articles before and after this one in reading order, for the article footer. */
export function neighbours(slug: string, articles = getHelpArticles()): { previous?: HelpArticle; next?: HelpArticle } {
  const i = articles.findIndex((a) => a.slug === slug)
  if (i < 0) return {}
  return { previous: articles[i - 1], next: articles[i + 1] }
}

/** Internal links (`](/path)`) in a piece of Markdown, without anchors. */
export function internalLinks(markdown: string): string[] {
  return [...markdown.matchAll(/\]\((\/[^)\s#]*)(?:#[^)]*)?\)/g)].map((m) => m[1])
}
