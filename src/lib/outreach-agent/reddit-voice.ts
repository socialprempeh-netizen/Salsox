/**
 * The check a Reddit draft must pass before the social studio keeps it: it
 * has to read as an ordinary community member's post (a question, an
 * opinion, an experience), not as content marketing with the brand name
 * taken out. Pure, so each rule is tested (reddit-voice.test.ts).
 *
 * The writer is already kept away from the product for Reddit (it is never
 * given the product's name, summary or features; see redditSystemPrompt in
 * prompt.ts). This is the second line: a draft that still names the
 * product, talks about a tool someone built or sells, steers toward the
 * product's own pitch, or is laid out like a blog listicle is dropped, and
 * the studio shows no Reddit draft rather than a disguised advert.
 */

export type RedditVoiceProblem = { rule: "brand" | "pitch" | "listicle" | "format"; detail: string }

/**
 * Phrases a genuine community post has no reason to use: tool talk, insider
 * disclosure, calls to action, and the product's own selling points (phone
 * signing with no account, signing links), which would make the "answer"
 * map onto what the product does.
 */
const PITCH = [
  /\be-?sign(ature|ing)?s?\b/i,
  /\besign\b/i,
  /\b(our|my) (own )?(tool|app|product|platform|startup|software|service)\b/i,
  /\b(we|i) (built|made|launched|created|am building|are building)\b/i,
  /\b(i|we) work (on|for|at) (a|an|the)\b/i,
  /\bfull disclosure\b|\bdisclosure:/i,
  /\b(check (it )?out|link in|dm me|sign up|free trial|use code)\b/i,
  /\bsign(ed|s|ing)? on (their|my|your|a) phones?\b/i,
  /\b(no|without (creating|making|needing)( an)?) accounts?( needed| required)?\b/i,
  /\bsigning links?\b/i,
  /\baudit trail\b/i,
  /\b(sign ?& ?pay|quick ?send)\b/i,
]

/** Lines that make a post read as an article: numbered tips, bullet lists, headings, bold labels. */
function listicleProblems(body: string): RedditVoiceProblem[] {
  const lines = body.split("\n").map((l) => l.trim())
  const problems: RedditVoiceProblem[] = []
  if (lines.filter((l) => /^\d+[.)]\s/.test(l)).length >= 2) problems.push({ rule: "listicle", detail: "numbered points" })
  if (lines.filter((l) => /^[-*•]\s/.test(l)).length >= 3) problems.push({ rule: "listicle", detail: "a bullet list" })
  if (lines.some((l) => /^#{1,6}\s/.test(l))) problems.push({ rule: "format", detail: "a heading" })
  if (/\*\*[^*]+\*\*/.test(body)) problems.push({ rule: "format", detail: "bold text" })
  if (/\b(tips?|ways|steps|lessons|mistakes)\b/i.test(lines[0] ?? "") && /^\s*\d+\b/.test(lines[0] ?? "")) problems.push({ rule: "listicle", detail: "a list-style opening" })
  return problems
}

/**
 * Why a Reddit draft does not read as a genuine community post, or nothing
 * when it does. `brandTerms` are the product's name and any other word that
 * would identify it.
 */
export function redditVoiceProblems({ title, body }: { title: string; body: string }, brandTerms: string[]): RedditVoiceProblem[] {
  const text = `${title}\n${body}`
  const problems: RedditVoiceProblem[] = []
  for (const term of brandTerms.map((t) => t.trim()).filter((t) => t.length > 1)) {
    if (new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text)) problems.push({ rule: "brand", detail: `names "${term}"` })
  }
  for (const pattern of PITCH) {
    const match = text.match(pattern)
    if (match) problems.push({ rule: "pitch", detail: `"${match[0]}"` })
  }
  // Titles in the form "5 tips for…" or "How I…: a guide" read as articles too.
  if (/^\s*\d+\s+\w+/.test(title) || /\b(a|the) (complete |ultimate )?guide\b/i.test(title)) problems.push({ rule: "listicle", detail: "an article-style title" })
  problems.push(...listicleProblems(body))
  return problems
}
