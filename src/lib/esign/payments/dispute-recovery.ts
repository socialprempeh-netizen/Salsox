/**
 * Sign & Pay chargeback recovery: how much to take back from the sender
 * after a dispute is lost.
 *
 * Why this exists: Sign & Pay charges are destination charges, so when a
 * payer's bank wins a chargeback Stripe debits the PLATFORM's balance, with
 * or without on_behalf_of, while the payment itself had been transferred to
 * the sender. Without recovery Salsox carried every lost dispute. The Terms
 * make the sender responsible for a dispute's cost; recovery is a transfer
 * reversal against the transfer that paid them.
 *
 * Only on a LOST dispute: reversing when one opens would have to be undone
 * by hand for every dispute won.
 *
 * The amount is what the platform actually lost, read from the dispute's
 * own balance transactions (the disputed amount plus Stripe's dispute fee,
 * less anything returned), stated in the transfer's currency, and capped at
 * what is left of the transfer. A transfer reversal cannot take more than
 * the transfer: when the loss is larger (the dispute fee on top of a full
 * payment, or a processor fee already taken back), the difference stays
 * with the platform and is reported as the shortfall.
 *
 * Pure: the numbers come in as arguments so the rules are tested.
 */
import { feeInTransferCurrency } from "./fee-passthrough"

export type DisputeLossInputs = {
  /** The platform's loss on the dispute (positive, minor units), in `lossCurrency`. */
  loss: number
  lossCurrency: string
  /** The charge's exchange rate into the platform's balance currency; null when there was no conversion. */
  exchangeRate: number | null
  chargeCurrency: string
  transferCurrency: string
  transferAmount: number
  transferReversed: number
}

/**
 * What to reverse, and what of the loss stays uncovered, in the transfer's
 * currency. Null when the loss cannot be stated in the transfer's currency
 * without guessing (nothing is reversed; it is reported instead).
 */
export function lostDisputeRecovery(i: DisputeLossInputs): { amount: number; shortfall: number } | null {
  const loss = feeInTransferCurrency({
    fee: i.loss,
    feeCurrency: i.lossCurrency,
    exchangeRate: i.exchangeRate,
    chargeCurrency: i.chargeCurrency,
    transferCurrency: i.transferCurrency,
  })
  if (loss === null) return null
  const remaining = Math.max(0, i.transferAmount - i.transferReversed)
  const amount = Math.min(loss, remaining)
  return { amount, shortfall: loss - amount }
}

/**
 * The platform's loss from a dispute's balance transactions: the sum of
 * their nets, sign flipped (a lost dispute's withdrawal and its fee are
 * negative; anything returned is positive). Never below zero.
 */
export function disputeLoss(balanceTransactions: { net: number }[]): number {
  return Math.max(0, -balanceTransactions.reduce((sum, b) => sum + b.net, 0))
}
