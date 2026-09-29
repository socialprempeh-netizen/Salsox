/**
 * Shareable signing links.
 *
 * Every recipient's link is a plain URL (`/sign/{token}`), so besides email it
 * can go out over WhatsApp or SMS, which is how many signers (especially on
 * phones, and in markets where email is secondary) actually get reached. These
 * helpers only build the URLs: nothing here sends anything, the sender's own
 * WhatsApp or SMS app does, which also means no SMS provider is required.
 */

export function signingUrl(appUrl: string, token: string): string {
  return `${appUrl.replace(/\/+$/, "")}/sign/${encodeURIComponent(token)}`
}

/** The message that goes with the link in chat apps. Kept short for SMS. */
export function shareMessage(documentTitle: string, url: string, senderName?: string | null): string {
  const who = senderName?.trim() ? `${senderName.trim()} sent you` : "You have"
  return `${who} "${documentTitle}" to sign: ${url}`
}

/** WhatsApp click-to-chat. With a phone number it opens that chat directly. */
export function whatsappShareUrl(message: string, phone?: string | null): string {
  // wa.me wants the international number with digits only: no +, spaces or dashes.
  const digits = phone?.replace(/\D/g, "") ?? ""
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`
}

/**
 * An `sms:` link. The `?&body=` form is the one both iOS and Android accept:
 * iOS historically wanted `&body`, Android `?body`, and this satisfies both.
 */
export function smsShareUrl(message: string, phone?: string | null): string {
  const number = phone?.replace(/[^\d+]/g, "") ?? ""
  return `sms:${number}?&body=${encodeURIComponent(message)}`
}

export function mailtoShareUrl(email: string, subject: string, message: string): string {
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`
}
