import { describe, it, expect } from "vitest"

import { getLegalDocument, type LegalSlug } from "./legal"

const SLUGS: LegalSlug[] = ["privacy", "terms", "cookies"]

describe("legal documents", () => {
  it.each(SLUGS)("%s has its frontmatter and a body", (slug) => {
    const doc = getLegalDocument(slug)
    expect(doc.title.length).toBeGreaterThan(0)
    expect(doc.description.length).toBeGreaterThan(0)
    expect(doc.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(doc.content.length).toBeGreaterThan(500)
  })

  // The reviewer note is for whoever edits the file, never for the reader.
  it.each(SLUGS)("%s never shows its reviewer note on the page", (slug) => {
    expect(getLegalDocument(slug).content).not.toMatch(/<!--|NOT LEGALLY REVIEWED/)
  })

  // Nobody may flip this by accident: it says a lawyer has read the text.
  it.each(SLUGS)("%s is not marked as reviewed until a lawyer has done it", (slug) => {
    expect(getLegalDocument(slug).reviewed).toBe(false)
  })

  it.each(SLUGS)("%s has none of the starter kit's placeholder text", (slug) => {
    expect(getLegalDocument(slug).content).not.toMatch(/placeholder|starter kit|projects/i)
  })
})
