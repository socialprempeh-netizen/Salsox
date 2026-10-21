import { describe, expect, it } from "vitest"
import { trackerNote } from "./tracker"

const entry = { name: "Sam", company: "Acme", email: "sam@acme.com", source: "g2" as const, competitor: "DocuSign", quote: "The bill doubled when we added two people", replySummary: "Wants a demo next week." }

describe("trackerNote", () => {
  it("says where the lead came from, the quote, the address and the reply", () => {
    expect(trackerNote(entry, 2000)).toBe('From the outreach agent: a DocuSign complaint on G2. They wrote: "The bill doubled when we added two people". Email: sam@acme.com. Their reply: Wants a demo next week.')
  })

  it("leaves out what is not known", () => {
    expect(trackerNote({ ...entry, email: null, replySummary: null }, 2000)).toBe('From the outreach agent: a DocuSign complaint on G2. They wrote: "The bill doubled when we added two people".')
  })

  it("shortens the quote to fit the limit", () => {
    const note = trackerNote({ ...entry, quote: "x".repeat(500) }, 200)
    expect(note.length).toBeLessThanOrEqual(200)
    expect(note).toContain("…")
    expect(note).toContain("Email: sam@acme.com.")
  })
})
