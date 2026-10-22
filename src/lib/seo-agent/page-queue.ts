/**
 * What the SEO agent may write, now that it writes pages instead of blog
 * articles: the candidates for the three page types with conversion data
 * behind them (document templates, comparison and alternative pages, and
 * e-signature law pages), each with the facts a page needs before it can be
 * written at all.
 *
 * Why a curated queue rather than ideas from a model: a page is only worth
 * publishing when it rests on something true and specific. A template needs
 * a real document type the library lacks and the situation it serves; a
 * comparison needs the competitor's own published pricing, fetched on the
 * day of the run; a law page needs the statute's actual sections. The model
 * writes; it does not decide what exists or what is true.
 *
 * Adding a page is adding an entry here. Entries the site already covers
 * (a file with the same slug, or a page owning the keyword) are skipped by
 * the picker in page-agent.ts, so a candidate never shadows existing content.
 *
 * Pure data and pure helpers, tested in page-queue.test.ts.
 */
import type { TemplateCategory, TemplateIndustry, TemplateTeam, TemplateType } from "@/lib/templates-taxonomy"

export type PageCandidateKind = "template" | "comparison" | "alternative" | "compliance"

export type Source = { label: string; url: string }

export type TemplateCandidate = {
  kind: "template"
  slug: string
  keyword: string
  category: TemplateCategory
  type: TemplateType
  industries: TemplateIndustry[]
  teams: TemplateTeam[]
  /** Who signs, in order; the first role marked `you` is the sender. */
  roles: { id: string; label: string; you?: boolean }[]
  /** The specific situation this document is for: what makes its page different from its neighbours. */
  angle: string
}

export type CompetitorCandidate = {
  kind: "comparison" | "alternative"
  slug: string
  keyword: string
  /** The competitor the page is about. */
  competitor: { name: string; url: string }
  /** Published pages the facts must come from. Fetched on the day; a page whose sources cannot be read is not written. */
  sources: Source[]
  angle: string
}

/** One statement of law, with where it comes from. The page may state only these. */
export type LawFact = { id: string; cite: string; text: string; source: number }

export type ComplianceCandidate = {
  kind: "compliance"
  slug: string
  keyword: string
  country: string
  /** The day the facts below were read against their sources (yyyy-mm-dd). */
  verified: string
  sources: Source[]
  facts: LawFact[]
  /** Statute numbers the page may cite ("Act 772"); any other is a fabricated citation. */
  acts: string[]
  angle: string
}

export type PageCandidate = TemplateCandidate | CompetitorCandidate | ComplianceCandidate

/** The product's own plans, as the existing comparison pages state them. Change them together. */
export const OWN_PLAN_FACTS = [
  "Free: 3 documents a month for signature, signers need no account.",
  "Personal: $9 a month or $90 a year, unlimited documents (fair use), one sender.",
  "Business: $19 a month or $190 a year: adds Sign & Pay (payment collected during signing, by card through Stripe or by card and mobile money through Paystack), signing order, an approver role, and a sealed PDF with an audit certificate and verification code.",
  "Every plan keeps an audit trail. Senders can send by email, WhatsApp or SMS.",
  "There are no team seats today and no public API.",
]

// ─── Templates ───────────────────────────────────────────────────────────────

export const TEMPLATE_CANDIDATES: TemplateCandidate[] = [
  {
    kind: "template",
    slug: "loan-agreement",
    keyword: "loan agreement template",
    category: "contracts",
    type: "agreement",
    industries: ["finance", "professional-services"],
    teams: [],
    roles: [{ id: "lender", label: "Lender", you: true }, { id: "borrower", label: "Borrower" }],
    angle: "A personal or small-business loan between people who know each other: amount, repayment schedule, interest (or none), what happens on a missed payment. Written so a family loan is taken seriously without feeling hostile.",
  },
  {
    kind: "template",
    slug: "web-design-contract",
    keyword: "web design contract template",
    category: "freelance",
    type: "agreement",
    industries: ["software", "marketing"],
    teams: [],
    roles: [{ id: "designer", label: "Designer", you: true }, { id: "client", label: "Client" }],
    angle: "A fixed-scope website build: pages and features in scope, rounds of revisions, who supplies copy and images, hosting and domain ownership, and the handover of logins and files once the final invoice is paid.",
  },
  {
    kind: "template",
    slug: "non-compete-agreement",
    keyword: "non-compete agreement template",
    category: "employment",
    type: "agreement",
    industries: ["software", "professional-services", "finance"],
    teams: ["hr", "legal"],
    roles: [{ id: "company", label: "Company", you: true }, { id: "employee", label: "Employee" }],
    angle: "A narrow, reasonable restraint signed with an employment offer: limited duration, a named territory and named competing activities, plus non-solicitation of clients and staff. Enforceability depends heavily on where the employee works, which the page must say plainly.",
  },
  {
    kind: "template",
    slug: "severance-agreement",
    keyword: "severance agreement template",
    category: "employment",
    type: "agreement",
    industries: ["software", "professional-services", "retail"],
    teams: ["hr", "legal"],
    roles: [{ id: "company", label: "Company", you: true }, { id: "employee", label: "Employee" }],
    angle: "Ending employment on agreed terms: final working day, severance pay and when it is paid, return of property, a release of claims in exchange, a reference, and the time the employee has to consider it and take advice.",
  },
  {
    kind: "template",
    slug: "property-management-agreement",
    keyword: "property management agreement template",
    category: "rentals",
    type: "agreement",
    industries: ["real-estate"],
    teams: [],
    roles: [{ id: "manager", label: "Property manager", you: true }, { id: "owner", label: "Owner" }],
    angle: "An owner hands day-to-day running of a rental to a manager: finding and vetting tenants, collecting rent, a spending limit for repairs without asking, the management fee, monthly statements, and how either side ends it.",
  },
  {
    kind: "template",
    slug: "cleaning-services-contract",
    keyword: "cleaning services contract template",
    category: "contracts",
    type: "agreement",
    industries: ["professional-services", "retail", "healthcare"],
    teams: [],
    roles: [{ id: "provider", label: "Cleaning company", you: true }, { id: "client", label: "Client" }],
    angle: "Recurring commercial cleaning: the schedule by area and frequency, who supplies products and equipment, access and keys, breakages, quality complaints and the window to fix them, and price review.",
  },
  {
    kind: "template",
    slug: "event-planning-contract",
    keyword: "event planning contract template",
    category: "contracts",
    type: "agreement",
    industries: ["marketing", "professional-services"],
    teams: ["marketing"],
    roles: [{ id: "planner", label: "Event planner", you: true }, { id: "client", label: "Client" }],
    angle: "Planning one event: date and venue, the planner's services, a deposit that secures the date, a budget the planner manages on the client's behalf, vendor contracts, guest-count changes and a cancellation scale that tightens as the date approaches.",
  },
  {
    kind: "template",
    slug: "social-media-management-contract",
    keyword: "social media management contract template",
    category: "freelance",
    type: "agreement",
    industries: ["marketing"],
    teams: ["marketing"],
    roles: [{ id: "manager", label: "Social media manager", you: true }, { id: "client", label: "Client" }],
    angle: "A monthly retainer to run a brand's accounts: platforms and posts per week, approval of content before it goes out, who pays for ads, account access and its return, reporting, and what happens to content made during the term.",
  },
  {
    kind: "template",
    slug: "vehicle-sale-agreement",
    keyword: "vehicle sale agreement template",
    category: "contracts",
    type: "agreement",
    industries: ["retail"],
    teams: [],
    roles: [{ id: "seller", label: "Seller", you: true }, { id: "buyer", label: "Buyer" }],
    angle: "A private sale of a used car or motorbike: identifying the vehicle by registration and chassis number, the price and how it is paid, sold as seen, the seller's statements about ownership and debts, and the hand-over of keys and papers.",
  },
  {
    kind: "template",
    slug: "medical-records-release-form",
    keyword: "medical records release form",
    category: "forms",
    type: "form",
    industries: ["healthcare"],
    teams: [],
    roles: [{ id: "patient", label: "Patient" }, { id: "clinic", label: "Clinic", you: true }],
    angle: "A patient authorises a clinic to send their records to a named person or provider: which records and dates, the purpose, how they are sent, when the consent expires and how to withdraw it.",
  },
  {
    kind: "template",
    slug: "training-agreement",
    keyword: "employee training agreement template",
    category: "employment",
    type: "agreement",
    industries: ["professional-services", "software", "manufacturing"],
    teams: ["hr"],
    roles: [{ id: "company", label: "Company", you: true }, { id: "employee", label: "Employee" }],
    angle: "The company pays for a course or certification and the employee agrees to stay for a period or repay part of the cost on a sliding scale: the course, its cost, the period, the repayment table and the cases where nothing is repaid.",
  },
  {
    kind: "template",
    slug: "construction-bid-proposal",
    keyword: "construction bid proposal template",
    category: "construction",
    type: "proposal",
    industries: ["construction"],
    teams: ["sales"],
    roles: [{ id: "contractor", label: "Contractor", you: true }, { id: "client", label: "Client" }],
    angle: "A contractor's priced bid for a defined job: scope by stage, inclusions and exclusions, a cost breakdown, the timeline, payment milestones and how long the price holds, ending in an acceptance the client signs.",
  },
]

// ─── Comparisons and alternatives ───────────────────────────────────────────

export const COMPETITOR_CANDIDATES: CompetitorCandidate[] = [
  {
    kind: "comparison",
    slug: "boldsign",
    keyword: "boldsign",
    competitor: { name: "BoldSign", url: "https://boldsign.com" },
    sources: [{ label: "BoldSign pricing", url: "https://boldsign.com/electronic-signature-pricing/" }],
    angle: "BoldSign is strong on API and developer pricing; the comparison is about who needs that and who needs payment collection and phone-first signing instead.",
  },
  {
    kind: "comparison",
    slug: "yousign",
    keyword: "yousign",
    competitor: { name: "Yousign", url: "https://yousign.com" },
    sources: [{ label: "Yousign pricing", url: "https://yousign.com/pricing" }],
    angle: "Yousign is a European provider built around eIDAS signature levels; the comparison turns on whether the reader needs an advanced or qualified signature in the EU, or simple signatures with payment and mobile-money support.",
  },
  {
    kind: "comparison",
    slug: "signeasy",
    keyword: "signeasy",
    competitor: { name: "Signeasy", url: "https://signeasy.com" },
    sources: [{ label: "Signeasy pricing", url: "https://signeasy.com/pricing" }],
    angle: "Signeasy started as a mobile signing app; both products care about signing on a phone, so the comparison is about plans, templates, team features and getting paid.",
  },
  {
    kind: "comparison",
    slug: "xodo-sign",
    keyword: "xodo sign",
    competitor: { name: "Xodo Sign", url: "https://xodo.com" },
    sources: [{ label: "Xodo pricing", url: "https://xodo.com/pricing" }],
    angle: "Xodo Sign (formerly eversign) is sold alongside a PDF editor; the comparison is for someone deciding between a PDF suite with signing and a signing service with payments.",
  },
  {
    kind: "comparison",
    slug: "smallpdf",
    keyword: "smallpdf esign",
    competitor: { name: "Smallpdf", url: "https://smallpdf.com" },
    sources: [{ label: "Smallpdf pricing", url: "https://smallpdf.com/pricing" }],
    angle: "Smallpdf is a PDF toolbox whose plans include e-signing; the reader is usually choosing between a toolbox subscription and a dedicated signing workflow with an audit trail.",
  },
  {
    kind: "comparison",
    slug: "zoho-sign",
    keyword: "zoho sign",
    competitor: { name: "Zoho Sign", url: "https://www.zoho.com/sign/" },
    sources: [{ label: "Zoho Sign pricing", url: "https://www.zoho.com/sign/pricing.html" }],
    angle: "Zoho Sign fits best inside the Zoho suite; the comparison is about whether the reader already lives in Zoho, and what a standalone service offers instead.",
  },
  {
    kind: "alternative",
    slug: "signnow",
    keyword: "signnow alternatives",
    competitor: { name: "SignNow", url: "https://www.signnow.com" },
    sources: [
      { label: "SignWell pricing", url: "https://www.signwell.com/pricing/" },
      { label: "DocuSeal pricing", url: "https://www.docuseal.com/pricing" },
      { label: "Dropbox Sign pricing", url: "https://sign.dropbox.com/products/dropbox-sign/pricing" },
      { label: "BoldSign pricing", url: "https://boldsign.com/electronic-signature-pricing/" },
    ],
    angle: "People leave SignNow over per-seat costs and add-ons; the page sorts the alternatives by why the reader is leaving, using only what each alternative publishes.",
  },
  {
    kind: "alternative",
    slug: "adobe-acrobat-sign",
    keyword: "adobe acrobat sign alternatives",
    competitor: { name: "Adobe Acrobat Sign", url: "https://www.adobe.com/acrobat/business/sign.html" },
    sources: [
      { label: "DocuSign pricing", url: "https://www.docusign.com/products-and-pricing" },
      { label: "SignWell pricing", url: "https://www.signwell.com/pricing/" },
      { label: "Jotform pricing", url: "https://www.jotform.com/pricing/" },
      { label: "Signeasy pricing", url: "https://signeasy.com/pricing" },
    ],
    angle: "Many Acrobat Sign users only need signatures, not the whole Acrobat suite; the page separates readers who need PDF editing from readers who need a simpler, cheaper signing workflow.",
  },
]

// ─── E-signature law ─────────────────────────────────────────────────────────

/**
 * Ghana. Every fact below was read on 22 October 2026 against the text of
 * Act 772 as published (the Cyber Security Authority's copy), the amending
 * Act 838, and the commentary listed, and the section numbers checked. The
 * page may say nothing about the law beyond these.
 */
export const GHANA: ComplianceCandidate = {
  kind: "compliance",
  slug: "ghana",
  keyword: "electronic signature law ghana",
  country: "Ghana",
  verified: "2026-10-22",
  sources: [
    { label: "Electronic Transactions Act, 2008 (Act 772), Cyber Security Authority copy", url: "https://www.csa.gov.gh/resources/Electronic%20Transactions%20Act.pdf" },
    { label: "Electronic Transactions Act, 2008 (Act 772), GhaLII consolidated text", url: "https://ghalii.org/akn/gh/act/2008/772" },
    { label: "Electronic Transactions (Amendment) Act, 2012 (Act 838), DennisLaw", url: "https://www.dennislawgh.com/law-preview/electronic-transactions-(amendment)-act/160" },
    { label: "Ghana's current legal framework and proposed reforms for e-signatures, Lex Africa, July 2026", url: "https://lexafrica.com/2026/07/ghanas-current-legal-framework-and-proposed-reforms-for-e-signatures/" },
    { label: "The emergence of electronic conveyancing in Ghana, Afriwise", url: "https://insights.afriwise.com/blog/the-emergence-of-electronic-conveyancing-in-ghana" },
  ],
  acts: ["Act 772", "Act 838", "Act 1036", "Act 55", "Act 549", "Act 106", "Act 360"],
  facts: [
    { id: "scope", cite: "Act 772, section 2", source: 0, text: "The Electronic Transactions Act, 2008 (Act 772), assented to on 18 December 2008, applies to electronic transactions and electronic records of every type." },
    { id: "no-compulsion", cite: "Act 772, section 3(2)", source: 0, text: "The Act does not require anyone to use electronic form, and does not stop a person from setting their own requirements for how they will accept electronic records." },
    { id: "writing", cite: "Act 772, section 5", source: 0, text: "Where a law requires information to be in writing, typewritten or printed, the requirement is satisfied if the information is in electronic form, accessible, and capable of being retained for later reference." },
    { id: "original", cite: "Act 772, section 6", source: 0, text: "Where a law requires an original, an electronic record satisfies it if there is reliable assurance of the record's integrity (it has remained complete and unaltered) and it can be displayed to the person it is presented to." },
    { id: "evidence", cite: "Act 772, section 7", source: 0, text: "An electronic record cannot be denied admissibility as evidence in legal proceedings except as the Act provides. Its weight depends on the reliability of how it was generated, stored and communicated, how its integrity was maintained, and how its originator was identified." },
    { id: "retention", cite: "Act 772, section 8", source: 0, text: "A legal duty to keep a document is met by keeping it electronically if it is accessible, kept in its original format or one shown to represent it accurately, and kept so its origin, destination and the date and time it was sent or received can be identified. Records kept this way must be kept for at least six years." },
    { id: "signature", cite: "Act 772, section 10(1)", source: 0, text: "Where a law requires a person's signature, the requirement is satisfied for an electronic record if a digital signature is used." },
    { id: "definition", cite: "Act 772, section 144", source: 0, text: "The Act defines a 'digital signature' broadly, as data attached to, incorporated in or logically associated with other data and intended by the user to serve as a signature. It is not limited to certificate-based cryptographic signatures." },
    { id: "authentic", cite: "Act 772, section 10(2)", source: 0, text: "A digital signature is deemed authentic if the means of creating it is linked to the signatory and no one else, was under the signatory's control at the time of signing without duress or undue influence, and any alteration after signing is detectable. Authenticity can also be proved in other ways." },
    { id: "modes", cite: "Act 772, section 12", source: 0, text: "A person may sign an electronic record with a personal digital signature or any other recognised, secure and verifiable mode of signing agreed by the parties or recognised by the industry as safe, reliable and acceptable." },
    { id: "reliance", cite: "Act 772, section 13", source: 0, text: "A person who relies on a digital signature bears the consequences of failing to take reasonable steps to verify that it is authentic, and, where a certificate supports it, to check the certificate is valid and respect its limits." },
    { id: "seal", cite: "Act 772, sections 15 and 16(2)", source: 0, text: "A requirement to notarise, acknowledge or verify a document is met by the electronic signature of the person authorised to do so, and a requirement for a corporate seal is met by the corporate body's electronic signature applied under its rules for using the seal." },
    { id: "attribution", cite: "Act 772, section 21", source: 0, text: "An electronic record is attributed to its originator if sent by them, by someone with authority to act for them, or by their automated system. A recipient may rely on attribution when it properly applied a procedure agreed with the originator to check it." },
    { id: "contracts", cite: "Act 772, sections 23 and 24", source: 0, text: "An agreement is valid even if concluded partly or wholly through an electronic medium. Sections 5 to 23 apply only where the parties have not agreed otherwise on those matters." },
    { id: "exclusions", cite: "Act 772, section 4", source: 0, text: "The Act does not apply to: negotiable instruments (Bills of Exchange Act, 1961, Act 55); the grant of a power of attorney (Powers of Attorney Act, 1998, Act 549); trusts (Trustees Incorporation Act, 1962, Act 106); wills (Wills Act, 1971, Act 360); contracts for the sale or conveyance of immovable property or an interest in it; and bills of lading." },
    { id: "amendment", cite: "Act 838 (2012)", source: 2, text: "The Electronic Transactions (Amendment) Act, 2012 (Act 838) repealed paragraphs (g), (h) and (i) of section 4, which had excluded company, partnership and sole proprietorship registration documents, affidavits and statutory declarations before a Commissioner for Oaths or Notary Public, and classes of documents notified in the Gazette." },
    { id: "land", cite: "Land Act, 2020 (Act 1036)", source: 4, text: "The Land Act, 2020 (Act 1036) introduced electronic conveyancing, with electronic signatures on conveyances that must comply with Act 772. Commentators read it as overriding the section 4 exclusion for land by implication, but the exclusion still appears in the consolidated text of Act 772, and implementing regulations were reported as not yet in place in 2023. Property transactions need local legal advice." },
    { id: "certifying", cite: "Act 772, sections 28 to 45 and 34", source: 0, text: "The National Information Technology Agency (NITA) is the Agency under the Act: it licenses providers of authentication and certification services, keeps a register of licence holders and a repository of digital signature certificates, and may recognise foreign certifying agencies by notice in the Gazette." },
    { id: "reform", cite: "Draft Electronic Transactions Bill, 2025", source: 3, text: "A draft Electronic Transactions Bill, 2025 would repeal Act 772 and introduce three tiers (digital, electronic and qualified electronic signatures), with qualified certificates issued after identity checks against the national ID database. It would remove most exclusions while keeping formalities such as the attestation of wills. As of July 2026 it was reported as still a draft, not law." },
  ],
  angle: "A practical compliance page for businesses signing contracts in Ghana: what Act 772 actually requires section by section, which documents are excluded, what evidence makes an electronic signature hold up (sections 7, 10(2) and 21), and how to keep signed records for six years. Deeper and more specific than a multi-country overview.",
}

export const COMPLIANCE_CANDIDATES: ComplianceCandidate[] = [GHANA]

export const ALL_CANDIDATES: PageCandidate[] = [...COMPLIANCE_CANDIDATES, ...TEMPLATE_CANDIDATES, ...COMPETITOR_CANDIDATES]

/** Where a candidate's page will live. */
export function candidatePath(c: PageCandidate): string {
  switch (c.kind) {
    case "template":
      return `/templates/${c.slug}`
    case "comparison":
      return `/vs/${c.slug}`
    case "alternative":
      return `/alternatives/${c.slug}`
    case "compliance":
      return `/esignature-law/${c.slug}`
  }
}

/** What a candidate is about, for intro checks: the names a lazy intro would swap. */
export function candidateSubject(c: PageCandidate): string[] {
  switch (c.kind) {
    case "template":
      return [c.keyword.replace(/\s+template$/i, ""), ...c.slug.split("-").filter((w) => w.length > 3)]
    case "comparison":
    case "alternative":
      return [c.competitor.name, c.slug.replace(/-/g, " ")]
    case "compliance":
      return [c.country]
  }
}

export type CandidateState = { kind: PageCandidateKind; slug: string; status: string; attempts: number }

/** How many times a candidate may fail before it is set aside. */
export const MAX_PAGE_ATTEMPTS = 2

/**
 * The next candidate to write, or null: the first law page not yet written
 * (there are few, and each is worth more than another template), then
 * whichever of templates and competitor pages has fewer written so far, so
 * the two grow together. A candidate is available when nothing has been
 * saved for it, or it failed with a retry left, and the site does not
 * already cover it (`covered`, by slug or keyword).
 */
export function pickCandidate(candidates: PageCandidate[], state: CandidateState[], covered: (c: PageCandidate) => boolean): PageCandidate | null {
  const key = (kind: string, slug: string) => `${kind}:${slug}`
  const byKey = new Map(state.map((s) => [key(s.kind, s.slug), s]))
  const available = candidates.filter((c) => {
    const s = byKey.get(key(c.kind, c.slug))
    if (s && !(s.status === "FAILED" && s.attempts < MAX_PAGE_ATTEMPTS)) return false
    return !covered(c)
  })
  const law = available.find((c) => c.kind === "compliance")
  if (law) return law
  const written = (kinds: PageCandidateKind[]) => state.filter((s) => kinds.includes(s.kind) && s.status !== "FAILED").length
  const templates = available.filter((c) => c.kind === "template")
  const competitors = available.filter((c) => c.kind === "comparison" || c.kind === "alternative")
  if (templates.length === 0) return competitors[0] ?? null
  if (competitors.length === 0) return templates[0]
  return written(["template"]) <= written(["comparison", "alternative"]) ? templates[0] : competitors[0]
}
