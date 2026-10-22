/**
 * The prompts for the SEO agent's page mode (page-agent.ts): one system
 * prompt per kind of page, stable between runs so the API caches it, and a
 * user prompt built from the candidate (page-queue.ts) and what the site
 * already holds. Built from data only, so they are tested (page-prompt.test.ts).
 *
 * Each prompt carries the three things that keep a generated page from being
 * thin: the facts it may state and nothing else (the product's own, the
 * competitor's fetched pages, the statute's verified sections); the intros
 * of the pages next to it, so its own opening is written to differ; and the
 * paths it may link to, so it joins the site's hubs instead of floating.
 */
import type { SitePath } from "./prompt"
import { OWN_PLAN_FACTS, type ComplianceCandidate, type CompetitorCandidate, type TemplateCandidate } from "./page-queue"
import type { FetchedSource } from "./source-fetch"

const TRUTH = `Truthfulness:
- State only what you are given or what is generally true and uncontroversial. Never invent prices, statistics, features, laws, section numbers, dates, quotes or customer stories.
- What you say about the product is limited to the product facts you are given.
- Plain, specific, calm voice written to one reader as "you". No hype, no filler openings ("In today's world", "Looking for"), no exclamation marks, no emoji.
- Write {site} wherever you name the product; it is filled in later. Never write the characters { } or < anywhere else.`

const INTRO = `The intro (lede) is the most important sentence on the page. It must say something true and specific that only this page could say: the situation the reader is in, the decision they are making, the detail that matters most. You are shown the intros of neighbouring pages. Yours must not follow their structure with the name swapped in; a checker compares them with the names masked and rejects a lookalike.`

export function templateSystemPrompt(): string {
  return `You write document templates for a free template library, and the page that presents each one. The template is a real, usable document a small business would sign, not a page about one.

The document (body):
- Markdown. Start with "# " and the document's name, then numbered "## " clauses or sections. Plain, enforceable wording; no legalese for its own sake.
- Every blank the user fills in is written [Like this]: square brackets, starting with a capital letter, at most 60 characters, never followed by "(". Use the same name each time a blank repeats.
- Every place someone signs is a field token: [[signature:ROLE]], and alongside it as needed [[name:ROLE]], [[date:ROLE]], [[initials:ROLE]], or [[text:ROLE]] for an answer the signer types. ROLE is one of the role ids you are given. Every role signs at least once, normally in a signature block at the end.
- Agreements need at least 300 words of document; forms and letters at least 200.
- Never use the characters { } or < in the document.

The page:
- title: 25 to 60 characters, containing the template's name; description: 70 to 160 characters; h1: 5 to 70 characters, naming the document.
- lede: 40 to 320 characters. See the intro rule below.
- variables: every [Blank] in the document exactly once, in order of appearance, each with a realistic, specific sample value (no brackets or braces in samples). Sample names, places and amounts should feel like a real small business.
- about: Markdown, 120 to 250 words: when to use this document, what each important clause does and why it matters in practice, what to get right when filling it in, and that the signers each sign on their phone with an audit trail. Specific to this document; never generic advice that fits any contract.
- faq: 3 to 5 real questions about this document with two-to-four-sentence answers. Where law varies by country, say so rather than picking one answer.

${INTRO}

${TRUTH}`
}

export function templateUserPrompt(input: { candidate: TemplateCandidate; productSummary: string; reference: { title: string; markdown: string } | null; siblingIntros: string[]; feedback?: string[] }): string {
  const c = input.candidate
  return `<product_facts>
${input.productSummary.trim()}
</product_facts>

<roles>
${c.roles.map((r) => `- ${r.id}: ${r.label}${r.you ? " (the sender, who fills in and sends the document)" : ""}`).join("\n")}
</roles>

<neighbouring_intros>
${input.siblingIntros.map((i) => `- ${i}`).join("\n")}
</neighbouring_intros>
${input.reference ? `\n<style_reference title="${input.reference.title.replace(/"/g, "'")}">\n${input.reference.markdown.trim()}\n</style_reference>\n` : ""}
Write the "${c.keyword.replace(/\s+template$/i, "")}" template (library type: ${c.type}). What it is for: ${c.angle}${feedbackBlock(input.feedback)}`
}

export function comparisonSystemPrompt(): string {
  return `You write fair, factual comparison pages between {site}, an e-signature service, and one other product, or round-ups of alternatives to one product. Readers are deciding what to buy; the page earns trust by being accurate, by saying where the other product is stronger, and by citing its sources.

Facts:
- Everything you say about another company comes from the source pages you are given, which were fetched today. If a source does not state something (a price, a limit, a feature), say it is not listed on that page; never fill the gap from memory.
- Name the plan and the billing basis with every price (per user or per account, monthly or billed yearly) and the currency as shown.
- Everything you say about {site} comes from the product facts and plan facts.

Structure of the body (Markdown, no H1, no FAQ section):
- Open with "## At a glance" and a Markdown table comparing the products on the same rows (free plan, entry paid plan, pricing basis, documents allowed, payment collection, audit trail, and whatever matters for this competitor). For a round-up, one row per alternative instead.
- Then three to six "## " sections on the differences that matter for this particular competitor, including at least one where the other product is the better choice and for whom.
- End with a short "## Which to choose" section.
- 650 to 1,100 words.

The page:
- title 25 to 60 characters; description 70 to 160; h1 5 to 90; breadcrumb 2 to 40 (like "vs BoldSign" or "SignNow alternatives").
- lede: 40 to 320 characters. See the intro rule below.
- aliases: 2 to 6 other phrasings people search for this same comparison, lower case.
- benefits: exactly three short points where {site} is the right pick, each tied to a fact.
- faq: 3 to 5 questions with two-to-four-sentence answers, each answerable from the facts.
- related: 3 to 5 paths from the list you are given, at least one of them another comparison or alternatives page.
- Links in the body point only to paths from that list, as root-relative Markdown links.

${INTRO}

${TRUTH}`
}

const sourceBlock = (sources: FetchedSource[]) =>
  sources.map((s) => `<source label="${s.label.replace(/"/g, "'")}" url="${s.url}">\n${s.text}\n</source>`).join("\n\n")

const pathList = (paths: SitePath[]) => paths.map((p) => `- ${p.path}: ${p.name}. ${p.description}`).join("\n")

function feedbackBlock(feedback?: string[]) {
  return feedback?.length ? `\n\nA previous attempt was rejected for these reasons; fix every one:\n${feedback.map((f) => `- ${f}`).join("\n")}` : ""
}

export function comparisonUserPrompt(input: { candidate: CompetitorCandidate; productSummary: string; sources: FetchedSource[]; paths: SitePath[]; siblingIntros: string[]; reference: { title: string; markdown: string } | null; today: string; feedback?: string[] }): string {
  const c = input.candidate
  const what =
    c.kind === "comparison"
      ? `Write the comparison page "{site} vs ${c.competitor.name}".`
      : `Write the page "${c.competitor.name} alternatives": the realistic alternatives, sorted by why someone leaves ${c.competitor.name}, with {site} as one option among them, not the only one.`
  return `<product_facts>
${input.productSummary.trim()}
</product_facts>

<plan_facts>
${OWN_PLAN_FACTS.map((f) => `- ${f}`).join("\n")}
</plan_facts>

${sourceBlock(input.sources)}

<site_paths>
${pathList(input.paths)}
</site_paths>

<neighbouring_intros>
${input.siblingIntros.map((i) => `- ${i}`).join("\n")}
</neighbouring_intros>
${input.reference ? `\n<style_reference title="${input.reference.title.replace(/"/g, "'")}">\n${input.reference.markdown.trim()}\n</style_reference>\n` : ""}
${what} The sources were fetched on ${input.today}; say so where you give prices. The angle: ${c.angle}${feedbackBlock(input.feedback)}`
}

export function complianceSystemPrompt(): string {
  return `You write e-signature law pages for businesses: one country per page, explaining what its law actually says about signing contracts electronically, section by section, and what a business should do as a result. You are given verified facts, each with its citation. They are the only statements about the law you may make.

Rules for the law:
- Cite the statute and section for every legal statement, exactly as the facts give them (for example "section 10(2) of the Electronic Transactions Act, 2008 (Act 772)"). Never cite a statute or section that is not in the facts, and never paraphrase a fact into something stronger than it says.
- Where the facts say something is uncertain, disputed or pending (a draft bill, an exclusion commentators read differently), say so plainly.
- Say once, near the top, in italics, that the page is general information, not legal advice, and give the date the law was checked.

Structure of the body (Markdown, no H1, no FAQ section):
- A short opening that answers whether electronic signatures are valid in the country, with the main statute.
- "## " sections: what the law recognises (writing, signatures, originals, contracts); what makes an electronic signature hold up as evidence; documents that cannot be signed electronically, as a Markdown table with the document, the statute it is defined in and the citation; land and property; who licenses certification providers; reform under way; a practical checklist for a business, as a numbered list, tied to sections (consent, identifying signers, keeping the audit trail, keeping records for the retention period, checking exclusions).
- 900 to 1,500 words.

The page:
- title 25 to 60 characters; description 70 to 160; h1 5 to 90; breadcrumb 2 to 40 (the country's name).
- lede: 40 to 320 characters. See the intro rule below.
- aliases: 2 to 6 other phrasings people search for, lower case.
- benefits: exactly three short points on how {site}'s audit trail and signing flow support the evidence the law looks for, each tied to a section and to the product facts. No claim that {site} provides advanced, qualified or certificate-based signatures.
- faq: 3 to 6 questions, each answered from the facts with its citation.
- related: 3 to 5 paths from the list you are given.

${INTRO}

${TRUTH}`
}

export function complianceUserPrompt(input: { candidate: ComplianceCandidate; productSummary: string; paths: SitePath[]; siblingIntros: string[]; feedback?: string[] }): string {
  const c = input.candidate
  const facts = c.facts.map((f) => `<fact id="${f.id}" cite="${f.cite}" source="${c.sources[f.source]?.label.replace(/"/g, "'") ?? ""}">${f.text}</fact>`).join("\n")
  return `<product_facts>
${input.productSummary.trim()}
</product_facts>

<verified_facts country="${c.country}" checked="${c.verified}">
${facts}
</verified_facts>

<site_paths>
${pathList(input.paths)}
</site_paths>

<neighbouring_intros>
${input.siblingIntros.map((i) => `- ${i}`).join("\n")}
</neighbouring_intros>

Write the e-signature law page for ${c.country}. The angle: ${c.angle}${feedbackBlock(input.feedback)}`
}
