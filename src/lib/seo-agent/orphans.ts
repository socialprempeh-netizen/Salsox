/**
 * Orphan pages: pages in the sitemap that no other page links to. Search
 * engines find a page mostly through links, and one reachable only from the
 * sitemap is treated as unimportant, so the weekly crawl lists them for a
 * person to fix. Nothing is edited automatically.
 *
 * Pure: given each crawled page's internal links (pathnames), it counts links
 * in. A page linking to itself does not count, and the home page is never an
 * orphan (it is where every visit starts).
 */

export type CrawledPage = { path: string; internalLinks: string[] }

const clean = (path: string) => (path.replace(/[?#].*$/, "").replace(/\/$/, "") || "/")

/** Links in to every crawled page, from the other crawled pages. */
export function inboundCounts(pages: CrawledPage[]): Map<string, number> {
  const counts = new Map(pages.map((p) => [clean(p.path), 0]))
  for (const page of pages) {
    const from = clean(page.path)
    for (const target of new Set(page.internalLinks.map(clean))) {
      if (target !== from && counts.has(target)) counts.set(target, counts.get(target)! + 1)
    }
  }
  return counts
}

/** Crawled pages with no link in, sorted. */
export function findOrphans(pages: CrawledPage[]): string[] {
  return [...inboundCounts(pages)]
    .filter(([path, count]) => count === 0 && path !== "/")
    .map(([path]) => path)
    .sort()
}
