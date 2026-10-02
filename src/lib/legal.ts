import fs from "node:fs"
import path from "node:path"
import matter from "gray-matter"

/**
 * The legal pages (/privacy, /terms, /cookies), read from content/legal/.
 *
 * They were placeholder templates written into the page components, with a
 * box saying so. The text is now Markdown beside the docs and the blog, so it
 * can be edited and reviewed as a document, and the three pages share one
 * renderer (components/legal/legal-document.tsx).
 *
 * IMPORTANT: the current text was drafted with AI assistance and has not been
 * reviewed by a lawyer. It is not legal advice. Have it reviewed for the
 * jurisdictions Salsox operates in before relying on it, then update
 * `reviewed` in each file's frontmatter.
 */

export type LegalSlug = "privacy" | "terms" | "cookies"

export type LegalDocument = {
  slug: LegalSlug
  title: string
  description: string
  /** ISO date the text last changed. */
  updated: string
  /** False until a lawyer has reviewed this text. */
  reviewed: boolean
  content: string
}

const DIR = path.join(process.cwd(), "content", "legal")

export function getLegalDocument(slug: LegalSlug): LegalDocument {
  const raw = fs.readFileSync(path.join(DIR, `${slug}.md`), "utf8")
  const { data, content } = matter(raw)
  for (const field of ["title", "description", "updated"] as const) {
    if (!data[field]) throw new Error(`content/legal/${slug}.md: missing "${field}" in frontmatter`)
  }
  const updated = data.updated instanceof Date ? data.updated.toISOString().slice(0, 10) : String(data.updated)
  return {
    slug,
    title: String(data.title),
    description: String(data.description),
    updated,
    reviewed: data.reviewed === true,
    // The reviewer notes at the top of each file are HTML comments, and the
    // Markdown renderer escapes HTML instead of dropping it: strip them so
    // they never reach the page.
    content: content.replace(/<!--[\s\S]*?-->/g, "").trim(),
  }
}
