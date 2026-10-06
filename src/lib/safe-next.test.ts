/**
 * Tests for the post-signup redirect (safe-next.ts): dashboard paths pass,
 * every open-redirect trick falls back to the dashboard.
 */
import { describe, expect, it } from "vitest"
import { DEFAULT_AFTER_SIGNUP, safeNext } from "./safe-next"

describe("safeNext", () => {
  it("allows dashboard paths with a simple query", () => {
    expect(safeNext("/dashboard/documents/quick-send?draft=1")).toBe("/dashboard/documents/quick-send?draft=1")
    expect(safeNext("/dashboard")).toBe("/dashboard")
  })

  it("refuses anything that could leave the site or the dashboard", () => {
    for (const bad of ["https://evil.test", "//evil.test", "/\\evil.test", "/dashboard//evil.test", "/login", "/dashboard/../x", "javascript:alert(1)", "", null, 42, "/dashboard?next=https://x"]) {
      expect(safeNext(bad), String(bad)).toBe(DEFAULT_AFTER_SIGNUP)
    }
  })
})
