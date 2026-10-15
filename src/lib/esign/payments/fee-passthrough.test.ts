/**
 * Tests for the processor fee pass-through arithmetic (fee-passthrough.ts):
 * the sender bears exactly the processor's fee, never a markup, never more
 * than the transfer holds, and never a guessed conversion.
 */
import { describe, expect, it } from "vitest"
import { feeInTransferCurrency, processorFeeToRecover } from "./fee-passthrough"

const usd = { feeCurrency: "usd", chargeCurrency: "usd", transferCurrency: "usd", exchangeRate: null }

describe("feeInTransferCurrency", () => {
  it("is the fee as charged when everything is in one currency", () => {
    // 100.00 USD at 2.9% + 30c: Stripe reports 320.
    expect(feeInTransferCurrency({ ...usd, fee: 320 })).toBe(320)
  })

  it("converts back at the charge's own rate when the fee settled in another currency", () => {
    // A 100.00 EUR charge on a USD platform at 1.0850: 10850 USD cents, fee 345 USD cents.
    expect(feeInTransferCurrency({ fee: 345, feeCurrency: "usd", exchangeRate: 1.085, chargeCurrency: "eur", transferCurrency: "eur" })).toBe(318)
  })

  it("refuses to guess when the transfer is in neither currency, or the rate is missing", () => {
    expect(feeInTransferCurrency({ fee: 345, feeCurrency: "usd", exchangeRate: 1.085, chargeCurrency: "eur", transferCurrency: "gbp" })).toBeNull()
    expect(feeInTransferCurrency({ fee: 345, feeCurrency: "usd", exchangeRate: null, chargeCurrency: "eur", transferCurrency: "eur" })).toBeNull()
  })

  it("rejects a fee that is not a whole, non-negative number of minor units", () => {
    expect(feeInTransferCurrency({ ...usd, fee: -1 })).toBeNull()
    expect(feeInTransferCurrency({ ...usd, fee: 3.2 })).toBeNull()
  })

  it("ignores case, as Stripe reports lower case and the app stores upper case", () => {
    expect(feeInTransferCurrency({ fee: 50, feeCurrency: "USD", exchangeRate: null, chargeCurrency: "USD", transferCurrency: "usd" })).toBe(50)
  })
})

/**
 * Who bears the fee, as balances. Stripe's documented flow for a destination
 * charge with no application fee: the charge lands on the platform, Stripe
 * takes its fee from the platform, the whole amount is transferred to the
 * sender. The reversal is the only step pass-through adds.
 */
describe("who bears Stripe's fee on a 100.00 USD Sign & Pay payment", () => {
  const amount = 10_000
  const stripeFee = 320
  const ledger = (reversal: number) => ({
    platform: amount - stripeFee - amount + reversal,
    sender: amount - reversal,
    signerPays: amount,
  })

  it("before: the platform paid it, the sender kept everything", () => {
    expect(ledger(0)).toEqual({ platform: -320, sender: 10_000, signerPays: 10_000 })
  })

  it("after: the sender bears exactly the fee and the platform nets zero, no markup", () => {
    const reversal = processorFeeToRecover({ ...usd, fee: stripeFee, transferAmount: amount, transferReversed: 0 })!
    expect(ledger(reversal)).toEqual({ platform: 0, sender: 9_680, signerPays: 10_000 })
  })
})

describe("processorFeeToRecover", () => {
  it("takes exactly the fee: no markup", () => {
    expect(processorFeeToRecover({ ...usd, fee: 320, transferAmount: 10_000, transferReversed: 0 })).toBe(320)
  })

  it("never takes more than is left of the transfer", () => {
    expect(processorFeeToRecover({ ...usd, fee: 320, transferAmount: 10_000, transferReversed: 9_900 })).toBe(100)
    expect(processorFeeToRecover({ ...usd, fee: 320, transferAmount: 10_000, transferReversed: 10_000 })).toBe(0)
  })

  it("is null when the fee cannot be stated in the transfer's currency", () => {
    expect(processorFeeToRecover({ fee: 345, feeCurrency: "usd", exchangeRate: null, chargeCurrency: "eur", transferCurrency: "eur", transferAmount: 10_000, transferReversed: 0 })).toBeNull()
  })
})
