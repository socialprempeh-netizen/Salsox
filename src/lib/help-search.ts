/**
 * Matching for the Help Center search box (components/help/help-search.tsx),
 * kept apart so it can be tested and so the browser bundle does not pull in
 * help.ts, which reads files.
 *
 * A guide matches when every word typed appears somewhere in its text, in any
 * order and as part of a longer word, ignoring case and accents: "pay
 * connect" finds "Connect Stripe or Paystack to get paid". An empty query
 * matches nothing, since the topic grid covers browsing.
 */

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()

export function matchesQuery(query: string, fields: string[]): boolean {
  const words = fold(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return false
  const text = fold(fields.join(" "))
  return words.every((w) => text.includes(w))
}
