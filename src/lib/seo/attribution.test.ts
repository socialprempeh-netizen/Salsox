/**
 * Tests for signup attribution (attribution.ts): channels are classified the
 * way analytics tools classify them, only the referrer host is kept, and a
 * tampered cookie is ignored rather than trusted.
 */
import { describe, expect, it } from "vitest"
import { buildTouch, classifyChannel, parseTouch, readCookie, serializeTouch } from "./attribution"

const now = new Date("2026-10-06T10:00:00Z")
const touch = (referrer: string, search = "", pathname = "/sign-pdf") => buildTouch({ pathname, search, referrer, ownHost: "salsox.test", now })

describe("buildTouch", () => {
  it("keeps the landing path, the referrer host and utm tags, nothing more", () => {
    expect(touch("https://www.google.com/search?q=sign+pdf+secret", "?utm_source=x&utm_medium=cpc&other=1")).toEqual({
      lp: "/sign-pdf",
      ref: "www.google.com",
      utm: { source: "x", medium: "cpc" },
      at: "2026-10-06T10:00:00.000Z",
    })
  })

  it("treats navigation inside the site as no referrer", () => {
    expect(touch("https://salsox.test/pricing").ref).toBeNull()
  })
})

describe("classifyChannel", () => {
  it("search engines without paid tags are organic", () => {
    for (const ref of ["https://www.google.com/", "https://www.google.com.gh/", "https://www.bing.com/", "https://duckduckgo.com/", "https://search.brave.com/"]) {
      expect(classifyChannel(touch(ref))).toBe("organic_search")
    }
  })

  it("paid, social, email, referral, campaign and direct", () => {
    expect(classifyChannel(touch("https://www.google.com/", "?utm_medium=cpc"))).toBe("paid_search")
    expect(classifyChannel(touch("https://t.co/abc"))).toBe("social")
    expect(classifyChannel(touch("", "?utm_medium=email&utm_source=newsletter"))).toBe("email")
    expect(classifyChannel(touch("https://someblog.example/post"))).toBe("referral")
    expect(classifyChannel(touch("", "?utm_source=partner"))).toBe("campaign")
    expect(classifyChannel(touch(""))).toBe("direct")
    expect(classifyChannel(null)).toBe("direct")
  })
})

describe("cookie round trip", () => {
  it("serializes and parses back", () => {
    const t = touch("https://www.bing.com/")
    expect(parseTouch(serializeTouch(t))).toEqual(t)
    expect(readCookie(`a=1; sx_src=${serializeTouch(t)}; b=2`, "sx_src")).toBe(serializeTouch(t))
  })

  it("ignores malformed or oversized values", () => {
    expect(parseTouch("not json")).toBeNull()
    expect(parseTouch(encodeURIComponent(JSON.stringify({ lp: "https://evil.test", at: "x" })))).toBeNull()
    expect(parseTouch("x".repeat(2000))).toBeNull()
    expect(parseTouch(null)).toBeNull()
  })
})
