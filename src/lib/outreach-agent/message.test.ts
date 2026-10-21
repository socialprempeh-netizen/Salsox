import { describe, expect, it } from "vitest"
import { checkEmail, countWords, overlap, quotesLead } from "./message"

const quote = "We pay per envelope and the bill doubled when we added two people"
const filler = (n: number, prefix = "word") => Array.from({ length: n }, (_, i) => `${prefix}${i}`).join(" ")
const initialBody = (extra = 90) => `Hi Sam, I read your review on G2 where you wrote "the bill doubled when we added two people". ${filler(extra)} Ama`

describe("countWords", () => {
  it("counts words across any whitespace", () => {
    expect(countWords(" a  b\nc ")).toBe(3)
  })
})

describe("quotesLead", () => {
  it("finds six consecutive words of the complaint, ignoring case and punctuation", () => {
    expect(quotesLead('You said: "THE BILL doubled, when we added" a lot.', quote)).toBe(true)
  })

  it("rejects a paraphrase or a shorter run", () => {
    expect(quotesLead("your bill went up when the team grew", quote)).toBe(false)
    expect(quotesLead("the bill doubled when we", quote)).toBe(false)
  })
})

describe("overlap", () => {
  it("is high for a copy and low for a fresh email", () => {
    const first = "Thanks for reading this note about envelope pricing and how we handle unlimited documents for small teams"
    expect(overlap(first, first)).toBe(1)
    expect(overlap("A different angle entirely: signers on phones finish faster without creating an account", first)).toBeLessThan(0.1)
  })
})

describe("checkEmail", () => {
  it("passes a good first email", () => {
    expect(checkEmail({ subject: "Your envelope bill", body: initialBody() }, { kind: "initial", quote })).toEqual([])
  })

  it("flags length, links, placeholders, fake replies and a missing quote", () => {
    const problems = checkEmail({ subject: "Re: hello [Name]", body: "Short. See https://x.com" }, { kind: "initial", quote })
    expect(problems.join(" ")).toMatch(/words/)
    expect(problems.join(" ")).toMatch(/link/)
    expect(problems.join(" ")).toMatch(/placeholder/)
    expect(problems.join(" ")).toMatch(/Re:/)
    expect(problems.join(" ")).toMatch(/quote the complaint/)
  })

  it("rejects a follow-up that copies the first email", () => {
    const first = initialBody(60)
    const problems = checkEmail({ subject: "", body: first }, { kind: "followUp", firstBody: first })
    expect(problems.some((p) => p.includes("repeats"))).toBe(true)
  })

  it("passes a fresh follow-up of the right length", () => {
    const body = `One more thought, Sam: if the team grows again, adding people costs nothing extra per document. ${filler(40, "fresh")} Ama`
    expect(checkEmail({ subject: "", body }, { kind: "followUp", firstBody: initialBody() })).toEqual([])
  })
})
