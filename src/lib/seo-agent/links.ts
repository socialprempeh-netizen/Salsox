/**
 * Contextual links to a newly published article, from the site's busiest
 * pages: which pages, where in them, and how the sentence is spliced in.
 * Pure, tested in links.test.ts.
 *
 * The source pages are Markdown files in the repository, which a running
 * deployment cannot edit. So a link is stored (src/lib/seo-agent/store.ts)
 * and applied when the page renders: `injectLinks` inserts each stored
 * sentence as its own paragraph after the paragraph it names. Removing the
 * row removes the link, and the file stays exactly as it was written.
 *
 * Only "top-level paragraphs" count as insertion points: prose blocks, never
 * a heading, list, table, quote, code block, image or component. A sentence
 * dropped into a list would break it.
 */
import { keywordTokens } from "./dedupe"

/** A link to insert: the sentence (Markdown, with the link in it) and where. */
export type LinkInsertion = { afterParagraph: number; sentence: string; href: string }

/** Splits Markdown into blocks on blank lines, keeping fenced code blocks whole. */
export function markdownBlocks(markdown: string): string[] {
  const blocks: string[] = []
  let current: string[] = []
  let fenced = false
  for (const line of markdown.replace(/\r\n/g, "\n").split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced
    if (!fenced && line.trim() === "") {
      if (current.length) blocks.push(current.join("\n"))
      current = []
    } else current.push(line)
  }
  if (current.length) blocks.push(current.join("\n"))
  return blocks
}

/** A prose paragraph, the only kind of block a sentence may follow. */
export function isParagraph(block: string): boolean {
  // Indented text is a list item's continuation or code, not a paragraph.
  if (/^\s/.test(block)) return false
  return !/^(#|[-*+]\s|\d+[.)]\s|\||>|```|~~~|<|!\[|\{|import\s|export\s|---)/.test(block)
}

/** The prose paragraphs of a page, in order: what the linker is shown to choose from. */
export function paragraphs(markdown: string): string[] {
  return markdownBlocks(markdown).filter(isParagraph)
}

/** True when the page already links to `href`, so a second link would be noise. */
export function linksTo(markdown: string, href: string): boolean {
  const escaped = href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return new RegExp(`\\]\\(${escaped}/?(?:[#?][^)]*)?\\)`).test(markdown)
}

/**
 * A sentence is usable when it is one short line of prose carrying exactly
 * one Markdown link, and that link is the article.
 */
export function validSentence(sentence: string, href: string): boolean {
  const trimmed = sentence.trim()
  if (!trimmed || trimmed.length > 320 || /\n/.test(trimmed) || /^[#>*\-|]/.test(trimmed)) return false
  const links = [...trimmed.matchAll(/\[([^\]]+)\]\(([^)\s]+)\)/g)]
  return links.length === 1 && links[0][2].replace(/\/$/, "") === href && links[0][1].trim().length >= 3
}

/** A plain sentence for when the writer's suggestion is missing or unusable. */
export function fallbackSentence(title: string, href: string): string {
  return `For a closer look at this, read [${title.replace(/[[\]]/g, "")}](${href}).`
}

/**
 * Where a link fits when no writer chose: the paragraph sharing the most
 * words with the article's keyword, or the first one.
 */
export function bestParagraph(prose: string[], keyword: string): number {
  const target = keywordTokens(keyword)
  let best = 0
  let bestShared = 0
  prose.forEach((p, i) => {
    const words = keywordTokens(p)
    let shared = 0
    for (const w of target) if (words.has(w)) shared++
    if (shared > bestShared) [best, bestShared] = [i, shared]
  })
  return best
}

/**
 * Inserts each link after its paragraph. Insertions for a page the page
 * already links to are skipped, as are invalid ones; a paragraph index past
 * the end lands after the last paragraph. Several on one paragraph keep their
 * order.
 */
export function injectLinks(markdown: string, insertions: LinkInsertion[]): string {
  const usable = insertions.filter((i) => validSentence(i.sentence, i.href) && !linksTo(markdown, i.href))
  if (usable.length === 0) return markdown
  const blocks = markdownBlocks(markdown)
  const paragraphIndexes = blocks.flatMap((block, i) => (isParagraph(block) ? [i] : []))
  if (paragraphIndexes.length === 0) return markdown
  const after = new Map<number, string[]>()
  for (const insertion of usable) {
    const n = Math.min(Math.max(0, Math.trunc(insertion.afterParagraph)), paragraphIndexes.length - 1)
    const blockIndex = paragraphIndexes[n]
    after.set(blockIndex, [...(after.get(blockIndex) ?? []), insertion.sentence.trim()])
  }
  return blocks.flatMap((block, i) => [block, ...(after.get(i) ?? [])]).join("\n\n") + "\n"
}

/**
 * The pages to link from: the busiest pages (`ranked`, most traffic first)
 * that can carry a link, are not the article itself, and do not link to it
 * already. At most `limit`.
 */
export function pickLinkSources<T extends { path: string }>(ranked: string[], eligible: Map<string, T>, { exclude, limit }: { exclude: string; limit: number }): T[] {
  const picked: T[] = []
  const seen = new Set<string>()
  for (const raw of ranked) {
    const path = raw.replace(/\/$/, "") || "/"
    if (path === exclude || seen.has(path)) continue
    seen.add(path)
    const page = eligible.get(path)
    if (page) picked.push(page)
    if (picked.length === limit) break
  }
  return picked
}
