/**
 * Tests for chargeback recovery arithmetic (dispute-recovery.ts): recover
 * what the platform lost, never more than the transfer still holds, and
 * never a guessed conversion.
 */
import { describe, expect, it } from "vitest"
import { disputeLoss, lostDisputeRecovery } from "./dispute-recovery"

const gbp = { lossCurrency: "gbp", chargeCurrency: "gbp", transferCurrency: "gbp", exchangeRate: null }

describe("disputeLoss", () => {
  it("is the disputed amount plus the dispute fee on a lost dispute", () => {
    // Stripe withdraws £100.00 and charges a £20.00 dispute fee: one balance transaction, net -120.00.
    expect(disputeLoss([{ net: -12_000 }])).toBe(12_000)
  })

  it("nets off anything returned, and never goes below zero", () => {
    expect(disputeLoss([{ net: -12_000 }, { net: 10_000 }])).toBe(2_000)
    expect(disputeLoss([{ net: -12_000 }, { net: 12_000 }])).toBe(0)
    expect(disputeLoss([])).toBe(0)
  })
})

describe("lostDisputeRecovery", () => {
  it("takes back the whole loss when the transfer still holds it", () => {
    expect(lostDisputeRecovery({ ...gbp, loss: 5_000, transferAmount: 10_000, transferReversed: 0 })).toEqual({ amount: 5_000, shortfall: 0 })
  })

  it("is capped at what is left of the transfer, reporting the rest as shortfall", () => {
    // £100 payment, Stripe's £3.35 fee already taken back, then a £120 loss.
    expect(lostDisputeRecovery({ ...gbp, loss: 12_000, transferAmount: 10_000, transferReversed: 335 })).toEqual({ amount: 9_665, shortfall: 2_335 })
  })

  it("recovers nothing from a transfer already fully reversed (refunded)", () => {
    expect(lostDisputeRecovery({ ...gbp, loss: 12_000, transferAmount: 10_000, transferReversed: 10_000 })).toEqual({ amount: 0, shortfall: 12_000 })
  })

  it("converts a loss in the platform's currency back at the charge's rate", () => {
    // A $100 charge on a GBP platform at 0.79: the loss is in GBP, the transfer in USD.
    expect(lostDisputeRecovery({ loss: 7_900, lossCurrency: "gbp", exchangeRate: 0.79, chargeCurrency: "usd", transferCurrency: "usd", transferAmount: 10_000, transferReversed: 0 })).toEqual({ amount: 10_000, shortfall: 0 })
  })

  it("refuses to guess when the loss cannot be stated in the transfer's currency", () => {
    expect(lostDisputeRecovery({ loss: 7_900, lossCurrency: "gbp", exchangeRate: null, chargeCurrency: "usd", transferCurrency: "eur", transferAmount: 10_000, transferReversed: 0 })).toBeNull()
  })
})
