/**
 * Tests for the landing/tool/comparison page registry (pages.ts): the quality
 * rules themselves, and every real page in content/pages held to them, along
 * with the blog posts' related links and the redirect map.
 *
 * This is the test that stops thin, duplicate or broken pages from shipping.
 * When it fails on content, fix the content: the numbers are deliberate.
 */
import { describe, expect, it } from "vitest"
import { getAllPosts } from "@/lib/blog"
import { getTemplates, TEMPLATES_PATH } from "@/lib/templates"
import { categoryPath, MIN_TEMPLATES_PER_CATEGORY_PAGE, TEMPLATE_CATEGORIES } from "@/lib/templates-taxonomy"
import { getDocs } from "@/lib/docs"
import { getHelpArticles, HELP_PATH, HELP_VIDEOS_PATH, helpArticlePath } from "@/lib/help"
import { DOCS_REDIRECTS, SEO_REDIRECTS } from "./redirects"
import { getPages, loadAllPages, pagePath, parseFileName, similarity, validatePages, wordCount, type SitePage } from "./pages"

/** Routes outside the registry that pages may link to. */
// "/docs" left the list when it became a redirect to the Help Center
// (DOCS_REDIRECTS): a link to it would cost every reader a hop. Was:
// const STATIC_PATHS = ["/", "/pricing", "/verify", "/docs", "/blog", "/about", "/contact", "/changelog", "/tools", "/compare"]
const STATIC_PATHS = ["/", "/pricing", "/verify", "/blog", "/about", "/contact", "/changelog", "/tools", "/compare", HELP_PATH, HELP_VIDEOS_PATH]
// The template library's pages are linkable too (industry and team pages
// point at their templates), including the category pages that exist: only
// categories with enough templates get one (MIN_TEMPLATES_PER_CATEGORY_PAGE).
const categoryPaths = () =>
  TEMPLATE_CATEGORIES.filter((c) => getTemplates().filter((t) => t.category === c).length >= MIN_TEMPLATES_PER_CATEGORY_PAGE).map(categoryPath)
// Was: new Set([...STATIC_PATHS, TEMPLATES_PATH, ...getTemplates().map((t) => t.path), ...getAllPosts().map((p) => `/blog/${p.slug}`)])
// Then without the Help Center guides, which are linkable (and a redirect
// destination) since /docs moved there.
const knownPaths = () => new Set([...STATIC_PATHS, TEMPLATES_PATH, ...categoryPaths(), ...getTemplates().map((t) => t.path), ...getAllPosts().map((p) => `/blog/${p.slug}`), ...getHelpArticles().map((a) => helpArticlePath(a.slug))])

describe("registry basics", () => {
  it("puts each kind at its URL", () => {
    expect(pagePath("tool", "sign-pdf")).toBe("/sign-pdf")
    expect(pagePath("solution", "online-esignature")).toBe("/online-esignature")
    expect(pagePath("comparison", "docusign")).toBe("/vs/docusign")
    expect(pagePath("alternative", "docusign")).toBe("/alternatives/docusign")
    expect(pagePath("use-case", "hr")).toBe("/esignature-for/hr")
  })

  it("reads a locale from the file name, for future translations", () => {
    expect(parseFileName("sign-pdf.md")).toEqual({ slug: "sign-pdf", locale: "en" })
    expect(parseFileName("sign-pdf.it.md")).toEqual({ slug: "sign-pdf", locale: "it" })
    expect(parseFileName("Bad Name.md")).toBeNull()
  })

  it("counts words without markup and scores similarity", () => {
    expect(wordCount("## Title\n\nSome [linked words](/x) and `code`.")).toBe(6)
    const a = "the quick brown fox jumps over the lazy dog again and again"
    expect(similarity(a, a)).toBe(1)
    expect(similarity(a, "completely different text with no shared five word runs at all")).toBe(0)
  })
})

// Each case validates every content page: quick alone, past the 5-second
// default when the whole suite runs at once (see "passes every quality rule").
describe("validatePages catches", { timeout: 30_000 }, () => {
  const base = getPages()[0]
  const clone = (over: Partial<SitePage>): SitePage => ({ ...base, ...over })

  it("a second page for the same intent, and a copied body", () => {
    const twin = clone({ path: "/copy", slug: "copy", title: "Another title for the same", description: base.description, h1: "Different H1" })
    const problems = validatePages([base, twin], knownPaths())
    expect(problems.join("\n")).toMatch(/same description/)
    expect(problems.join("\n")).toMatch(/intent .* already belongs/)
    expect(problems.join("\n")).toMatch(/alike/)
  })

  it("a thin page and a related link to nowhere", () => {
    const thin = clone({ body: "Too short.", related: ["/nowhere", "/pricing", "/blog"] })
    const problems = validatePages([thin], knownPaths()).join("\n")
    expect(problems).toMatch(/words of body text/)
    expect(problems).toMatch(/related link \/nowhere goes nowhere/)
  })
})

describe("the real content", () => {
  it("has every kind of page the site promises", () => {
    const kinds = new Set(getPages().map((p) => p.kind))
    for (const kind of ["solution", "tool", "comparison", "alternative", "use-case"]) expect(kinds.has(kind as never)).toBe(true)
    expect(getPages({ kind: "tool" }).map((p) => p.tool).sort()).toEqual(
      ["add-signature-to-pdf", "fill-and-sign-pdf", "pdf-signature-generator", "request-signature", "sign-pdf"]
    )
  })

  // Reads and checks every content page from disk: under a second on its
  // own, but past the 5-second default when the whole suite runs at once.
  it("passes every quality rule", () => {
    const problems = validatePages(loadAllPages(), knownPaths())
    expect(problems, problems.join("\n")).toEqual([])
  }, 30_000)

  it("fills in the product name everywhere", () => {
    for (const p of getPages()) expect(`${p.title}${p.description}${p.h1}${p.body}${JSON.stringify(p.faq)}`).not.toContain("{site}")
  })

  it("keeps blog posts' related links pointing at real pages", () => {
    const all = new Set([...knownPaths(), ...getPages().map((p) => p.path)])
    for (const post of getAllPosts()) {
      for (const target of post.related) expect(all.has(target), `${post.slug} -> ${target}`).toBe(true)
      expect(post.content).not.toContain("{site}")
    }
  })

  // A post written for a phrase a page already targets would compete with
  // that page in search, usually leaving both weaker. Each post's `keyword`
  // must be its own: not another post's, not a registry page's primary
  // keyword or alias, not a template's keyword.
  it("gives each blog post a keyword no other post, page or template targets", () => {
    const owners = new Map<string, string>()
    for (const page of getPages()) for (const k of [page.primaryKeyword, ...page.aliases]) owners.set(k.toLowerCase(), page.path)
    for (const t of getTemplates()) owners.set(t.keyword.toLowerCase(), t.path)
    const problems: string[] = []
    for (const post of getAllPosts()) {
      if (!post.keyword) continue
      const owner = owners.get(post.keyword)
      if (owner) problems.push(`/blog/${post.slug} targets "${post.keyword}", already ${owner}'s`)
      else owners.set(post.keyword, `/blog/${post.slug}`)
    }
    expect(problems, problems.join("\n")).toEqual([])
  })

  it("does not let blog posts and pages say the same thing", () => {
    const problems: string[] = []
    for (const post of getAllPosts()) {
      for (const page of getPages()) {
        const score = similarity(post.content, page.body)
        if (score > 0.12) problems.push(`/blog/${post.slug} and ${page.path}: ${(score * 100).toFixed(0)}% alike`)
      }
    }
    expect(problems, problems.join("\n")).toEqual([])
    // Every post against every page: past the 5s default under a full
    // parallel run once the blog passed thirty posts, though ~1s alone.
  }, 30_000)
})

describe("redirects", () => {
  const destinations = new Set([...getPages().map((p) => p.path), ...knownPaths()])

  it("land on real pages, in one hop", () => {
    const sources = new Set(SEO_REDIRECTS.map((r) => r.source))
    for (const r of SEO_REDIRECTS) {
      expect(destinations.has(r.destination), `${r.source} -> ${r.destination}`).toBe(true)
      expect(sources.has(r.destination), `${r.destination} is itself redirected`).toBe(false)
    }
  })

  it("never shadow a real page", () => {
    for (const r of SEO_REDIRECTS) expect(getPages().some((p) => p.path === r.source), r.source).toBe(false)
  })

  // Every old /docs guide gets a guide of its own in the Help Center, not
  // just the catch-all to the front page: a link to a guide keeps its topic.
  it("send each old /docs guide to a Help Center guide", () => {
    const sources = new Set(DOCS_REDIRECTS.map((r) => r.source))
    for (const d of getDocs()) expect(sources.has(`/docs/${d.slug}`), `/docs/${d.slug}`).toBe(true)
  })
})
