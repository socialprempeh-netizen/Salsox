/**
 * Tests for the Help Center content (help.ts): the parsers refuse a bad
 * file, and every real article and video script in content/help/ is
 * complete. Each category has articles and one script, every article has
 * numbered steps and a description that fits a search result, and every
 * internal link leads to an article or a page that exists.
 */
import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import {
  HELP_CATEGORIES,
  countSteps,
  getHelpArticles,
  getVideoScripts,
  helpByCategory,
  internalLinks,
  neighbours,
  parseArticle,
  parseVideoScript,
} from "./help"

const article = (front: string, body = "1. Do this.\n2. Then that.") => `---\n${front}\n---\n\n${body}\n`

describe("parsers", () => {
  it("reads a complete article and counts its steps", () => {
    const a = parseArticle("x", article('title: "T"\ndescription: "D"\ncategory: sending\norder: 2'))
    expect(a).toMatchObject({ slug: "x", title: "T", category: "sending", order: 2, steps: 2 })
  })

  it("refuses an unknown category or a missing field, naming the file", () => {
    expect(() => parseArticle("bad", article('title: "T"\ndescription: "D"\ncategory: nope\norder: 1'))).toThrow(/bad\.md.*category/)
    expect(() => parseArticle("bad", article('description: "D"\ncategory: sending\norder: 1'))).toThrow(/title/)
  })

  it("reads a video script, with or without a finished video", () => {
    expect(parseVideoScript("templates", article('title: "T"\nsummary: "S"\nminutes: 3')).video).toBeUndefined()
    expect(parseVideoScript("templates", article('title: "T"\nsummary: "S"\nminutes: 3\nvideo: "https://example.com/v.mp4"')).video).toBe("https://example.com/v.mp4")
    expect(() => parseVideoScript("nope", article('title: "T"\nsummary: "S"\nminutes: 3'))).toThrow(/not a help category/)
  })

  it("counts only numbered list items as steps, and finds internal links", () => {
    expect(countSteps("Intro.\n\n1. One\n2. Two\n\n- bullet\n10. Ten")).toBe(3)
    expect(internalLinks("See [a](/resources/help/a), [b](/pricing#plans) and [c](https://x.com).")).toEqual(["/resources/help/a", "/pricing"])
  })
})

describe("the real content", () => {
  const articles = getHelpArticles()
  const scripts = getVideoScripts()

  it("has at least two articles in every category", () => {
    for (const { category, articles: list } of helpByCategory(articles)) expect(list.length, category).toBeGreaterThanOrEqual(2)
  })

  it("has unique slugs and unique order within a category", () => {
    expect(new Set(articles.map((a) => a.slug)).size).toBe(articles.length)
    for (const { category, articles: list } of helpByCategory(articles)) {
      expect(new Set(list.map((a) => a.order)).size, category).toBe(list.length)
    }
  })

  it("gives every article numbered steps, a short title and a search-sized description", () => {
    for (const a of articles) {
      expect(a.steps, `${a.slug} has no numbered steps`).toBeGreaterThanOrEqual(3)
      expect(a.title.length, `${a.slug} title`).toBeLessThanOrEqual(70)
      expect(a.description.length, `${a.slug} description`).toBeLessThanOrEqual(160)
    }
  })

  it("has exactly one video script per category, each with scenes to record", () => {
    expect(scripts.map((s) => s.category)).toEqual([...HELP_CATEGORIES])
    for (const s of scripts) {
      expect(s.content, s.category).toMatch(/## Before you record/)
      expect((s.content.match(/\*\*Say:\*\*/g) ?? []).length, `${s.category} lines to say`).toBeGreaterThanOrEqual(5)
      expect((s.content.match(/\*\*Do:\*\*/g) ?? []).length, `${s.category} actions`).toBeGreaterThanOrEqual(3)
    }
  })

  it("links only to articles and pages that exist", () => {
    const slugs = new Set(articles.map((a) => a.slug))
    // Site routes an article may point at. Each is a real page (src/app).
    const pages = new Set(["/signup", "/login", "/pricing", "/templates", "/verify", "/contact", "/resources/help", "/resources/help/videos"])
    const appDir = path.join(process.cwd(), "src", "app")
    expect(fs.existsSync(appDir)).toBe(true)
    for (const a of [...articles, ...scripts.map((s) => ({ slug: `videos/${s.category}`, content: s.content }))]) {
      for (const href of internalLinks(a.content)) {
        const help = href.match(/^\/resources\/help\/([^/]+)$/)
        const ok = pages.has(href) || (help ? slugs.has(help[1]) || help[1] === "videos" : false)
        expect(ok, `${a.slug} links to ${href}`).toBe(true)
      }
    }
  })

  it("chains every article to the next in reading order", () => {
    expect(neighbours(articles[0].slug, articles).previous).toBeUndefined()
    expect(neighbours(articles[0].slug, articles).next?.slug).toBe(articles[1].slug)
    expect(neighbours(articles.at(-1)!.slug, articles).next).toBeUndefined()
  })
})
