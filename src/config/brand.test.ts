import { describe, expect, it } from "vitest"
import { landingPalette, landingPaletteCss } from "@/config/brand"

/**
 * The public pages' palette (landingPalette in brand.ts), held to the audit
 * it came from: eight colours and no others, applied only inside
 * `.brand-landing`, with the dark theme's surfaces left alone.
 *
 * Tests run with KIT_SITE unset, so this is the product's palette; on the
 * kit's own site both values are empty and nothing here applies.
 */
describe("landingPalette", () => {
  it("is exactly the eight audited colours", () => {
    expect(Object.values(landingPalette ?? {}).sort()).toEqual(
      ["#0B3D3A", "#0F0F19", "#11928F", "#4C1D95", "#6B7280", "#E5F3F4", "#F8F7F3", "#FFFFFF"],
    )
  })

  it("introduces no hex colour outside the palette", () => {
    const allowed = new Set([...Object.values(landingPalette ?? {}), "#000000", "#ffffff"].map((c) => c.toLowerCase()))
    // #000000 and #ffffff only appear as mixing ends for the hover shades.
    const used = landingPaletteCss().match(/#[0-9a-fA-F]{6}\b/g) ?? []
    for (const hex of used) expect(allowed.has(hex.toLowerCase()), hex).toBe(true)
  })
})

describe("landingPaletteCss", () => {
  const css = landingPaletteCss()

  it("only styles inside .brand-landing", () => {
    const selectors = [...css.matchAll(/(^|\})([^{}]+)\{/g)].map((m) => m[2])
    expect(selectors.length).toBeGreaterThan(0)
    for (const s of selectors) expect(s).toMatch(/\.brand-landing$/)
  })

  it("puts the dark teal on buttons and headlines in light mode, the bright teal in dark", () => {
    expect(css).toMatch(/:root:not\(\.dark\) \.brand-landing\{[^}]*--primary:#0B3D3A/)
    expect(css).toMatch(/:root:not\(\.dark\) \.brand-landing\{[^}]*--foreground:#0B3D3A/)
    expect(css).toMatch(/\.dark \.brand-landing\{[^}]*--primary:#11928F/)
  })

  it("redeclares the shades derived from the primary, so they follow it", () => {
    // Inherited from :root they would still be mixed from the env primary.
    expect(css).toMatch(/:root:not\(\.dark\) \.brand-landing\{[^}]*--primary-hover:color-mix\(in srgb, #0B3D3A/)
    expect(css).toMatch(/\.dark \.brand-landing\{[^}]*--primary-hover:color-mix\(in srgb, #11928F/)
  })

  it("leaves the dark theme's surfaces to the theme", () => {
    const dark = css.slice(css.indexOf(".dark .brand-landing{"))
    expect(dark).not.toMatch(/--background:#|--card:#|--foreground:#/)
  })
})
