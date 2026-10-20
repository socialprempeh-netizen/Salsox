/**
 * Article rules: what a draft must pass before it is saved, its slug, its
 * rendered FAQ and its structured data.
 */
import { describe, expect, it } from "vitest"
import { articleJsonLd, articleMarkdown, checkDraft, countWords, FAQ_HEADING, slugFor, type ArticleDraft } from "./article"

const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(" ")

const good: ArticleDraft = {
  title: "How to sign a lease agreement online",
  description: "How to sign a lease online from any phone, what makes the signature valid, and what landlords and tenants should keep afterwards.",
  category: "Guides",
  body: `${words(100)}\n\n## What you need\n\n${words(250)} See [Sign PDF](/sign-pdf).\n\n## Step by step\n\n${words(250)}\n\n## After signing\n\n${words(150)}`,
  faq: [
    { q: "Is an online lease signature valid?", a: "In most countries it is, as long as both sides agree to sign electronically." },
    { q: "Do I need an account to sign?", a: "No, signers open a link and sign in the browser without an account." },
    { q: "Can I sign on my phone?", a: "Yes, signing works in a phone browser the same way it does on a computer." },
  ],
  related: ["/sign-pdf", "/pricing"],
}
const rules = { categories: ["Guides", "Legal"], allowedRelated: ["/sign-pdf", "/pricing", "/blog/other"] }

describe("checkDraft", () => {
  it("accepts a complete draft", () => {
    expect(checkDraft(good, rules)).toEqual([])
  })

  it("reports every problem, in plain words", () => {
    const problems = checkDraft(
      {
        ...good,
        title: "Short",
        category: "Made up",
        body: `# Title\n\n${words(50)} [x](/nowhere)\n\n## Frequently asked questions\n\n${words(10)}`,
        faq: [{ q: "Why?", a: "Because." }],
        related: ["/invented"],
      },
      rules
    )
    expect(problems.join("\n")).toMatch(/title is 5 characters/)
    expect(problems.join("\n")).toMatch(/category "Made up"/)
    expect(problems.join("\n")).toMatch(/body is \d+ words/)
    expect(problems.join("\n")).toMatch(/H1/)
    expect(problems.join("\n")).toMatch(/fewer than three H2/)
    expect(problems.join("\n")).toMatch(/its own FAQ section/)
    expect(problems.join("\n")).toMatch(/faq has 1 entries/)
    expect(problems.join("\n")).toMatch(/too short/)
    expect(problems.join("\n")).toMatch(/related paths not offered: \/invented/)
    expect(problems.join("\n")).toMatch(/related has 1 paths/)
    expect(problems.join("\n")).toMatch(/unknown site paths: \/nowhere/)
  })
})

describe("countWords", () => {
  it("counts link text, not Markdown syntax", () => {
    expect(countWords("## Heading here\n\nRead [the guide](/blog/x) now.")).toBe(6)
  })
})

describe("slugFor", () => {
  it("makes a short URL-safe slug and avoids taken ones", () => {
    expect(slugFor("How to sign a PDF on iPhone?", new Set())).toBe("how-to-sign-a-pdf-on-iphone")
    expect(slugFor("café contract", new Set())).toBe("cafe-contract")
    expect(slugFor("one two three four five six seven eight nine ten", new Set())).toBe("one-two-three-four-five-six-seven-eight")
    expect(slugFor("sign pdf", new Set(["sign-pdf", "sign-pdf-2"]))).toBe("sign-pdf-3")
    expect(slugFor("???", new Set())).toBe("article")
  })
})

describe("articleMarkdown", () => {
  it("appends the FAQ as questions and answers, the same format as the file posts", () => {
    const md = articleMarkdown("Body text.\n", [{ q: "Q one?", a: "Answer one." }])
    expect(md).toBe(`Body text.\n\n## ${FAQ_HEADING}\n\n### Q one?\n\nAnswer one.\n`)
    expect(articleMarkdown("Body.", [])).toBe("Body.")
  })
})

describe("articleJsonLd", () => {
  const base = {
    siteName: "Acme",
    siteUrl: "https://acme.test",
    siteDescription: "Signing.",
    slug: "a-post",
    title: "A post",
    description: "About it.",
    keyword: "a post",
    faq: [{ q: "Q?", a: "A." }],
    publishedAt: "2026-10-20T05:00:00.000Z",
  }

  it("declares Article, FAQPage and SoftwareApplication from the article's fields", () => {
    const graphs = articleJsonLd({ ...base, updatedAt: "2026-10-21T05:00:00.000Z" }) as Record<string, unknown>[]
    expect(graphs.map((g) => g["@type"])).toEqual(["Article", "FAQPage", "SoftwareApplication"])
    expect(graphs[0]).toMatchObject({ headline: "A post", mainEntityOfPage: "https://acme.test/blog/a-post", dateModified: "2026-10-21T05:00:00.000Z" })
    expect(graphs[1]).toMatchObject({ mainEntity: [{ "@type": "Question", name: "Q?", acceptedAnswer: { "@type": "Answer", text: "A." } }] })
    expect(graphs[2]).not.toHaveProperty("offers")
    expect(graphs[2]).not.toHaveProperty("aggregateRating")
  })

  it("leaves out an FAQPage with no questions and a dateModified that is not later", () => {
    const graphs = articleJsonLd({ ...base, faq: [], updatedAt: base.publishedAt }) as Record<string, unknown>[]
    expect(graphs.map((g) => g["@type"])).toEqual(["Article", "SoftwareApplication"])
    expect(graphs[0]).not.toHaveProperty("dateModified")
  })
})
