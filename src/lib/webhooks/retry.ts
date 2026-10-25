/**
 * When a failed webhook delivery is tried again. The first attempt happens
 * right after the event; a failure (no answer, a timeout, or anything but a
 * 2xx) is retried on this schedule, then given up and shown as failed on
 * the Developers page, where it can be sent again by hand.
 *
 * Retries run from the daily cron (/api/cron/esign) and whenever a new event
 * goes out to the same endpoint, so on a plan with daily crons only, a retry
 * can wait longer than its delay. A more frequent cron shortens that.
 */
export const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3_600_000, 12 * 3_600_000, 24 * 3_600_000]

/** Attempts in all, the first included. */
export const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1

/** When to try again after `attempts` failed attempts, or null to give up. */
export function nextAttemptAt(attempts: number, now: Date): Date | null {
  if (attempts >= MAX_ATTEMPTS) return null
  const delay = RETRY_DELAYS_MS[attempts - 1]
  return delay === undefined ? null : new Date(now.getTime() + delay)
}

/** A receiver answered "received" with any 2xx. */
export function isSuccess(status: number): boolean {
  return status >= 200 && status < 300
}
