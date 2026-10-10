/**
 * Tests for the checks that run before prisma/set-live-stripe-prices.ts
 * writes price IDs (stripe-price-assignment.ts): what is updated, what is
 * left alone, and every case that must block the whole run.
 */
import { describe, expect, it } from "vitest"
import { describeAssignment, hasBlockingResult, isStripePriceId, planPriceAssignments, type PlanPriceRow, type PriceAssignment } from "./stripe-price-assignment"

const rows: PlanPriceRow[] = [
  { slug: "starter-monthly", interval: "MONTH", stripePriceId: "price_starter_placeholder" },
  { slug: "starter-yearly", interval: "YEAR", stripePriceId: "price_starter_yearly_placeholder" },
  { slug: "lifetime", interval: "ONE_TIME", stripePriceId: "price_1Lifetime0000Abc" },
]

const A = "price_1UOnmV5ijGZmZ4fBW0Av4HhY"
const B = "price_1UOnqd5ijGZmZ4fBQLUzzCGE"

describe("isStripePriceId", () => {
  it("accepts a real price ID and rejects placeholders and junk", () => {
    expect(isStripePriceId(A)).toBe(true)
    expect(isStripePriceId("price_starter_placeholder")).toBe(false)
    expect(isStripePriceId("prod_1UOnmV5ijGZmZ4fB")).toBe(false)
    expect(isStripePriceId(`${A} `)).toBe(false)
    expect(isStripePriceId("")).toBe(false)
  })
})

describe("planPriceAssignments", () => {
  it("updates a plan holding something else, and leaves one already right alone", () => {
    const results = planPriceAssignments(
      [
        { slug: "starter-monthly", interval: "MONTH", priceId: A },
        { slug: "lifetime", interval: "ONE_TIME", priceId: "price_1Lifetime0000Abc" },
      ],
      rows
    )
    expect(results).toEqual([
      { slug: "starter-monthly", action: "update", from: "price_starter_placeholder", to: A },
      { slug: "lifetime", action: "unchanged", to: "price_1Lifetime0000Abc" },
    ])
    expect(hasBlockingResult(results)).toBe(false)
  })

  it("blocks a slug the database does not have", () => {
    const [r] = planPriceAssignments([{ slug: "personal-monthly", interval: "MONTH", priceId: A }], rows)
    expect(r.action).toBe("missing")
  })

  it("blocks a price listed for another interval than the plan bills", () => {
    const [r] = planPriceAssignments([{ slug: "starter-yearly", interval: "MONTH", priceId: A }], rows)
    expect(r).toMatchObject({ action: "wrongInterval", expected: "MONTH", actual: "YEAR" })
  })

  it("blocks a malformed ID, a placeholder, and the same ID listed twice", () => {
    const twice: PriceAssignment[] = [
      { slug: "starter-monthly", interval: "MONTH", priceId: B },
      { slug: "starter-yearly", interval: "YEAR", priceId: B },
    ]
    expect(planPriceAssignments(twice, rows).map((r) => r.action)).toEqual(["invalidPriceId", "invalidPriceId"])
    expect(planPriceAssignments([{ slug: "starter-monthly", interval: "MONTH", priceId: "price_x_placeholder" }], rows)[0].action).toBe("invalidPriceId")
  })

  it("blocks an ID another plan already holds", () => {
    const [r] = planPriceAssignments([{ slug: "starter-monthly", interval: "MONTH", priceId: "price_1Lifetime0000Abc" }], rows)
    expect(r).toMatchObject({ action: "taken", heldBy: "lifetime" })
  })

  it("lets one blocked assignment stop the whole run", () => {
    const results = planPriceAssignments(
      [
        { slug: "starter-monthly", interval: "MONTH", priceId: A },
        { slug: "nope", interval: "MONTH", priceId: B },
      ],
      rows
    )
    expect(hasBlockingResult(results)).toBe(true)
  })
})

describe("describeAssignment", () => {
  it("says what changes, and why a blocked one is blocked", () => {
    expect(describeAssignment({ slug: "s", action: "update", from: "a", to: "b" })).toBe("s: a -> b")
    expect(describeAssignment({ slug: "s", action: "taken", to: "b", heldBy: "t" })).toContain("BLOCKED")
  })
})
