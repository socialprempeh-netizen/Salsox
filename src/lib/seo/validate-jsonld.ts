/**
 * A structural check of the JSON-LD this site emits, against the properties
 * Google documents as required for each type it can show as a rich result
 * (developers.google.com/search/docs/appearance/structured-data), plus the
 * schema.org basics every graph needs.
 *
 * Why here rather than only in Google's Rich Results Test: that tool checks
 * one URL by hand. This runs in the test suite over the builders, and in the
 * crawler audit (e2e/seo.spec.ts) over every public page as served, so a
 * graph that loses a required field fails a build instead of quietly losing
 * its rich result weeks later.
 *
 * Errors are what makes a graph invalid or ineligible; warnings are
 * recommendations. Unknown types are accepted without checks.
 */

type Node = Record<string, unknown>
export type JsonLdReport = { errors: string[]; warnings: string[]; types: string[] }

const isAbsUrl = (v: unknown) => typeof v === "string" && /^https?:\/\/[^\s]+$/.test(v)
const nonEmpty = (v: unknown) => typeof v === "string" && v.trim().length > 0
const isIsoDate = (v: unknown) => typeof v === "string" && !Number.isNaN(Date.parse(v)) && /^\d{4}-\d{2}-\d{2}/.test(v)
const typesOf = (node: Node): string[] => {
  const t = node["@type"]
  return Array.isArray(t) ? t.map(String) : t ? [String(t)] : []
}

function checkNode(node: Node, where: string, report: JsonLdReport) {
  const err = (m: string) => report.errors.push(`${where}: ${m}`)
  const warn = (m: string) => report.warnings.push(`${where}: ${m}`)
  const types = typesOf(node)
  if (types.length === 0) return err("missing @type")
  report.types.push(...types)

  for (const type of types) {
    switch (type) {
      case "Organization":
        if (!nonEmpty(node.name)) err("Organization needs a name")
        if (!isAbsUrl(node.url)) err("Organization needs an absolute url")
        if (!isAbsUrl(node.logo)) warn("Organization has no absolute logo URL")
        break
      case "WebSite":
        if (!nonEmpty(node.name)) err("WebSite needs a name")
        if (!isAbsUrl(node.url)) err("WebSite needs an absolute url")
        break
      case "WebPage":
      case "CollectionPage":
      case "AboutPage":
        if (!isAbsUrl(node.url)) err(`${type} needs an absolute url`)
        break
      case "SoftwareApplication":
      case "WebApplication": {
        if (!nonEmpty(node.name)) err(`${type} needs a name`)
        const offers = (Array.isArray(node.offers) ? node.offers : [node.offers]).filter(Boolean) as Node[]
        if (offers.length === 0) err(`${type} needs offers`)
        for (const offer of offers) {
          if (offer.price === undefined || Number.isNaN(Number(offer.price))) err(`${type} offer needs a numeric price`)
          if (!nonEmpty(offer.priceCurrency)) err(`${type} offer needs a priceCurrency`)
        }
        if (!node.applicationCategory) warn(`${type} has no applicationCategory`)
        if (!node.operatingSystem) warn(`${type} has no operatingSystem`)
        if (!node.aggregateRating && !node.review) warn(`${type} has no rating or review, so it is not eligible for a software rich result (none should be invented)`)
        break
      }
      case "BreadcrumbList": {
        const items = (node.itemListElement ?? []) as Node[]
        if (!Array.isArray(items) || items.length === 0) err("BreadcrumbList needs itemListElement")
        items.forEach((item, i) => {
          if (item.position !== i + 1) err(`breadcrumb ${i + 1} has position ${String(item.position)}`)
          if (!nonEmpty(item.name)) err(`breadcrumb ${i + 1} needs a name`)
          if (i < items.length - 1 && !isAbsUrl(item.item)) err(`breadcrumb ${i + 1} needs an absolute item URL`)
        })
        break
      }
      case "FAQPage": {
        const qs = (node.mainEntity ?? []) as Node[]
        if (!Array.isArray(qs) || qs.length === 0) err("FAQPage needs mainEntity questions")
        qs.forEach((q, i) => {
          if (!typesOf(q).includes("Question")) err(`FAQ ${i + 1} is not a Question`)
          if (!nonEmpty(q.name)) err(`FAQ ${i + 1} needs a name (the question)`)
          const answer = q.acceptedAnswer as Node | undefined
          if (!answer || !nonEmpty(answer.text)) err(`FAQ ${i + 1} needs acceptedAnswer.text`)
        })
        break
      }
      case "Article":
      case "BlogPosting":
      case "TechArticle":
      case "NewsArticle":
        if (!nonEmpty(node.headline)) err(`${type} needs a headline`)
        else if (String(node.headline).length > 110) warn(`${type} headline is over 110 characters`)
        if (type !== "TechArticle" && !isIsoDate(node.datePublished)) err(`${type} needs an ISO datePublished`)
        if (node.dateModified !== undefined && !isIsoDate(node.dateModified)) err(`${type} dateModified is not an ISO date`)
        if (type !== "TechArticle" && !node.author) warn(`${type} has no author`)
        if (type !== "TechArticle" && !node.image) warn(`${type} has no image`)
        break
      case "ItemList": {
        const items = (node.itemListElement ?? []) as Node[]
        if (!Array.isArray(items) || items.length === 0) err("ItemList needs itemListElement")
        items.forEach((item, i) => {
          if (item.position !== i + 1) err(`list item ${i + 1} has position ${String(item.position)}`)
          if (!isAbsUrl(item.url) && !isAbsUrl(item.item)) err(`list item ${i + 1} needs an absolute url`)
        })
        break
      }
    }
  }
}

/** Validates one parsed graph, a list of graphs, or an @graph container. */
export function validateJsonLd(data: unknown, where = "json-ld"): JsonLdReport {
  const report: JsonLdReport = { errors: [], warnings: [], types: [] }
  const roots = Array.isArray(data) ? data : [data]
  roots.forEach((root, i) => {
    if (!root || typeof root !== "object") return report.errors.push(`${where}[${i}]: not an object`)
    const node = root as Node
    const context = node["@context"]
    if (context !== "https://schema.org" && context !== "http://schema.org") report.errors.push(`${where}[${i}]: @context should be https://schema.org`)
    const graph = node["@graph"]
    if (Array.isArray(graph)) graph.forEach((g, j) => checkNode(g as Node, `${where}[${i}].@graph[${j}]`, report))
    else checkNode(node, `${where}[${i}]`, report)
  })
  return report
}

/** Every `<script type="application/ld+json">` in an HTML document, validated. */
export function validateJsonLdInHtml(html: string, where = "page"): JsonLdReport {
  const report: JsonLdReport = { errors: [], warnings: [], types: [] }
  const blocks = [...html.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)]
  blocks.forEach((m, i) => {
    let parsed: unknown
    try {
      parsed = JSON.parse(m[1])
    } catch {
      report.errors.push(`${where} block ${i + 1}: not valid JSON`)
      return
    }
    const r = validateJsonLd(parsed, `${where} block ${i + 1}`)
    report.errors.push(...r.errors)
    report.warnings.push(...r.warnings)
    report.types.push(...r.types)
  })
  return report
}
