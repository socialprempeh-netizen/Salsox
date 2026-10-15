/**
 * Tests for the analytics wrapper (analytics.ts): only short identifiers
 * reach a vendor, and tracking never throws.
 */
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@vercel/analytics", () => ({ track: vi.fn() }))

import { expectPostHog, safeProps, setPostHogClient, track } from "./analytics"

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

describe("PostHog", () => {
  it("holds events sent before the SDK loads, then forwards them and everything after", () => {
    vi.stubGlobal("window", {})
    expectPostHog()
    track("sign_up", { channel: "social", "Email Address": "a@b.co" })
    const capture = vi.fn()
    setPostHogClient({ capture })
    expect(capture).toHaveBeenCalledWith("sign_up", { channel: "social" })
    track("document_sent", { via: "quick_send" })
    expect(capture).toHaveBeenLastCalledWith("document_sent", { via: "quick_send" })
    setPostHogClient(null)
  })

  it("survives the client throwing", () => {
    vi.stubGlobal("window", {})
    setPostHogClient({ capture: () => { throw new Error("blocked") } })
    expect(() => track("cta_clicked")).not.toThrow()
    setPostHogClient(null)
  })
})
