/**
 * Tests for the SEO inventory (inventory.ts): rows come from the sitemap and
 * take their type, keyword and intent from the page data; registry pages and
 * templates missing from the sitemap are flagged; two URLs targeting one
 * phrase are a conflict. The last test builds the inventory from the real
 * content and holds the site to it.
 */
import { describe, expect, it } from "vitest"
import { buildInventory, countByType, filterInventory, inventoryCsv, type InventoryInput } from "./inventory"
import { getPages, loadAllPages } from "./pages"
import { getTemplates } from "@/lib/templates"
import { TEMPLATE_INDUSTRIES, TEMPLATE_TEAMS } from "@/lib/templates-taxonomy"
import sitemap from "@/app/sitemap"

const base: InventoryInput = {
  sitemapPaths: [],
  registry: [],
  templates: [],
  categories: [],
  industryPaths: [],
  teamPaths: [],
  hubPaths: ["/compare"],
  posts: [],
  blogCategories: [],
  docs: [],
  locales: ["en", "it"],
  defaultLocale: "en",
}

const reg = (kind: InventoryInput["registry"][number]["kind"], path: string, keyword: string, extra: Partial<InventoryInput["registry"][number]> = {}) => ({
  kind,
  path,
  title: `Title ${path}`,
  primaryKeyword: keyword,
  aliases: [],
  updated: "2026-10-15",
  draft: false,
  ...extra,
})

describe("buildInventory", () => {
  it("types each sitemap URL from the data behind it", () => {
    const { rows } = buildInventory({
      ...base,
      sitemapPaths: ["/", "/compare", "/vs/docuseal", "/sign-and-pay", "/esignature-for/clinics", "/esignature-for/hr", "/esignature-for/freelancers", "/templates/mutual-nda", "/templates/category/nda", "/it/docs/billing"],
      registry: [
        reg("comparison", "/vs/docuseal", "docuseal alternative"),
        reg("solution", "/sign-and-pay", "sign and pay"),
        reg("use-case", "/esignature-for/clinics", "esignature for clinics"),
        reg("use-case", "/esignature-for/hr", "esignature for hr"),
        reg("use-case", "/esignature-for/freelancers", "esignature for freelancers"),
      ],
      industryPaths: ["/esignature-for/clinics"],
      teamPaths: ["/esignature-for/hr"],
      templates: [{ path: "/templates/mutual-nda", title: "Mutual NDA", keyword: "mutual nda template", updated: "2026-10-15" }],
      categories: [{ path: "/templates/category/nda", title: "NDA templates", keyword: "nda templates" }],
      docs: [{ path: "/docs/billing", title: "Billing" }],
    })
    const by = Object.fromEntries(rows.map((r) => [r.path, r]))
    expect(by["/vs/docuseal"]).toMatchObject({ type: "comparison", keyword: "docuseal alternative", intent: "commercial", status: "live" })
    expect(by["/sign-and-pay"].type).toBe("feature")
    expect(by["/esignature-for/clinics"].type).toBe("industry")
    expect(by["/esignature-for/hr"].type).toBe("team")
    expect(by["/esignature-for/freelancers"].type).toBe("use-case")
    expect(by["/templates/mutual-nda"]).toMatchObject({ type: "template", intent: "transactional", keyword: "mutual nda template" })
    expect(by["/templates/category/nda"].type).toBe("category")
    expect(by["/compare"].type).toBe("hub")
    expect(by["/"]).toMatchObject({ type: "core", keyword: null, intent: "navigational" })
    // A translated URL keeps its own path and is typed by the page it translates.
    expect(by["/it/docs/billing"]).toMatchObject({ type: "docs", locale: "it", title: "Billing" })
  })

  it("flags published pages the sitemap leaves out, and drafts", () => {
    const { rows } = buildInventory({
      ...base,
      sitemapPaths: ["/vs/a"],
      registry: [reg("comparison", "/vs/a", "a"), reg("comparison", "/vs/b", "b"), reg("comparison", "/vs/c", "c", { draft: true })],
      templates: [{ path: "/templates/x", title: "X", keyword: "x template", updated: "2026-10-15" }],
    })
    const status = Object.fromEntries(rows.map((r) => [r.path, r.status]))
    expect(status).toEqual({ "/vs/a": "live", "/vs/b": "unlisted", "/vs/c": "draft", "/templates/x": "unlisted" })
  })

  it("reports two live URLs targeting the same phrase, aliases included", () => {
    const { conflicts } = buildInventory({
      ...base,
      sitemapPaths: ["/vs/pandadoc", "/alternatives/pandadoc", "/templates/nda"],
      registry: [
        reg("comparison", "/vs/pandadoc", "salsox vs pandadoc", { aliases: ["PandaDoc alternative"] }),
        reg("alternative", "/alternatives/pandadoc", "pandadoc alternative"),
      ],
      templates: [{ path: "/templates/nda", title: "NDA", keyword: "nda template", updated: "2026-10-15" }],
    })
    expect(conflicts).toEqual([{ keyword: "pandadoc alternative", paths: ["/alternatives/pandadoc", "/vs/pandadoc"] }])
  })
})

describe("filterInventory and countByType", () => {
  const { rows } = buildInventory({
    ...base,
    sitemapPaths: ["/", "/vs/docuseal", "/vs/signwell", "/sign-and-pay"],
    registry: [reg("comparison", "/vs/docuseal", "docuseal alternative"), reg("comparison", "/vs/signwell", "signwell", { aliases: ["SignWell pricing"] }), reg("solution", "/sign-and-pay", "sign and pay")],
  })

  it("narrows by type and by a search over path, keyword and aliases", () => {
    expect(filterInventory(rows, "comparison", "").map((r) => r.path)).toEqual(["/vs/docuseal", "/vs/signwell"])
    expect(filterInventory(rows, "all", "pricing").map((r) => r.path)).toEqual(["/vs/signwell"])
    expect(filterInventory(rows, "feature", "docuseal")).toEqual([])
  })

  it("counts only the types present, in display order", () => {
    expect(countByType(rows)).toEqual([{ type: "feature", count: 1 }, { type: "comparison", count: 2 }, { type: "core", count: 1 }])
  })
})

describe("inventoryCsv", () => {
  it("quotes cells that need it", () => {
    const { rows } = buildInventory({ ...base, sitemapPaths: ["/vs/a"], registry: [reg("comparison", "/vs/a", "a, b", { title: 'Say "hi"' })] })
    const csv = inventoryCsv(rows, "https://site.test")
    expect(csv.split("\n")[0]).toBe("url,type,keyword,intent,status,title,aliases,locale,updated")
    expect(csv.split("\n")[1]).toBe('https://site.test/vs/a,comparison,"a, b",commercial,live,"Say ""hi""",,en,2026-10-15')
  })
})

describe("the site's own inventory", () => {
  it("lists every published registry page and template as live, with no keyword conflicts", () => {
    const { rows, conflicts } = buildInventory({
      ...base,
      sitemapPaths: sitemap().map((e) => new URL(e.url).pathname),
      registry: loadAllPages().filter((p) => p.locale === "en"),
      templates: getTemplates(),
      industryPaths: Object.values(TEMPLATE_INDUSTRIES),
      teamPaths: Object.values(TEMPLATE_TEAMS),
    })
    expect(rows.filter((r) => r.status === "unlisted").map((r) => r.path)).toEqual([])
    expect(conflicts).toEqual([])
    for (const page of getPages()) expect(rows.find((r) => r.path === page.path)?.keyword, page.path).toBe(page.primaryKeyword)
  })
})
