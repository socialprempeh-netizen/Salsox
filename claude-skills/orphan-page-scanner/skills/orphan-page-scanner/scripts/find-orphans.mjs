#!/usr/bin/env node
/**
 * Orphan Page Scanner, command-line form, for the Claude skill in this
 * folder (see ../SKILL.md). Finds the pages a website's sitemap lists that
 * no other page of the site links to.
 *
 *   node find-orphans.mjs https://example.com [--max 250] [--json] [--csv out.csv]
 *
 * Node 18+ and nothing else: it uses the built-in fetch. It reads the
 * sitemap (robots.txt "Sitemap:" lines, else /sitemap.xml, following sitemap
 * indexes), fetches each listed page four at a time without cookies, and
 * prints the orphans, the pages that did not load, and a summary. --json
 * prints the whole result as JSON for further analysis; --csv writes every
 * page with its inbound link count.
 *
 * The scanning rules are in ./scan.js, the same module the Chrome extension
 * uses (kept identical by a test in the Salsox repository).
 */
import fs from "node:fs"
import { extractLinks, findOrphans, normalizeUrl, parseSitemap, sitemapsFromRobots, toCsv } from "./scan.js"

const CONCURRENCY = 4
const TIMEOUT_MS = 15_000
const MAX_SITEMAPS = 25
const UA = "OrphanPageScanner/1.0 (+https://salsox.com/?utm_source=orphan_scanner_skill)"

function usage(problem) {
  if (problem) console.error(`Error: ${problem}\n`)
  console.error("Usage: node find-orphans.mjs <site-url> [--max 250] [--json] [--csv out.csv]")
  process.exit(problem ? 1 : 0)
}

const args = process.argv.slice(2)
if (args.length === 0 || args.includes("--help") || args.includes("-h")) usage()
const flag = (name) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
let origin
try {
  const url = new URL(args[0].includes("://") ? args[0] : `https://${args[0]}`)
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error()
  origin = url.origin
} catch {
  usage(`"${args[0]}" is not a website address`)
}
const maxPages = Math.min(Math.max(Number(flag("--max") ?? 250) || 250, 1), 5000)
const asJson = args.includes("--json")
const csvPath = flag("--csv")

async function get(url) {
  const response = await fetch(url, { redirect: "follow", headers: { "user-agent": UA, accept: "text/html,application/xml;q=0.9,*/*;q=0.8" }, signal: AbortSignal.timeout(TIMEOUT_MS) })
  return { response, text: response.ok ? await response.text() : "" }
}

async function listedPages() {
  let queue = []
  try {
    const { response, text } = await get(`${origin}/robots.txt`)
    if (response.ok) queue = sitemapsFromRobots(text)
  } catch {
    // No robots.txt: try the usual sitemap address.
  }
  if (queue.length === 0) queue = [`${origin}/sitemap.xml`]
  const seen = new Set()
  const pages = new Set()
  while (queue.length && seen.size < MAX_SITEMAPS && pages.size < maxPages) {
    const sitemap = queue.shift()
    if (seen.has(sitemap)) continue
    seen.add(sitemap)
    try {
      const { response, text } = await get(sitemap)
      if (!response.ok) continue
      const parsed = parseSitemap(text)
      queue.push(...parsed.sitemaps)
      for (const loc of parsed.pages) {
        const url = normalizeUrl(loc, origin, origin)
        if (url) pages.add(url)
        if (pages.size >= maxPages) break
      }
    } catch {
      // An unreadable sitemap is skipped; the others still count.
    }
  }
  return { pages: [...pages], sitemaps: [...seen] }
}

const { pages, sitemaps } = await listedPages()
if (pages.length === 0) {
  const result = { origin, sitemaps, listed: 0, orphans: [], failed: [], note: "No sitemap pages on this site's own address were found (robots.txt and /sitemap.xml were tried)." }
  console.log(asJson ? JSON.stringify(result, null, 2) : `${origin}: ${result.note}`)
  process.exit(0)
}

const crawled = []
const status = new Map()
let next = 0
let done = 0
async function worker() {
  while (next < pages.length) {
    const url = pages[next++]
    try {
      const { response, text } = await get(url)
      status.set(url, response.status)
      if (response.ok && (response.headers.get("content-type") ?? "").includes("html")) crawled.push({ url, links: extractLinks(text, response.url || url, origin) })
    } catch {
      status.set(url, "error")
    }
    done++
    if (!asJson && process.stderr.isTTY) process.stderr.write(`\rChecked ${done} of ${pages.length} pages`)
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker))
if (!asJson && process.stderr.isTTY) process.stderr.write("\n")

const { orphans, inbound } = findOrphans(pages, crawled)
const orphanSet = new Set(orphans)
const rows = pages.map((url) => ({ url, inbound: inbound.get(url) ?? 0, status: status.get(url) ?? "error", orphan: orphanSet.has(url) }))
const failed = rows.filter((r) => r.status !== 200).map((r) => ({ url: r.url, status: r.status }))
if (csvPath) fs.writeFileSync(csvPath, toCsv(rows))

// `capped`: the sitemap has more pages than were checked, so `orphans` are candidates, not proven.
const result = { origin, sitemaps, listed: pages.length, capped: pages.length >= maxPages, crawled: crawled.length, orphans, failed, weakest: rows.filter((r) => !r.orphan).sort((a, b) => a.inbound - b.inbound).slice(0, 10).map((r) => ({ url: r.url, inbound: r.inbound })) }
if (asJson) {
  console.log(JSON.stringify(result, null, 2))
} else {
  console.log(`Site: ${origin}`)
  console.log(`Pages in sitemap: ${result.listed}${result.capped ? ` (limit reached; use --max to check more)` : ""}`)
  // Capped, a linking page may not have been read: say so rather than call these orphans.
  console.log(result.capped ? `Orphan candidates (not linked from the ${result.listed} pages checked; run with a higher --max to confirm): ${orphans.length}` : `Orphan pages: ${orphans.length}`)
  for (const url of orphans) console.log(`  ${url}`)
  console.log(`Did not load: ${failed.length}`)
  for (const f of failed) console.log(`  ${f.url} (${f.status})`)
  if (csvPath) console.log(`CSV written to ${csvPath}`)
}
