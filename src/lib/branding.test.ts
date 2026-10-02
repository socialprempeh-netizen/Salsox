import { describe, it, expect } from "vitest"

import { brandingRemoved } from "./branding"

describe("brandingRemoved", () => {
  it("hides the badge for the usual ways of saying yes", () => {
    for (const value of ["true", "TRUE", "True", "1", "yes", "on", " true ", "true\n"]) {
      expect(brandingRemoved(value), JSON.stringify(value)).toBe(true)
    }
  })

  it("keeps it when unset, empty, or anything else", () => {
    for (const value of [undefined, "", "false", "0", "no", "remove"]) {
      expect(brandingRemoved(value), JSON.stringify(value)).toBe(false)
    }
  })
})
