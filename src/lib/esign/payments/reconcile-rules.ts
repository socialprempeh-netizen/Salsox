/**
 * What to do with a Sign & Pay payment once the provider has been asked about
 * it, as pure functions. The calls themselves are in reconcile.ts.
 *
 * A payment used to have two fates: marked PAID when the provider said so, or
 * left PENDING forever when nobody came back to check. Three things were
 * missing: a payment that completes after its document was cancelled or
 * expired was kept (the sender had closed the deal, the signer had paid for
 * it anyway); a second checkout for a document already paid was kept too; and
 * a checkout nobody finished stayed "pending" indefinitely.
 */

/** How long a checkout may stay unanswered before it counts as abandoned. */
export const ABANDON_AFTER_MS = 48 * 60 * 60 * 1000

/** How old a pending payment must be before the sweep asks about it. */
export const RECHECK_AFTER_MS = 10 * 60 * 1000

/** How long a just-created payment may lack its checkout URL before it is retried. */
export const CHECKOUT_SETUP_GRACE_MS = 60 * 1000

export type Settlement =
  /** The provider has it, it is ours, and the document still wants it. */
  | { action: "markPaid" }
  /** Paid, but for a document that no longer takes it: give it back. */
  | { action: "refund"; reason: "documentClosed" | "duplicate" }
  /** Failed, abandoned, or not the amount we asked for. */
  | { action: "markFailed"; reason: "providerFailed" | "mismatch" | "abandoned" }
  /** Still open at the provider: ask again later. */
  | { action: "wait" }

export function settlement(input: {
  verified: "PAID" | "PENDING" | "FAILED"
  /** Amount and currency agree with what was charged for. */
  matches: boolean
  /** Status of the document the payment is for. */
  documentStatus: string
  /** Another payment by the same recipient is already PAID. */
  alreadyPaid: boolean
  /** Time since the payment row was created. */
  ageMs: number
}): Settlement {
  if (input.verified === "FAILED") return { action: "markFailed", reason: "providerFailed" }
  if (input.verified === "PAID") {
    if (!input.matches) return { action: "markFailed", reason: "mismatch" }
    if (input.alreadyPaid) return { action: "refund", reason: "duplicate" }
    // A pending document is the only one still collecting. A completed one
    // was finished without this payment, which only a duplicate can be.
    if (input.documentStatus !== "PENDING") return { action: "refund", reason: "documentClosed" }
    return { action: "markPaid" }
  }
  if (input.ageMs >= ABANDON_AFTER_MS) return { action: "markFailed", reason: "abandoned" }
  return { action: "wait" }
}

/**
 * What `startPayment` does when the recipient already has a payment in
 * flight, instead of opening a second checkout for the same document.
 */
export type ExistingCheckout =
  | { action: "resume"; url: string }
  | { action: "inProgress" }
  | { action: "replace" }

export function existingCheckout(input: {
  /** The provider's answer about the payment in flight, after reconciling it. */
  status: "PENDING" | "PAID" | "FAILED" | "REFUNDED"
  /** The checkout URL recorded when it was opened, if it got that far. */
  url: string | null
  ageMs: number
}): ExistingCheckout | { action: "paid" } {
  if (input.status === "PAID") return { action: "paid" }
  if (input.status !== "PENDING") return { action: "replace" }
  if (input.url) return { action: "resume", url: input.url }
  // Created a moment ago by another request that is still talking to the
  // provider: wait for it rather than open a second checkout.
  if (input.ageMs < CHECKOUT_SETUP_GRACE_MS) return { action: "inProgress" }
  // Created long ago and never given a URL: that request died. Replace it.
  return { action: "replace" }
}
