// Types for scan.js, so the tests (src/lib/orphan-scanner.test.ts) are checked
// by TypeScript while the extension itself ships plain JavaScript, with no
// build step.
export function normalizeUrl(href: string, base: string, origin: string): string | null
export function sitemapsFromRobots(text: string): string[]
export function parseSitemap(xml: string): { pages: string[]; sitemaps: string[] }
export function extractLinks(html: string, pageUrl: string, origin: string): Set<string>
export function findOrphans(listed: string[], crawled: { url: string; links: Set<string> }[]): { orphans: string[]; inbound: Map<string, number> }
export function toCsv(rows: { url: string; inbound: number; status: string | number; orphan: boolean }[]): string
