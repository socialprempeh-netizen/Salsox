import { describe, expect, it } from "vitest"
import { redditVoiceProblems } from "./reddit-voice"

const brand = ["Salsox"]

const genuine = {
  title: "How long do you wait for a client to sign before you start the work?",
  body: "Freelance designer here, about four years in. I had a client last month who agreed everything on a call, said the contract looked fine, and then took eleven days to actually sign it. I started anyway because they were a referral, and it worked out, but it made me nervous the whole time.\n\nDo you start once you have a verbal yes and a deposit, or do you hold off completely until the paperwork is signed? Curious where people draw the line.",
}

describe("redditVoiceProblems", () => {
  it("passes a genuine question with no product behind it", () => {
    expect(redditVoiceProblems(genuine, brand)).toEqual([])
  })

  it("catches the brand, tool talk and disclosure", () => {
    const rules = (b: string) => redditVoiceProblems({ title: genuine.title, body: b }, brand).map((p) => p.rule)
    expect(rules("We started using Salsox for this.")).toContain("brand")
    expect(rules("Full disclosure: I work on a tool for this, but here is what helped.")).toContain("pitch")
    expect(rules("Switching to e-signatures fixed it overnight.")).toContain("pitch")
  })

  it("catches a 'solution' that maps onto the product's own pitch", () => {
    const problems = redditVoiceProblems({ title: genuine.title, body: "What fixed it: I send the signing link on WhatsApp and they sign on their phone, no account needed." }, brand)
    expect(problems.filter((p) => p.rule === "pitch").length).toBeGreaterThanOrEqual(2)
  })

  it("catches listicle structure and article formatting", () => {
    const listicle = { title: "5 tips to get contracts signed faster", body: "1. Ask early.\n2. Keep it short.\n3. Follow up.\n\n**Bonus:** be friendly." }
    const rules = redditVoiceProblems(listicle, brand).map((p) => `${p.rule}:${p.detail}`)
    expect(rules).toContain("listicle:numbered points")
    expect(rules).toContain("listicle:an article-style title")
    expect(rules).toContain("format:bold text")
    expect(redditVoiceProblems({ title: "Thoughts?", body: "## My setup\nSome text." }, brand).map((p) => p.detail)).toContain("a heading")
  })
})
