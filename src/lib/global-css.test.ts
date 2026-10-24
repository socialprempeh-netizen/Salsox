/**
 * Guards the border-colour fix from after the PandaDoc-style redesign
 * (761d5b4): globals.css set `* { border-color: var(--border) }` outside any
 * cascade layer, and unlayered CSS outranks every layer, Tailwind's utilities
 * included, so every border-colour class (border-primary, border-l-amber-500,
 * border-destructive, ...) rendered as the same grey across the site.
 *
 * The rule now lives in @layer base. This test fails if a border colour is
 * ever set again on a bare element or universal selector outside a layer,
 * which is the one shape of rule that silently overrides the utilities.
 */
import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

type Rule = { selector: string; body: string; layers: string[] }

/** The style rules of a stylesheet with the @-blocks they sit in, comments removed. */
function rules(css: string): Rule[] {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, "")
  const out: Rule[] = []
  const stack: string[] = []
  let buffer = ""
  for (const char of source) {
    if (char === "{") {
      stack.push(buffer.trim())
      buffer = ""
    } else if (char === "}") {
      const selector = stack.pop() ?? ""
      if (!selector.startsWith("@") && buffer.trim()) out.push({ selector, body: buffer, layers: stack.filter((s) => s.startsWith("@layer")) })
      buffer = ""
    } else buffer += char
  }
  return out
}

describe("globals.css border colours", () => {
  const css = fs.readFileSync(path.join(process.cwd(), "src", "app", "globals.css"), "utf8")

  it("sets the default border colour inside @layer base", () => {
    const universal = rules(css).filter((r) => r.selector === "*" && /(^|[;\s])border-color\s*:/.test(r.body))
    expect(universal.length).toBeGreaterThan(0)
    for (const r of universal) expect(r.layers.some((l) => /@layer\s+base/.test(l)), "the * border-color rule must be in @layer base").toBe(true)
  })

  it("has no unlayered rule that colours borders on bare elements, which would beat the utilities", () => {
    const offenders = rules(css).filter(
      (r) => r.layers.length === 0 && /^(\*|[a-z][a-z0-9]*)(\s*,\s*(\*|::?[a-z-]+|[a-z][a-z0-9]*))*$/.test(r.selector) && /(^|[;\s])border(-[a-z]+)?-color\s*:|(^|[;\s])border\s*:[^;]*(#|rgb|hsl|var\()/.test(r.body)
    )
    expect(offenders.map((r) => r.selector)).toEqual([])
  })
})
