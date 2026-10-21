/**
 * The checks an email from Marco (first email) or Oscar (follow-up) must pass
 * before it is saved, stated as code so the rules hold whatever the model
 * writes:
 *
 *  - Marco's email is about 120 words and quotes the lead's own complaint (a
 *    run of at least QUOTE_WORDS consecutive words from it);
 *  - Oscar's follow-up is shorter and genuinely new: it may not reuse most of
 *    the first email's phrasing (a "just bumping this" copy fails);
 *  - neither has links, placeholders or a fake "Re:" subject.
 *
 * Problems come back as plain sentences, which the writer is given on its one
 * second attempt.
 */
import { normalise } from "./signals"

export const WORDS = { initial: { min: 80, max: 160 }, followUp: { min: 40, max: 110 } } as const
/** Consecutive words from the complaint the first email must contain. */
export const QUOTE_WORDS = 6
/** Share of the first email's word triples a follow-up may repeat. */
export const MAX_OVERLAP = 0.3

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

const words = (text: string) => normalise(text).replace(/[^\p{L}\p{N}\s-]/gu, " ").split(/\s+/).filter(Boolean)

/** Whether `body` contains QUOTE_WORDS or more consecutive words of `quote`. */
export function quotesLead(body: string, quote: string): boolean {
  const q = words(quote)
  const b = ` ${words(body).join(" ")} `
  const run = Math.min(QUOTE_WORDS, q.length)
  for (let i = 0; i + run <= q.length; i++) {
    if (b.includes(` ${q.slice(i, i + run).join(" ")} `)) return true
  }
  return false
}

function triples(text: string): Set<string> {
  const w = words(text)
  const out = new Set<string>()
  for (let i = 0; i + 3 <= w.length; i++) out.add(w.slice(i, i + 3).join(" "))
  return out
}

/** Share of the first email's word triples the follow-up repeats (0 to 1). */
export function overlap(followUp: string, first: string): number {
  const a = triples(first)
  if (a.size === 0) return 0
  let shared = 0
  for (const t of triples(followUp)) if (a.has(t)) shared++
  return shared / a.size
}

export type Draft = { subject: string; body: string }

export function checkEmail(draft: Draft, context: { kind: "initial"; quote: string } | { kind: "followUp"; firstBody: string }): string[] {
  const problems: string[] = []
  const limits = context.kind === "initial" ? WORDS.initial : WORDS.followUp
  const count = countWords(draft.body)
  if (count < limits.min || count > limits.max) problems.push(`The body is ${count} words; it must be between ${limits.min} and ${limits.max}.`)
  if (/https?:\/\/|www\.|\]\(/i.test(draft.body)) problems.push("The body contains a link; write it with no links at all.")
  if (/\[[^\]]*\]|\{\{|\}\}|<[a-z_ ]+>/i.test(`${draft.subject} ${draft.body}`)) problems.push("It contains a placeholder in brackets; write the real words or leave the detail out.")
  if (context.kind === "initial") {
    const subject = draft.subject.trim()
    if (subject.length < 3 || subject.length > 60) problems.push(`The subject is ${subject.length} characters; it must be 3 to 60.`)
    if (/^(re|fwd?)\s*:/i.test(subject)) problems.push('The subject pretends to be a reply or a forward ("Re:", "Fwd:"); it must not.')
    if (!quotesLead(draft.body, context.quote)) problems.push(`The body does not quote the complaint; include at least ${QUOTE_WORDS} consecutive words of it exactly as written.`)
  } else {
    const shared = overlap(draft.body, context.firstBody)
    if (shared > MAX_OVERLAP) problems.push(`The follow-up repeats ${Math.round(shared * 100)}% of the first email's phrasing; write it fresh, with a different angle.`)
  }
  return problems
}
