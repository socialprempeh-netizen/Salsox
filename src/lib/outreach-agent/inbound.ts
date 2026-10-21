/**
 * Reading a reply that came back to the outreach address: who sent it, and
 * what they actually wrote this time, without the quoted history of the
 * thread under it. Leo labels the new text only, so a reply of "stop" is not
 * outweighed by the 120 words of our own email quoted below it.
 *
 * Pure and tested; the webhook route and the mailer do the fetching.
 */
import { normaliseEmail } from "./compliance"

/** The address in "Name <a@b.com>" or "a@b.com", lowercased; null when there is none. */
export function addressOf(from: string): string | null {
  const address = (/<([^>]+)>/.exec(from)?.[1] ?? from).trim()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address) ? normaliseEmail(address) : null
}

/** Where quoted history starts in a reply: "On ... wrote:", an "-----Original Message-----" or a ">" block. */
const HISTORY = [/^\s*on .{0,200}wrote:\s*$/im, /^-{2,}\s*original message\s*-{2,}/im, /^\s*from:\s.+\n\s*(sent|date):/im, /^_{5,}\s*$/m]

/** The new part of a reply: the text above the quoted thread, ">" lines removed. */
export function latestReplyText(text: string): string {
  let cut = text.length
  for (const pattern of HISTORY) {
    const match = pattern.exec(text)
    if (match && match.index < cut) cut = match.index
  }
  const fresh = text
    .slice(0, cut)
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith(">"))
    .join("\n")
    .trim()
  // A reply that is only quoted text (rare) is read whole rather than as nothing.
  return (fresh || text.trim()).slice(0, 8_000)
}

/** Plain text from an HTML-only email: tags dropped, entities for the common characters decoded. */
export function textFromHtml(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|blockquote)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}
