/**
 * Which public pages to suggest at the end of another one.
 *
 * Internal links are how a crawler finds a page and how it judges which pages
 * matter, and the nav and footer only go so far: they link everything to
 * everything, equally. A short "keep exploring" block at the end of a page
 * says which neighbours are actually related, and gives a reader who finished
 * the page somewhere to go other than the back button.
 *
 * The rule lives here as data and a function, so the component only renders:
 * each page lists its neighbours in order of relevance, and the page itself is
 * never among them.
 */
export type RelatedKey = "pricing" | "docs" | "blog" | "about" | "contact" | "changelog"

export const RELATED_HREF: Record<RelatedKey, string> = {
  pricing: "/pricing",
  docs: "/docs",
  blog: "/blog",
  about: "/about",
  contact: "/contact",
  changelog: "/changelog",
}

/** Neighbours per page, most relevant first. Unknown paths get the default. */
const NEIGHBOURS: Record<string, RelatedKey[]> = {
  "/about": ["pricing", "docs", "contact", "blog"],
  "/contact": ["docs", "pricing", "about", "blog"],
  "/changelog": ["blog", "docs", "pricing", "about"],
  "/blog": ["docs", "pricing", "changelog", "about"],
  "/docs": ["pricing", "blog", "contact", "changelog"],
}

const DEFAULT: RelatedKey[] = ["pricing", "docs", "blog", "contact"]

export function relatedPagesFor(path: string, limit = 3): { key: RelatedKey; href: string }[] {
  const keys = NEIGHBOURS[path] ?? DEFAULT
  return keys
    .filter((key) => RELATED_HREF[key] !== path)
    .slice(0, limit)
    .map((key) => ({ key, href: RELATED_HREF[key] }))
}
