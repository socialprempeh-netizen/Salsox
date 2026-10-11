/**
 * Whether an email-and-password account must confirm its address before it can
 * sign in.
 *
 * Why this exists: sign-in used to work for an address nobody had confirmed,
 * so an account could be opened on someone else's address and used straight
 * away. Better Auth refuses such a sign-in with EMAIL_NOT_VERIFIED when
 * `emailAndPassword.requireEmailVerification` is on (src/auth.ts), and sends a
 * fresh confirmation link with the refusal (`sendOnSignIn`).
 *
 * The condition is the one thing that makes that fair: the confirmation email
 * has to be sendable. Without RESEND_API_KEY nothing is sent, so requiring a
 * confirmation would lock out every password account with no way back in. In
 * that case the old behaviour stands.
 *
 * The way back in for an existing unconfirmed account is the confirmation
 * link sent on the refused sign-in: it confirms the address and keeps the
 * password. The email sign-in link also gets them in, but Better Auth treats
 * an unconfirmed account reached that way as unproven and deletes its
 * password and linked logins first (revokeUnprovenAccountAccess), which is
 * why the sign-in page points to the confirmation email and not to it.
 * Already-confirmed accounts and Google sign-in are not affected.
 *
 * Pure: takes the environment as an argument so the rule is tested.
 */
export function emailVerificationRequired(env: Record<string, string | undefined>): boolean {
  return Boolean(env.RESEND_API_KEY?.trim())
}
