import { describe, expect, it } from "vitest"
import { autoHashtags, EVERGREEN_BY_PLATFORM, EVERGREEN_HASHTAGS, HASHTAG_BUDGET, hashtagsIn, isHashtagPlatform, suggestHashtags, toggleHashtag } from "./hashtags"

const post = "Getting a client to sign a contract shouldn't take a week. Send the link by WhatsApp, they sign on their phone, and you get paid the deposit the same day."

describe("suggestHashtags", () => {
  it("suggests tags for the topics the post actually mentions, most mentioned first", () => {
    const { contextual } = suggestHashtags("FACEBOOK", post)
    expect(contextual[0]).toBe("#Contracts")
    expect(contextual).toEqual(expect.arrayContaining(["#GetPaid"]))
    expect(contextual).not.toContain("#RealEstate")
    expect(contextual).not.toContain("#HR")
  })

  it("always offers the evergreen niche set, within each platform's budget", () => {
    expect(suggestHashtags("FACEBOOK", post).evergreen).toEqual(EVERGREEN_HASHTAGS.slice(0, 5))
    expect(suggestHashtags("X", post).evergreen).toHaveLength(3)
    expect(suggestHashtags("X", post).contextual.length).toBeLessThanOrEqual(3)
    expect(suggestHashtags("X", post).recommended).toBe(2)
    expect(suggestHashtags("FACEBOOK", post).recommended).toBe(4)
  })

  it("never suggests a tag the post already has, or one twice across the lists", () => {
    const tagged = `${post} #Contracts #esignature`
    const s = suggestHashtags("FACEBOOK", tagged)
    expect(s.contextual).not.toContain("#Contracts")
    expect(s.evergreen).not.toContain("#esignature")
    expect(new Set([...s.contextual, ...s.evergreen].map((t) => t.toLowerCase())).size).toBe(s.contextual.length + s.evergreen.length)
    expect(s.recommended).toBe(2)
  })

  it("does not count hashtags as mentions of their topic", () => {
    expect(suggestHashtags("X", "Big news today. #RealEstate").contextual).not.toContain("#PropertyManagement")
  })
})

describe("toggleHashtag", () => {
  it("adds a tag after the text on X, and on its own last line on Facebook", () => {
    expect(toggleHashtag("X", "Sign on your phone.", "#eSign")).toBe("Sign on your phone. #eSign")
    expect(toggleHashtag("FACEBOOK", "Sign on your phone.", "#eSign")).toBe("Sign on your phone.\n\n#eSign")
    expect(toggleHashtag("FACEBOOK", "Sign on your phone.\n\n#eSign", "#SaaS")).toBe("Sign on your phone.\n\n#eSign #SaaS")
  })

  it("removes a tag that is already there, tidily", () => {
    expect(toggleHashtag("FACEBOOK", "Sign on your phone.\n\n#eSign", "#esign")).toBe("Sign on your phone.")
    expect(toggleHashtag("X", "Sign today #eSign #SaaS", "#eSign")).toBe("Sign today #SaaS")
    expect(hashtagsIn("Sign today #eSign and #SaaS")).toEqual(new Set(["esign", "saas"]))
  })
})

describe("every platform but Reddit", () => {
  it("has its own evergreen set and budget, and Reddit has none", () => {
    expect(isHashtagPlatform("REDDIT")).toBe(false)
    for (const platform of ["X", "FACEBOOK", "LINKEDIN", "TIKTOK", "YOUTUBE"] as const) {
      expect(isHashtagPlatform(platform)).toBe(true)
      expect(suggestHashtags(platform, post).evergreen[0]).toBe(EVERGREEN_BY_PLATFORM[platform][0])
    }
    expect(suggestHashtags("TIKTOK", post).evergreen).toContain("#BusinessTok")
    expect(suggestHashtags("LINKEDIN", post).evergreen).not.toContain("#BusinessTok")
  })

  it("puts tags on a line of their own outside X", () => {
    expect(toggleHashtag("LINKEDIN", "Sign on your phone.", "#eSign")).toBe("Sign on your phone.\n\n#eSign")
    expect(toggleHashtag("TIKTOK", "Sign on your phone.\n\n#eSign", "#BusinessTok")).toBe("Sign on your phone.\n\n#eSign #BusinessTok")
  })
})

describe("autoHashtags", () => {
  it("fills the platform's budget with topic tags and evergreen ones", () => {
    const x = autoHashtags("X", "Get a contract signed today.", 280)
    expect(hashtagsIn(x)).toEqual(new Set(["contracts", "esignature"]))
    const fb = autoHashtags("FACEBOOK", post, 5000)
    const tags = [...hashtagsIn(fb)]
    expect(tags).toHaveLength(HASHTAG_BUDGET.FACEBOOK.total)
    expect(tags).toEqual(expect.arrayContaining(["contracts", "esignature", "smallbusiness"]))
    expect(fb.startsWith(post)).toBe(true)
  })

  it("uses evergreen tags alone for a post with no topic, and counts tags already there", () => {
    expect(hashtagsIn(autoHashtags("LINKEDIN", "Big news today.", 3000))).toEqual(new Set(["esignature", "smallbusiness", "productivity"]))
    expect(hashtagsIn(autoHashtags("X", "Big news. #esignature", 280)).size).toBe(2)
    expect(autoHashtags("X", "Big news. #eSign #SaaS", 280)).toBe("Big news. #eSign #SaaS")
  })

  it("never takes the text past its limit", () => {
    const long = "Get a contract signed today. ".repeat(9).trim()
    const out = autoHashtags("X", long, 280)
    expect(out.length).toBeLessThanOrEqual(280)
    expect(out.startsWith(long)).toBe(true)
  })

  it("reads topics from the context it is given", () => {
    const description = "In this video: the steps, start to finish."
    const out = autoHashtags("YOUTUBE", description, 5000, `Landlords: a lease for new tenants\n${description}`)
    expect([...hashtagsIn(out)]).toEqual(expect.arrayContaining(["realestate", "esignature"]))
  })
})
