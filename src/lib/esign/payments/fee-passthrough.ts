/**
 * Sign & Pay processor fee pass-through: the arithmetic.
 *
 * Why this exists: with Stripe destination charges, Stripe takes its fee from
 * the PLATFORM's balance while the whole payment is transferred to the
 * sender. With no platform fee configured (SIGN_AND_PAY_FEE_BPS unset), that
 * left Salsox paying Stripe's fee on every Sign & Pay payment. The model is
 * pass-through at cost, no markup: the sender bears exactly what the
 * processor charged, nothing more.
 *
 * Stripe's fee varies by card, country and currency, and is only known once
 * the charge exists, so it cannot be set up front as an application fee
 * without guessing. It is read from the charge's balance transaction after
 * the payment succeeds, and taken back from the transfer to the sender as a
 * transfer reversal (src/lib/esign/payments/stripe.ts). Paystack needs none
 * of this: `bearer: "subaccount"` already makes the sender's subaccount pay
 * Paystack's fee at settlement.
 *
 * Pure: the numbers come in as arguments so the rules are tested.
 */

export type FeeInputs = {
  /** The processor's fee on the charge, in the balance transaction's currency (minor units). */
  fee: number
  /** The balance transaction's currency, lower case as Stripe reports it. */
  feeCurrency: string
  /** Balance transaction currency units per one unit of the charge currency; null when there was no conversion. */
  exchangeRate: number | null
  /** The charge's (presentment) currency. */
  chargeCurrency: string
  /** The currency of the transfer to the sender. */
  transferCurrency: string
  /** The transfer's amount, and how much of it has already been reversed (minor units). */
  transferAmount: number
  transferReversed: number
}

/**
 * The fee expressed in the transfer's currency, or null when it cannot be
 * stated there without guessing.
 *
 * Same currency: the fee as charged, to the unit. Fee in the platform's
 * settlement currency and transfer in the charge currency: converted back at
 * the charge's own exchange rate (Stripe defines balance amount = charge
 * amount x rate), rounded to the nearest minor unit, so the difference is at
 * most half a cent either way. Any other combination is refused rather than
 * approximated: the platform keeps the fee on that payment and it is reported.
 */
export function feeInTransferCurrency(i: Pick<FeeInputs, "fee" | "feeCurrency" | "exchangeRate" | "chargeCurrency" | "transferCurrency">): number | null {
  if (!Number.isInteger(i.fee) || i.fee < 0) return null
  const fee = i.feeCurrency.toLowerCase()
  const transfer = i.transferCurrency.toLowerCase()
  if (fee === transfer) return i.fee
  if (transfer === i.chargeCurrency.toLowerCase() && i.exchangeRate && i.exchangeRate > 0) {
    return Math.round(i.fee / i.exchangeRate)
  }
  return null
}

/**
 * How much to take back from the sender's transfer: the fee in the
 * transfer's currency, never more than what is left of the transfer.
 * Null when the fee cannot be stated in the transfer's currency.
 */
export function processorFeeToRecover(i: FeeInputs): number | null {
  const fee = feeInTransferCurrency(i)
  if (fee === null) return null
  const remaining = Math.max(0, i.transferAmount - i.transferReversed)
  return Math.min(fee, remaining)
}
