/**
 * Peer referrals, as pure rules: every account has an invite link, and each
 * person who signs up through it and becomes active earns the inviter
 * REFERRAL_REWARD_MONTHS of Pro (the Business tier) for free.
 *
 * - The link is /invite/{code}. Opening it stores the code in a first-party
 *   cookie (sx_ref, 30 days, src/app/invite/[code]/route.ts) and sends the
 *   visitor to sign up.
 * - At signup the server reads the cookie and records who invited the new
 *   account (src/auth.ts, via referrals-store.ts).
 * - "Active" is sending a first document: signing up costs nothing, so an
 *   account that only exists earns nothing. The reward is granted from
 *   sendDocument, once per invited person (ReferralReward.refereeId is
 *   unique).
 * - Rewards stack: each one adds three months after the end of the free time
 *   already earned, never more than REFERRAL_MAX_MONTHS_AHEAD from today, so
 *   a farm of fake accounts cannot buy years of Pro.
 * - The free months sit beside billing, not inside it: no Stripe object is
 *   made, and a paid plan is never touched. accountTier
 *   (src/lib/esign/sender.ts) takes the better of the two.
 *
 * The database side is in referrals-store.ts.
 */

export const REFERRAL_COOKIE = "sx_ref"
export const REFERRAL_COOKIE_DAYS = 30
export const REFERRAL_REWARD_MONTHS = 3
export const REFERRAL_MAX_MONTHS_AHEAD = 24

// No 0/o, 1/l/i: a code read aloud or copied by hand stays the same code.
const CODE_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz"
const CODE_LENGTH = 8

/** A new random invite code. `random` returns bytes; injectable for tests. */
export function generateReferralCode(random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  // 256 is not a multiple of the alphabet size; the slight bias is harmless
  // for a code whose only job is to be unique and hard to guess by chance.
  return [...random(CODE_LENGTH)].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("")
}

/** The code in canonical form, or null when it cannot be one. */
export function normalizeReferralCode(raw: string | null | undefined): string | null {
  const code = (raw ?? "").trim().toLowerCase()
  return /^[a-z0-9]{6,16}$/.test(code) ? code : null
}

/** The invite link for a code, on this site's address. */
export function referralLink(code: string, appUrl: string): string {
  return `${appUrl.replace(/\/+$/, "")}/invite/${code}`
}

/** `date` plus whole calendar months, in UTC, clamped to the month's last day. */
export function addMonthsUtc(date: Date, months: number): Date {
  const y = date.getUTCFullYear()
  const m = date.getUTCMonth() + months
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  return new Date(Date.UTC(y, m, Math.min(date.getUTCDate(), last), date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds(), date.getUTCMilliseconds()))
}

/**
 * When the free Pro time ends after one more reward: `months` after the
 * current end, or after now when none is running, capped at
 * REFERRAL_MAX_MONTHS_AHEAD from now.
 */
export function extendReferralPro(currentEnd: Date | null, now: Date, months = REFERRAL_REWARD_MONTHS): Date {
  const start = currentEnd && currentEnd > now ? currentEnd : now
  const end = addMonthsUtc(start, months)
  const cap = addMonthsUtc(now, REFERRAL_MAX_MONTHS_AHEAD)
  return end > cap ? cap : end
}

/**
 * The address a mailbox actually delivers to, for spotting someone inviting
 * themselves: lower case, without a +tag, and for Gmail without dots.
 */
export function canonicalEmail(email: string): string {
  const [local = "", domain = ""] = email.trim().toLowerCase().split("@")
  const bare = local.split("+")[0]
  const gmail = domain === "gmail.com" || domain === "googlemail.com"
  return `${gmail ? bare.replace(/\./g, "") : bare}@${gmail ? "gmail.com" : domain}`
}

/** Whether `referrer` may be credited with inviting `referee`. */
export function mayRefer(referrer: { id: string; email: string }, referee: { id: string; email: string }): boolean {
  return referrer.id !== referee.id && canonicalEmail(referrer.email) !== canonicalEmail(referee.email)
}

/**
 * Whether the invited person is told, on their dashboard, that their first
 * document is what makes the invite count: they joined through one, and have
 * not sent anything yet (no reward exists for them).
 */
export function inviteePending(user: { referredById: string | null; rewarded: boolean }): boolean {
  return user.referredById !== null && !user.rewarded
}

/** An invited person, as their inviter sees them: "joined" until they send a first document. */
export function referralStatus(invited: { rewarded: boolean }): "joined" | "active" {
  return invited.rewarded ? "active" : "joined"
}
