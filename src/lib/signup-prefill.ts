/**
 * The email a visitor typed into a "Get started" row on a public page (the
 * home page hero, the landing pages), carried to `/signup?email=...` so the
 * signup form opens with it filled in. There is no separate capture flow:
 * nothing is stored until the visitor completes the real signup form, which
 * validates everything again on the server.
 *
 * The query string is user controlled, so it is only echoed back into the
 * form when it looks like one plain email address of a sane length; anything
 * else leaves the field empty rather than prefilling junk.
 */
export const MAX_EMAIL_LENGTH = 254

const EMAIL = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/

export function prefillEmail(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const email = value.trim()
  if (!email || email.length > MAX_EMAIL_LENGTH || !EMAIL.test(email)) return undefined
  return email
}
