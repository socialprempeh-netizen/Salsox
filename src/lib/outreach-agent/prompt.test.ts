import { describe, expect, it } from "vitest"
import { classifySystemPrompt, emailSystemPrompt, emailUserPrompt, extractPostPrompt, extractReviewsPrompt, extractSystemPrompt, followUpSystemPrompt, followUpUserPrompt, redditSystemPrompt, redditUserPrompt, socialSystemPrompt, socialUserPrompt } from "./prompt"

const fix = { id: "price", answers: ["pricing" as const], label: "Unlimited documents", facts: "Paid plans send unlimited documents." }
const brief = {
  siteName: "Salsox",
  siteUrl: "https://salsox.com",
  sender: { name: "Ama", role: "Founder" },
  lead: { quote: "The bill doubled when we added two people", competitor: "DocuSign", source: "g2" as const, reviewerName: "Sam", reviewerRole: null, company: "Acme" },
  fix,
}

describe("data boundaries", () => {
  it("tells every role that scraped text is data, not instructions", () => {
    for (const prompt of [extractSystemPrompt(), emailSystemPrompt("Salsox"), followUpSystemPrompt("Salsox"), classifySystemPrompt()]) {
      expect(prompt).toMatch(/<source> tags/)
      expect(prompt).toMatch(/ignore them/)
    }
  })

  it("wraps the scraped material in source tags", () => {
    expect(extractReviewsPrompt({ competitor: "DocuSign", source: "trustpilot", url: "u", markdown: "PAGE" })).toMatch(/<source>\nPAGE\n<\/source>/)
    expect(extractPostPrompt({ competitor: "DocuSign", title: "T", text: "B", url: "u" })).toMatch(/<source>\nTitle: T\n\nB\n<\/source>/)
  })

  it("keeps a comment's thread title inside the source tags, and quotes the comment only", () => {
    const p = extractPostPrompt({ competitor: "DocuSign", title: "T", text: "B", url: "u", kind: "comment" })
    expect(p).toMatch(/<source>\nThread title: T\n\nComment:\nB\n<\/source>/)
    expect(p).toMatch(/never the thread title/)
  })

  it("names the site a post or comment came from", () => {
    expect(extractPostPrompt({ competitor: "DocuSign", title: "T", text: "B", url: "u", kind: "comment", source: "hackernews" })).toMatch(/^Product: DocuSign\n\nHacker News comment \(u\)/)
    expect(extractPostPrompt({ competitor: "DocuSign", title: "T", text: "B", url: "u" })).toMatch(/Reddit post \(u\)/)
  })
})

describe("Hunter", () => {
  it("demands exact quotes and low ratings only", () => {
    const p = extractSystemPrompt()
    expect(p).toMatch(/exactly as written/)
    expect(p).toMatch(/1 or 2 stars/)
    expect(p).toMatch(/promoting, announcing or selling their own product/)
    expect(p).toMatch(/Never guess/)
  })
})

describe("Marco", () => {
  it("limits claims to the given facts and forbids links", () => {
    const p = emailSystemPrompt("Salsox")
    expect(p).toMatch(/only the facts given/)
    expect(p).toMatch(/no links/)
    expect(p).toMatch(/where you saw their complaint/)
  })

  it("names the person, the source and the one fix", () => {
    const p = emailUserPrompt(brief)
    expect(p).toContain("Sam, Acme")
    expect(p).toContain("on G2")
    expect(p).toContain("Paid plans send unlimited documents.")
  })

  it("falls back to a plain greeting when the name is unknown", () => {
    expect(emailUserPrompt({ ...brief, lead: { ...brief.lead, reviewerName: null, company: null } })).toMatch(/name unknown/)
  })
})

describe("Oscar", () => {
  it("forbids a bump and shows the first email to avoid", () => {
    expect(followUpSystemPrompt("Salsox")).toMatch(/just bumping this/)
    const p = followUpUserPrompt({ ...brief, firstEmail: "FIRST", otherFixes: [{ ...fix, id: "x", label: "No accounts", facts: "Signers need no account." }] })
    expect(p).toContain("FIRST")
    expect(p).toContain("Signers need no account.")
  })
})

describe("Leo", () => {
  it("puts any request to stop under UNSUBSCRIBE", () => {
    expect(classifySystemPrompt()).toMatch(/asks to stop in any way, the category is UNSUBSCRIBE/)
  })
})

describe("social", () => {
  it("gives the facts and the platforms", () => {
    const p = socialUserPrompt({ siteName: "Salsox", productSummary: "SUMMARY", fixes: [fix], platforms: ["X", "LINKEDIN"] })
    expect(p).toContain("SUMMARY")
    expect(p).toContain("Platforms: X, LINKEDIN")
  })
})

describe("social system prompt", () => {
  it("covers TikTok and YouTube, and leaves Reddit to its own prompt", () => {
    const p = socialSystemPrompt("Salsox")
    expect(p).toMatch(/TikTok: for a short video made separately/)
    expect(p).toMatch(/YouTube: for a video made separately/)
    expect(p).toMatch(/return an empty string for them on every other platform/)
    expect(p).not.toMatch(/Reddit/)
  })
})

describe("Reddit prompt", () => {
  it("knows nothing about the product, and forbids pitches and listicles", () => {
    const system = redditSystemPrompt()
    const user = redditUserPrompt({ idea: "clients sign on their phone in under a minute" })
    for (const text of [system, user]) {
      expect(text).not.toMatch(/Salsox|SUMMARY|product facts/i)
    }
    expect(system).toMatch(/Never mention, recommend or hint at any product/)
    expect(system).toMatch(/Never a listicle or article/)
    expect(system).toMatch(/Never a disguised pitch/)
    expect(user).toMatch(/ignore the benefit/)
    expect(redditUserPrompt({})).toMatch(/Pick an everyday situation/)
  })
})
