/**
 * Tests for the analytics wrapper (analytics.ts): only short identifiers
 * reach a vendor, and tracking never throws.
 */
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@vercel/analytics", () => ({ track: vi.fn() }))

import { safeProps, track } from "./analytics"

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("safeProps", () => {
  it("drops keys that are not short identifiers and clips long values", () => {
    expect(safeProps({ tool: "sign-pdf", "File Name": "secret.pdf", location: "x".repeat(300) })).toEqual({ tool: "sign-pdf", location: "x".repeat(100) })
  })
})

describe("track", () => {
  it("forwards to gtag when present, and survives it throwing", () => {
    const gtag = vi.fn()
    vi.stubGlobal("window", { gtag })
    track("tool_opened", { tool: "sign-pdf" })
    expect(gtag).toHaveBeenCalledWith("event", "tool_opened", { tool: "sign-pdf" })

    vi.stubGlobal("window", { gtag: () => { throw new Error("blocked") } })
    expect(() => track("cta_clicked")).not.toThrow()
  })
})
