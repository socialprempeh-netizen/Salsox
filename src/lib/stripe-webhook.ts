/**
 * The signing secrets a Stripe webhook may be verified with, and what an
 * event's origin means for Sign & Pay. Pure, tested in stripe-webhook.test.ts.
 *
 * Stripe signs events from the platform's own account with the platform
 * endpoint's secret (STRIPE_WEBHOOK_SECRET). Events that happen on a
 * connected account, which is where Sign & Pay's direct charges live
 * (src/lib/esign/payments/charge-mode.ts), are sent to a separate Connect
 * endpoint with its own secret (STRIPE_CONNECT_WEBHOOK_SECRET). Both
 * endpoints can point at the same route; it tries each secret in turn.
 * An event from a connected account carries `account`.
 */

type Env = Record<string, string | undefined>

/** The secrets to try, platform first; empty when none is set. */
export function webhookSecrets(env: Env = process.env): string[] {
  return [env.STRIPE_WEBHOOK_SECRET, env.STRIPE_CONNECT_WEBHOOK_SECRET].map((s) => s?.trim()).filter((s): s is string => Boolean(s))
}

/**
 * Whether a lost Sign & Pay dispute needs Salsox to recover its cost. Only
 * for a destination charge (an event from the platform's own account): a
 * direct charge's dispute was debited from the sender's account by Stripe.
 */
export function needsDisputeRecovery(event: { account?: string | null }): boolean {
  return !event.account
}
