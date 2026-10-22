/**
 * The check that a law page's facts still match the law, run before the
 * page is written (page-agent.ts). Every fact in a law candidate
 * (page-queue.ts) carries a passage copied word for word from its official
 * source; this fetches each source's full text and confirms every passage is
 * in it.
 *
 * If a source cannot be read, or a passage is no longer there (the statute
 * was amended, the page moved), the law cannot be verified today and the
 * page is not generated: the run fails with the reason, and nothing is
 * restated from memory. That is the gate "cite real statute sections only"
 * rests on: the citation check (page-draft.ts) holds the page to the facts,
 * and this holds the facts to the law.
 *
 * Matching ignores case, punctuation, quote and dash styles and spacing, so
 * a typographic difference between how a passage was copied and how a site
 * renders it is not mistaken for a change in the law.
 */
import type { ComplianceCandidate, LawFact } from "./page-queue"
import type { FullText } from "./source-fetch"

/** Text reduced to lower-case letters and digits separated by single spaces. */
export function normalizeForMatch(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
}

export type UnverifiedFact = { fact: LawFact; reason: string }

/** The facts whose passage is not in their source's text (or whose source could not be read). */
export function unverifiedFacts(facts: LawFact[], texts: Map<number, FullText>): UnverifiedFact[] {
  const normalized = new Map([...texts].map(([i, t]) => [i, t.ok ? normalizeForMatch(t.text) : null]))
  return facts.flatMap((fact) => {
    const text = normalized.get(fact.source)
    if (text === undefined) return [{ fact, reason: "its source is not listed" }]
    if (text === null) return [{ fact, reason: `its source could not be read (${texts.get(fact.source)?.reason ?? "unreadable"})` }]
    return text.includes(normalizeForMatch(fact.quote)) ? [] : [{ fact, reason: "its passage is no longer in the official text" }]
  })
}

/**
 * Reads every source a law page cites and checks every fact against it.
 * Returns the problems, empty when the law is verified.
 */
export async function verifyLaw(c: ComplianceCandidate, read: (source: ComplianceCandidate["sources"][number]) => Promise<FullText>): Promise<string[]> {
  const used = [...new Set(c.facts.map((f) => f.source))]
  const texts = new Map(await Promise.all(used.map(async (i) => [i, c.sources[i] ? await read(c.sources[i]) : { ok: false, text: "", reason: "missing source" }] as const)))
  return unverifiedFacts(c.facts, texts).map(({ fact, reason }) => `${fact.cite} (${c.sources[fact.source]?.url ?? "no source"}): ${reason}`)
}
