/** The review rule: three drafts first, then auto-publish unless review is forced. */
import { describe, expect, it } from "vitest"
import { REVIEW_FIRST, reviewsLeft, shouldAutoPublish } from "./policy"

describe("shouldAutoPublish", () => {
  it("keeps the first three articles as drafts", () => {
    expect(REVIEW_FIRST).toBe(3)
    for (const writtenBefore of [0, 1, 2]) expect(shouldAutoPublish({ writtenBefore, draftFirst: false })).toBe(false)
  })

  it("publishes the fourth and later articles", () => {
    expect(shouldAutoPublish({ writtenBefore: 3, draftFirst: false })).toBe(true)
    expect(shouldAutoPublish({ writtenBefore: 40, draftFirst: false })).toBe(true)
  })

  it("never publishes by itself in draft-first mode", () => {
    expect(shouldAutoPublish({ writtenBefore: 10, draftFirst: true })).toBe(false)
  })
})

describe("reviewsLeft", () => {
  it("counts down to zero and stays there", () => {
    expect([0, 1, 2, 3, 9].map(reviewsLeft)).toEqual([3, 2, 1, 0, 0])
  })
})

describe("dailyMode", () => {
  it("writes pages by default, and articles only when switched back on", async () => {
    const { dailyMode } = await import("./policy")
    expect(dailyMode({})).toBe("pages")
    expect(dailyMode({ SEO_AGENT_MODE: "pages" })).toBe("pages")
    expect(dailyMode({ SEO_AGENT_MODE: " Articles " })).toBe("articles")
    expect(dailyMode({ SEO_AGENT_MODE: "anything else" })).toBe("pages")
  })
})
