/**
 * Link injection: sentences go after prose paragraphs only, never twice, and
 * never when the sentence is not a single link to the article.
 */
import { describe, expect, it } from "vitest"
import { bestParagraph, fallbackSentence, injectLinks, isParagraph, linksTo, markdownBlocks, paragraphs, pickLinkSources, validSentence } from "./links"

const page = `Intro paragraph about signing.

## A heading

- a list item
- another

Second paragraph about leases and rentals.

\`\`\`
code

still code
\`\`\`

| a | b |
|---|---|

Last paragraph.
`

const href = "/blog/lease-esign"
const sentence = `Landlords can also [sign a lease online](${href}) from a phone.`

describe("markdownBlocks and paragraphs", () => {
  it("keeps fenced code whole and finds only prose paragraphs", () => {
    expect(markdownBlocks(page).filter((b) => b.startsWith("```"))).toHaveLength(1)
    expect(paragraphs(page)).toEqual(["Intro paragraph about signing.", "Second paragraph about leases and rentals.", "Last paragraph."])
    expect(isParagraph("   indented continuation")).toBe(false)
    expect(isParagraph("<NewsletterSignup />")).toBe(false)
  })
})

describe("validSentence", () => {
  it("wants exactly one link, to the article, on one short line", () => {
    expect(validSentence(sentence, href)).toBe(true)
    expect(validSentence(`See [the guide](${href}/).`, href)).toBe(true)
    expect(validSentence(`See [it](${href}).`, href)).toBe(false)
    expect(validSentence("No link here.", href)).toBe(false)
    expect(validSentence(`[a](${href}) and [b](/other)`, href)).toBe(false)
    expect(validSentence(`[wrong](/blog/other) target`, href)).toBe(false)
    expect(validSentence(`- [list](${href})`, href)).toBe(false)
    expect(validSentence(`Two\n[lines](${href})`, href)).toBe(false)
    expect(validSentence(`${"x".repeat(330)} [a link](${href})`, href)).toBe(false)
  })

  it("accepts the fallback sentence", () => {
    expect(validSentence(fallbackSentence("Lease [guide]", href), href)).toBe(true)
  })
})

describe("injectLinks", () => {
  it("inserts the sentence as its own paragraph after the chosen prose paragraph", () => {
    const out = injectLinks(page, [{ afterParagraph: 1, sentence, href }])
    expect(out).toContain(`Second paragraph about leases and rentals.\n\n${sentence}\n\n\`\`\``)
    expect(out).toContain("code\n\nstill code")
  })

  it("clamps an index past the end to the last paragraph", () => {
    expect(injectLinks(page, [{ afterParagraph: 99, sentence, href }]).trimEnd().endsWith(sentence)).toBe(true)
  })

  it("does nothing when the page already links to the article or the sentence is invalid", () => {
    const linked = `Already [there](${href}).\n`
    expect(injectLinks(linked, [{ afterParagraph: 0, sentence, href }])).toBe(linked)
    expect(injectLinks(page, [{ afterParagraph: 0, sentence: "no link", href }])).toBe(page)
    expect(injectLinks(page, [])).toBe(page)
  })
})

describe("linksTo", () => {
  it("matches the path with or without a slash, hash or query", () => {
    expect(linksTo(`[a](${href})`, href)).toBe(true)
    expect(linksTo(`[a](${href}/#faq)`, href)).toBe(true)
    expect(linksTo(`[a](${href}-two)`, href)).toBe(false)
  })
})

describe("bestParagraph", () => {
  it("picks the paragraph sharing most words with the keyword, else the first", () => {
    expect(bestParagraph(paragraphs(page), "lease rental esignature")).toBe(1)
    expect(bestParagraph(paragraphs(page), "unrelated")).toBe(0)
  })
})

describe("pickLinkSources", () => {
  it("takes the busiest eligible pages, skipping the article and duplicates", () => {
    const eligible = new Map(["/a", "/b", "/c", "/d"].map((path) => [path, { path }]))
    const picked = pickLinkSources(["/", href, "/b/", "/b", "/x", "/a", "/c", "/d"], eligible, { exclude: href, limit: 3 })
    expect(picked.map((p) => p.path)).toEqual(["/b", "/a", "/c"])
  })
})
