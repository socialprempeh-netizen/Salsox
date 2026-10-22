/**
 * The quality gates every page the SEO agent writes must pass, as pure
 * functions (tested in quality.test.ts). The principle: a hundred great
 * pages beat ten thousand thin ones, so a page that is not clearly its own
 * thing does not go out.
 *
 * Four gates, each with a different consequence:
 *
 *  - required: no field left blank, no placeholder text, no empty section.
 *    Failing it means the page is not generated at all (the run fails and
 *    says why), never published with a hole in it.
 *  - intro: the opening must be specific to the page. It is compared with
 *    the intros of its siblings after masking the subject's name, so a
 *    "swap the competitor's name into the same paragraph" intro is caught
 *    even though its words differ. Failing it also stops generation.
 *  - duplicate: the body's similarity to every existing page. Too close and
 *    the page is saved FLAGGED and noindexed, reported in the admin tab, and
 *    never published on its own.
 *  - links: the page must link into the hub-and-spoke structure (at least
 *    three related pages that exist, including siblings), so nothing it
 *    adds is an orphan. Failing it stops generation.
 *
 * Similarity uses the same five-word shingle measure as the registry's own
 * tests (src/lib/seo/pages.ts); intros use three-word shingles, which suit
 * short text.
 */
import { similarity } from "@/lib/seo/pages"

export type GateId = "required" | "intro" | "duplicate" | "links" | "facts"
export type Gate = { id: GateId; ok: boolean; detail: string }

export type QualityReport = {
  gates: Gate[]
  /** Highest body similarity to an existing page, and that page. */
  similarity: number
  similarTo: string | null
  /** Highest masked-intro similarity to a sibling's intro, and that sibling. */
  introSimilarity: number
  introSimilarTo: string | null
}

/** Body similarity above which a page is a near-duplicate, by family. Calibrated on the library: its closest pair of templates is 0.18, of comparisons 0.08. */
export const DUPLICATE_THRESHOLD = { template: 0.25, page: 0.12 } as const
/** Masked-intro similarity above which an intro is a variable swap. The library's closest pair of template ledes is 0.06. */
export const INTRO_SWAP_THRESHOLD = 0.2
export const INTRO_WORDS = { min: 35, max: 180 }

const words = (text: string) => text.toLowerCase().match(/[a-z0-9']+/g) ?? []

function shingleSet(text: string, size: number): Set<string> {
  const w = words(text)
  const out = new Set<string>()
  for (let i = 0; i + size <= w.length; i++) out.add(w.slice(i, i + size).join(" "))
  return out
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let shared = 0
  for (const s of a) if (b.has(s)) shared++
  return shared / (a.size + b.size - shared)
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/** The text with every subject term (and the site name) replaced by one token, longest first. */
export function maskSubject(text: string, terms: string[]): string {
  return [...new Set(terms.map((t) => t.trim()).filter((t) => t.length > 1))]
    .sort((a, b) => b.length - a.length)
    .reduce((out, term) => out.replace(new RegExp(`\\b${escape(term)}\\b`, "gi"), " subject "), text)
}

/** How alike two intros are once each one's own subject is masked: 1 means the same paragraph with names swapped. */
export function introSimilarity(a: { text: string; terms: string[] }, b: { text: string; terms: string[] }): number {
  return jaccard(shingleSet(maskSubject(a.text, a.terms), 3), shingleSet(maskSubject(b.text, b.terms), 3))
}

/** Openers that say nothing specific; an intro starting with one is generic by construction. */
const GENERIC_OPENERS = /^(in today'?s|in the modern|looking for|are you (looking|searching)|whether you|when it comes to|this (template|page|document|article) (is|will|helps))/i

export type IntroInput = { path: string; text: string; terms: string[] }

export function introGate(intro: IntroInput, siblings: IntroInput[]): { gate: Gate; score: number; closest: string | null } {
  const problems: string[] = []
  const count = words(intro.text).length
  if (count < INTRO_WORDS.min) problems.push(`the intro is ${count} words (at least ${INTRO_WORDS.min})`)
  if (count > INTRO_WORDS.max) problems.push(`the intro is ${count} words (at most ${INTRO_WORDS.max})`)
  if (GENERIC_OPENERS.test(intro.text.trim())) problems.push("the intro opens with a generic phrase instead of something specific to this page")
  const mentions = intro.terms.some((t) => new RegExp(`\\b${escape(t.trim())}`, "i").test(intro.text))
  if (!mentions) problems.push(`the intro never names what the page is about (${intro.terms[0]})`)
  let score = 0
  let closest: string | null = null
  for (const s of siblings) {
    const v = introSimilarity(intro, s)
    if (v > score) {
      score = v
      closest = s.path
    }
  }
  if (score > INTRO_SWAP_THRESHOLD && closest) problems.push(`the intro is ${(score * 100).toFixed(0)}% the same as ${closest}'s once the names are masked: a variable swap, not an intro of its own`)
  return { gate: { id: "intro", ok: problems.length === 0, detail: problems.length ? problems.join("; ") : `specific to this page (closest sibling ${(score * 100).toFixed(0)}% alike)` }, score, closest }
}

export type CorpusEntry = { path: string; text: string }

/** The existing page this text is most like, with the score. */
export function closestPage(text: string, corpus: CorpusEntry[]): { score: number; path: string | null } {
  let best = { score: 0, path: null as string | null }
  for (const entry of corpus) {
    const score = similarity(text, entry.text)
    if (score > best.score) best = { score, path: entry.path }
  }
  return best
}

export function duplicateGate(text: string, corpus: CorpusEntry[], threshold: number): { gate: Gate; score: number; closest: string | null } {
  const { score, path } = closestPage(text, corpus)
  const pct = (score * 100).toFixed(0)
  const ok = score <= threshold
  return {
    gate: { id: "duplicate", ok, detail: ok ? `distinct (closest: ${path ?? "none"}, ${pct}% alike)` : `${pct}% alike to ${path}, above the ${(threshold * 100).toFixed(0)}% limit: noindexed and held for review` },
    score,
    closest: path,
  }
}

/** Text that stands in for content: a page carrying any of it is unfinished. */
const PLACEHOLDER = /\b(lorem ipsum|tbd|todo|tba|xxx+|insert (here|text|name))\b|\[insert\b|\(insert\b/i

/**
 * Every blank or placeholder value in a draft, by its path ("faq.2.a"). Long
 * Markdown fields are also checked for a heading with nothing under it.
 */
export function requiredFieldProblems(value: unknown, path = ""): string[] {
  if (typeof value === "string") {
    const name = path || "value"
    if (!value.trim()) return [`${name} is empty`]
    const problems: string[] = []
    if (PLACEHOLDER.test(value)) problems.push(`${name} contains placeholder text`)
    if (/^#{2,3}\s/m.test(value)) {
      const lines = value.split("\n")
      for (let i = 0; i < lines.length; i++) {
        if (!/^#{2,3}\s/.test(lines[i])) continue
        const rest = lines.slice(i + 1)
        const next = rest.findIndex((l) => /^#{1,3}\s/.test(l))
        const section = (next === -1 ? rest : rest.slice(0, next)).join("\n").trim()
        // A heading followed directly by a sub-heading is a section with parts, not an empty one.
        const level = lines[i].match(/^#+/)![0].length
        const deeper = next !== -1 && rest[next].match(/^#+/)![0].length > level
        if (!section && !deeper) problems.push(`${name} has an empty section "${lines[i].replace(/^#+\s*/, "")}"`)
      }
    }
    return problems
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return [`${path || "list"} is empty`]
    return value.flatMap((v, i) => requiredFieldProblems(v, path ? `${path}.${i}` : String(i)))
  }
  if (value && typeof value === "object") return Object.entries(value).flatMap(([k, v]) => requiredFieldProblems(v, path ? `${path}.${k}` : k))
  if (value === null || value === undefined) return [`${path || "value"} is missing`]
  return []
}

export function requiredGate(value: unknown): Gate {
  const problems = requiredFieldProblems(value)
  return { id: "required", ok: problems.length === 0, detail: problems.length ? problems.slice(0, 8).join("; ") : "every field filled" }
}

/**
 * The page's place in the hub-and-spoke structure: it lists at least
 * `min` related pages, every one of them real, and at least one sibling (a
 * page in its own hub), so it links sideways as well as up.
 */
export function linksGate(related: string[], { known, siblings, self, min = 3 }: { known: Set<string>; siblings: Set<string>; self: string; min?: number }): Gate {
  const problems: string[] = []
  const unique = [...new Set(related)]
  if (unique.includes(self)) problems.push("lists itself as related")
  const unknown = unique.filter((p) => p !== self && !known.has(p))
  if (unknown.length) problems.push(`related pages that do not exist: ${unknown.join(", ")}`)
  const valid = unique.filter((p) => p !== self && known.has(p))
  if (valid.length < min) problems.push(`links to ${valid.length} related pages, needs ${min}`)
  if (siblings.size > 0 && !valid.some((p) => siblings.has(p))) problems.push("links to no page in its own hub")
  return { id: "links", ok: problems.length === 0, detail: problems.length ? problems.join("; ") : `links to ${valid.length} pages, ${valid.filter((p) => siblings.has(p)).length} in its hub` }
}

/**
 * Up to `count` neighbours of a page in its hub's order, nearest first on
 * both sides and wrapping round: every page in a hub then has incoming links
 * from the pages beside it, however many pages the hub holds.
 */
export function siblingRing<T>(items: T[], selfIndex: number, count = 4): T[] {
  const n = items.length
  if (n <= 1 || selfIndex < 0) return []
  const out: T[] = []
  const seen = new Set<number>([selfIndex])
  for (let step = 1; out.length < count && step < n; step++) {
    for (const i of [(selfIndex + step) % n, (selfIndex - step + n) % n]) {
      if (out.length < count && !seen.has(i)) {
        seen.add(i)
        out.push(items[i])
      }
    }
  }
  return out
}

/** A page whose generating gates (required, intro, links, facts) all passed is written; then the duplicate gate decides draft or flagged. */
export type Verdict = "fail" | "flag" | "pass"

export function verdict(gates: Gate[]): Verdict {
  if (gates.some((g) => g.id !== "duplicate" && !g.ok)) return "fail"
  if (gates.some((g) => g.id === "duplicate" && !g.ok)) return "flag"
  return "pass"
}

/** The reasons a draft is not generated, for the writer's second attempt and the run log. */
export function failures(gates: Gate[]): string[] {
  return gates.filter((g) => g.id !== "duplicate" && !g.ok).map((g) => `${g.id}: ${g.detail}`)
}
