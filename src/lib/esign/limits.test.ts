import { describe, it, expect } from "vitest"

import {
  DEFAULT_EXPIRY_DAYS,
  MAX_EXPIRY_DAYS,
  MAX_PDF_BYTES,
  MAX_PDF_MB,
  parseExpiryChoice,
  SERVER_ACTION_BODY_LIMIT,
} from "./limits"

describe("PDF cap", () => {
  it("states the same cap in bytes and in megabytes", () => {
    expect(MAX_PDF_MB * 1024 * 1024).toBe(MAX_PDF_BYTES)
  })

  // The action body carries the PDF plus the form around it, and Vercel
  // refuses anything over 4.5 MB before the app sees it.
  it("leaves the server-action limit above the cap and under Vercel's ceiling", () => {
    const mb = Number.parseFloat(SERVER_ACTION_BODY_LIMIT)
    expect(mb).toBeGreaterThan(MAX_PDF_MB)
    expect(mb).toBeLessThan(4.5)
  })
})

describe("parseExpiryChoice", () => {
  it("reads never as no expiry", () => {
    expect(parseExpiryChoice("never")).toBeNull()
  })

  it("keeps a valid number of days", () => {
    expect(parseExpiryChoice("14")).toBe(14)
  })

  it("clamps to the allowed range", () => {
    expect(parseExpiryChoice("0")).toBe(1)
    expect(parseExpiryChoice("9999")).toBe(MAX_EXPIRY_DAYS)
  })

  it("falls back to the default when missing or unreadable", () => {
    expect(parseExpiryChoice(null)).toBe(DEFAULT_EXPIRY_DAYS)
    expect(parseExpiryChoice("soon")).toBe(DEFAULT_EXPIRY_DAYS)
  })
})
