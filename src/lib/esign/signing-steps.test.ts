/**
 * Tests for signing steps (signing-steps.ts): editor flags to orders and
 * back, and the done/current/upcoming state of each step, including steps
 * shared by several people, viewers and copy recipients outside the order,
 * and a decline stopping what comes after it.
 */
import { describe, expect, it } from "vitest"
import type { RecipientRole, SigningStatus } from "@prisma/client"
import { joinFlagsFromOrders, ordersFromSteps, signingSteps, stepNumbers } from "./signing-steps"

const r = (role: RecipientRole, joinPrevious = false) => ({ role, joinPrevious })

describe("ordersFromSteps", () => {
  it("numbers each signer or approver as its own step by default", () => {
    expect(ordersFromSteps([r("APPROVER"), r("SIGNER"), r("SIGNER")])).toEqual([1, 2, 3])
  })

  it("puts a recipient that joins the previous one on the same step", () => {
    expect(ordersFromSteps([r("APPROVER"), r("SIGNER"), r("SIGNER", true), r("SIGNER")])).toEqual([1, 2, 2, 3])
  })

  it("ignores a join flag on the first signer or approver", () => {
    expect(ordersFromSteps([r("SIGNER", true), r("SIGNER", true)])).toEqual([1, 1])
    expect(ordersFromSteps([r("VIEWER"), r("SIGNER", true), r("SIGNER")])).toEqual([0, 1, 2])
  })

  it("never makes a viewer or copy recipient a step of its own", () => {
    expect(ordersFromSteps([r("SIGNER"), r("CC"), r("SIGNER"), r("VIEWER", true)])).toEqual([1, 1, 2, 2])
  })
})

describe("joinFlagsFromOrders", () => {
  it("is the inverse of ordersFromSteps", () => {
    const list = [r("APPROVER"), r("SIGNER"), r("CC"), r("SIGNER", true), r("SIGNER")]
    const orders = ordersFromSteps(list)
    const back = joinFlagsFromOrders(list.map((x, i) => ({ role: x.role, order: orders[i] })))
    expect(back).toEqual([false, false, false, true, false])
  })

  it("reads the old numbering (0, 1, 2) as one person per step", () => {
    expect(joinFlagsFromOrders([{ role: "SIGNER", order: 0 }, { role: "SIGNER", order: 1 }, { role: "SIGNER", order: 2 }])).toEqual([false, false, false])
  })
})

describe("signingSteps", () => {
  const p = (name: string, role: RecipientRole, order: number, signingStatus: SigningStatus = "NOT_SIGNED") => ({ name, role, order, signingStatus })

  it("groups shared orders into one step and marks progress", () => {
    const people = [p("Efua", "APPROVER", 1, "SIGNED"), p("Kofi", "SIGNER", 2), p("Ama", "SIGNER", 2, "SIGNED"), p("Esi", "SIGNER", 3), p("Copy", "CC", 3)]
    const steps = signingSteps(people, "SEQUENTIAL")
    expect(steps.map((s) => [s.number, s.state, s.recipients.map((x) => x.name)])).toEqual([
      [1, "done", ["Efua"]],
      [2, "current", ["Kofi", "Ama"]],
      [3, "upcoming", ["Esi"]],
    ])
  })

  it("treats a parallel document as one step", () => {
    const steps = signingSteps([p("Kofi", "SIGNER", 0), p("Ama", "SIGNER", 1, "SIGNED")], "PARALLEL")
    expect(steps).toHaveLength(1)
    expect(steps[0].state).toBe("current")
  })

  it("marks every step done when everyone has signed", () => {
    const steps = signingSteps([p("Kofi", "SIGNER", 1, "SIGNED"), p("Ama", "SIGNER", 2, "SIGNED")], "SEQUENTIAL")
    expect(steps.map((s) => s.state)).toEqual(["done", "done"])
  })

  it("leaves nothing current after a decline", () => {
    const steps = signingSteps([p("Kofi", "SIGNER", 1, "REJECTED"), p("Ama", "SIGNER", 2)], "SEQUENTIAL")
    expect(steps.map((s) => s.state)).toEqual(["current", "upcoming"])
  })

  it("gives viewers and copy recipients no step number", () => {
    const people = [p("Kofi", "SIGNER", 1), p("Copy", "CC", 1), p("Ama", "SIGNER", 2)]
    const numbers = stepNumbers(people, "SEQUENTIAL")
    expect([numbers.get(people[0]), numbers.get(people[1]), numbers.get(people[2])]).toEqual([1, undefined, 2])
  })
})
