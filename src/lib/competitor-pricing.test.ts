/**
 * Tests for competitor-pricing.ts: the anchor pairs like with like, takes our
 * prices from the Plan rows, and its DocuSign figures match the comparison
 * page that cites the same source.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { DOCUSIGN, anchorRows, formatUsd } from "./competitor-pricing"

const plans = [
  { slug: "starter-monthly", price: 900, interval: "MONTH" },
  { slug: "starter-yearly", price: 9000, interval: "YEAR" },
  { slug: "pro-monthly", price: 1900, interval: "MONTH" },
  { slug: "lifetime", price: 29900, interval: "ONE_TIME" },
]

describe("anchorRows", () => {
  it("pairs the entry plans and the plans that collect payment, priced from the rows", () => {
    expect(anchorRows(plans)).toEqual([
      { tier: "entry", ownMonthlyCents: 900, competitor: DOCUSIGN.personal },
      { tier: "payments", ownMonthlyCents: 1900, competitor: DOCUSIGN.businessPro },
    ])
  })

  it("follows a price change in the rows", () => {
    expect(anchorRows([{ slug: "pro-monthly", price: 2400, interval: "MONTH" }])[0].ownMonthlyCents).toBe(2400)
  })

  it("leaves out a pair whose plan is not offered, instead of inventing a price", () => {
    expect(anchorRows([{ slug: "starter-yearly", price: 9000, interval: "YEAR" }])).toEqual([])
  })
})

describe("formatUsd", () => {
  it("shows whole dollars without cents", () => {
    expect(formatUsd(900)).toBe("$9")
    expect(formatUsd(1950)).toBe("$19.50")
  })
})

describe("DocuSign figures", () => {
  it("are the ones the comparison page cites", () => {
    const page = readFileSync(join(process.cwd(), "content/pages/compare/docusign.md"), "utf8")
    expect(page).toContain(DOCUSIGN.source)
    // The page states yearly totals; the anchor shows the monthly figure DocuSign lists.
    expect(page).toContain(`$${(DOCUSIGN.personal.monthlyCents * 12) / 100} a year`)
    expect(page).toContain(`$${(DOCUSIGN.businessPro.monthlyCents * 12) / 100} per user per year`)
    expect(page).toContain(`${DOCUSIGN.personal.envelopes.count} envelopes a month`)
  })
})
