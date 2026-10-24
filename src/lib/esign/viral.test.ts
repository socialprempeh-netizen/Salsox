/**
 * Tests for the "Signed via" signup links (viral.ts): they keep the
 * post-signup destination and carry the UTM tags attribution reads.
 */
import { describe, expect, it } from "vitest"
import { classifyChannel } from "@/lib/seo/attribution"
import { signedViaHref } from "./viral"

describe("signedViaHref", () => {
  it("keeps the Quick Send destination and adds the campaign tags", () => {
    const url = new URL(signedViaHref("signing_page"), "https://example.com")
    expect(url.pathname).toBe("/signup")
    expect(url.searchParams.get("next")).toBe("/dashboard/documents/quick-send")
    expect(url.searchParams.get("utm_source")).toBe("signing_page")
    expect(url.searchParams.get("utm_medium")).toBe("referral")
    expect(url.searchParams.get("utm_campaign")).toBe("signed_via")
  })

  it("tags the signed PDF's link as its own source and medium", () => {
    const url = new URL(signedViaHref("signed_pdf", "https://app.example.com"))
    expect(url.searchParams.get("utm_source")).toBe("signed_pdf")
    expect(url.searchParams.get("utm_medium")).toBe("document")
    expect(url.searchParams.get("utm_campaign")).toBe("signed_via")
  })

  it("is absolute when given a base, for emails", () => {
    expect(signedViaHref("completed_email", "https://app.example.com")).toMatch(/^https:\/\/app\.example\.com\/signup\?/)
  })

  it("is attributed to email from the email, and to the campaign from the signing page", () => {
    const utmOf = (href: string) => {
      const q = new URL(href, "https://example.com").searchParams
      return { source: q.get("utm_source") ?? undefined, medium: q.get("utm_medium") ?? undefined, campaign: q.get("utm_campaign") ?? undefined }
    }
    expect(classifyChannel({ ref: null, utm: utmOf(signedViaHref("completed_email")) })).toBe("email")
    expect(classifyChannel({ ref: null, utm: utmOf(signedViaHref("signing_page")) })).toBe("campaign")
  })
})
