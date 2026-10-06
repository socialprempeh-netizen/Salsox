/**
 * Tests for the header-free locale of the root layout (static-locale.ts).
 */
import { describe, expect, it } from "vitest"
import { singleLocale } from "./static-locale"
import { routing } from "./routing"

describe("singleLocale", () => {
  it("is the default locale when it is the only one", () => {
    expect(singleLocale(["en"], "en")).toBe("en")
  })

  it("is null as soon as there is a second locale, so the request decides", () => {
    expect(singleLocale(["en", "it"], "en")).toBeNull()
  })

  // The landing page's caching depends on this: if it starts returning null,
  // every public page goes back to rendering per request.
  it("lets this deployment's root layout skip the request", () => {
    expect(singleLocale(routing.locales, routing.defaultLocale)).toBe(routing.defaultLocale)
  })
})
