/**
 * Carries "did the provider accept that email?" back to a caller that cannot
 * be handed the answer directly.
 *
 * The case this exists for: the confirmation email is sent by a callback the
 * auth library invokes (`emailVerification.sendVerificationEmail` in
 * src/auth.ts). The library discards whatever the callback returns, so the
 * action that asked for the email (src/app/actions/email-confirmation.ts) was
 * told "done" whether Resend accepted the message or refused it, and the
 * button said "Sent" either way.
 *
 * Throwing from the callback would fix that one button and break others: the
 * same callback runs at sign-up and on a change of email, where a refused
 * message must not fail the request. So the callback reports, and only a
 * caller that asked to listen hears it:
 *
 *   const { outcome } = await captureEmailOutcome(() => auth.api.send…())
 *
 * The report travels through AsyncLocalStorage, which follows the async call
 * chain of one request. Two requests sending at the same moment each get
 * their own answer, and a report made with nobody listening goes nowhere.
 */
import { AsyncLocalStorage } from "node:async_hooks"

type Listener = { accepted: boolean | undefined }

const listening = new AsyncLocalStorage<Listener>()

/**
 * Says whether the provider accepted the email just sent. Called where the
 * email is actually sent; a no-op unless a caller up the chain is capturing.
 */
export function reportEmailOutcome(accepted: boolean): void {
  const listener = listening.getStore()
  if (listener) listener.accepted = accepted
}

/**
 * Runs `send` and returns its result together with what was reported while
 * it ran: true (accepted), false (refused), or undefined when no email was
 * attempted at all. A caller that must not claim "sent" without proof treats
 * anything but true as a failure.
 */
export async function captureEmailOutcome<T>(send: () => Promise<T>): Promise<{ result: T; outcome: boolean | undefined }> {
  const listener: Listener = { accepted: undefined }
  const result = await listening.run(listener, send)
  return { result, outcome: listener.accepted }
}
