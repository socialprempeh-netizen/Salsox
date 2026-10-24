/**
 * Orphan Page Scanner: the scanning rules, as pure functions with no browser
 * or extension APIs, so they run the same in the popup and in the tests
 * (src/lib/orphan-scanner.test.ts).
 *
 * An orphan page is one the site lists in its sitemap but that no other page
 * of the site links to: search engines find it only through the sitemap, and
 * treat it as unimportant. The scanner reads the sitemap (found through
 * robots.txt, or /sitemap.xml), fetches every listed page, collects each
 * page's links to the same site, and reports the listed pages nothing links
 * to.
 *
 * Written for this extension; it shares no code with any other extension.
 */

/** Query parameters that only track a visit and never make a different page. */
const TRACKING = /^(utm_[a-z]+|gclid|fbclid|msclkid|mc_cid|mc_eid|ref)$/i

/** File types that are not pages, so links to them are not page links. */
const NOT_A_PAGE = /\.(pdf|jpe?g|png|gif|webp|avif|svg|ico|css|js|mjs|json|xml|txt|zip|gz|mp4|webm|mp3|woff2?|ttf)$/i

/**
 * One canonical form for a URL on `origin`, or null for anything that is not
 * a page of that site: another host, a non-http scheme, a file. The hash is
 * dropped, tracking parameters removed, the rest sorted, and a trailing slash
 * removed except on the root.
 */
export function normalizeUrl(href, base, origin) {
  let url
  try {
    url = new URL(href, base)
  } catch {
    return null
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null
  if (url.origin !== origin) return null
  if (NOT_A_PAGE.test(url.pathname)) return null
  url.hash = ""
  const params = [...url.searchParams.entries()].filter(([k]) => !TRACKING.test(k)).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  url.search = params.length ? `?${new URLSearchParams(params).toString()}` : ""
  let path = url.pathname.replace(/\/{2,}/g, "/")
  if (path.length > 1) path = path.replace(/\/+$/, "")
  return `${url.origin}${path}${url.search}`
}

/** The sitemap addresses robots.txt names (its "Sitemap:" lines). */
export function sitemapsFromRobots(text) {
  return [...String(text).matchAll(/^\s*sitemap\s*:\s*(\S+)/gim)].map((m) => m[1])
}

const decodeXml = (s) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").trim()

/**
 * A sitemap's contents: the pages it lists, and the further sitemaps a
 * sitemap index points to. Reads <loc> inside <url> and inside <sitemap>.
 */
export function parseSitemap(xml) {
  const text = String(xml)
  const pages = [...text.matchAll(/<url\b[^>]*>[\s\S]*?<loc\b[^>]*>([\s\S]*?)<\/loc>/gi)].map((m) => decodeXml(m[1].replace(/<!\[CDATA\[|\]\]>/g, "")))
  const sitemaps = [...text.matchAll(/<sitemap\b[^>]*>[\s\S]*?<loc\b[^>]*>([\s\S]*?)<\/loc>/gi)].map((m) => decodeXml(m[1].replace(/<!\[CDATA\[|\]\]>/g, "")))
  return { pages, sitemaps }
}

/**
 * The same-site page links in a page's HTML, normalized, without the page
 * itself. Reads <a href> (and <area href>), honours a <base href>, and
 * skips links inside HTML comments.
 */
export function extractLinks(html, pageUrl, origin) {
  const source = String(html).replace(/<!--[\s\S]*?-->/g, "")
  const baseTag = /<base\b[^>]*\bhref\s*=\s*["']([^"']+)["']/i.exec(source)
  const base = baseTag ? new URL(baseTag[1], pageUrl).href : pageUrl
  const self = normalizeUrl(pageUrl, pageUrl, origin)
  const links = new Set()
  for (const m of source.matchAll(/<(?:a|area)\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
    const href = (m[1] ?? m[2] ?? m[3] ?? "").trim()
    if (!href || href.startsWith("#") || /^(mailto|tel|javascript|data):/i.test(href)) continue
    const url = normalizeUrl(href.replace(/&amp;/g, "&"), base, origin)
    if (url && url !== self) links.add(url)
  }
  return links
}

/**
 * The orphans among the sitemap's pages: those no crawled page links to.
 * `crawled` is every page fetched, with its links. Pages that could not be
 * fetched still count as listed; their own links are simply unknown.
 * Returns the orphans (sorted) and each listed page's inbound link count.
 */
export function findOrphans(listed, crawled) {
  const inbound = new Map(listed.map((url) => [url, 0]))
  for (const page of crawled) {
    for (const link of page.links) {
      if (link !== page.url && inbound.has(link)) inbound.set(link, inbound.get(link) + 1)
    }
  }
  const orphans = [...inbound].filter(([, count]) => count === 0).map(([url]) => url).sort()
  return { orphans, inbound }
}

/** A CSV of the results, for a spreadsheet: one row per listed page. */
export function toCsv(rows) {
  const cell = (v) => {
    const s = String(v ?? "")
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return ["url,inbound_links,status,orphan", ...rows.map((r) => [r.url, r.inbound, r.status, r.orphan ? "yes" : "no"].map(cell).join(","))].join("\n")
}
