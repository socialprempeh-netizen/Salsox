/**
 * Phone numbers in the one form an SMS provider accepts (E.164).
 *
 * Its own file, with no imports, because both sides need it: the SMS sender
 * on the server (sms.ts) and the editor in the browser, which tells the sender
 * how many recipients a text can actually reach before they opt in.
 */

/**
 * A phone number in international form, or null.
 *
 * Accepts what people type (spaces, dashes, dots, brackets, a leading 00
 * instead of +) but never guesses a country: a number without its country
 * code is ambiguous, and a text sent to the wrong country is worse than none.
 */
export function toE164(phone: string): string | null {
  const compact = phone.trim().replace(/[\s().-]/g, "").replace(/^00/, "+")
  return /^\+[1-9]\d{7,14}$/.test(compact) ? compact : null
}
