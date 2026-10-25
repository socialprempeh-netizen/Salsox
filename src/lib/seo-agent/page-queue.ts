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

/**
 * A page facts come from. `format` says how to read it when it is not an
 * HTML page: some official statute texts are published only as a Word file
 * (Ontario's e-Laws site renders its HTML in the browser; the Uniform Law
 * Commission publishes UETA as a .docx).
 */
export type Source = { label: string; url: string; format?: "html" | "doc" | "docx" }

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

/**
 * One statement of law, with where it comes from. The page may state only
 * these. `quote` is a short passage copied word for word from the official
 * text at `sources[source]`: before a page is written, the agent fetches that
 * text and checks every quote is still in it (law-verify.ts), so a law that
 * cannot be read, or has changed, stops the page instead of being restated
 * from memory.
 */
export type LawFact = { id: string; cite: string; text: string; source: number; quote: string }

export type ComplianceCandidate = {
  kind: "compliance"
  slug: string
  keyword: string
  country: string
  /** The day the facts below were read against their sources (yyyy-mm-dd). */
  verified: string
  sources: Source[]
  facts: LawFact[]
  /**
   * The statutes the page may name, with the short names people use for
   * them. A page that names any other Act or Regulation is citing something
   * nobody verified, and fails its gate (citationProblems, page-draft.ts).
   */
  statutes: string[]
  angle: string
}

export type PageCandidate = TemplateCandidate | CompetitorCandidate | ComplianceCandidate

/** The product's own plans, as the existing comparison pages state them. Change them together. */
export const OWN_PLAN_FACTS = [
  "Free: 3 documents a month for signature, signers need no account.",
  "Personal: $9 a month or $90 a year, unlimited documents (fair use), one sender.",
  "Business: $19 a month or $190 a year: adds Sign & Pay (payment collected during signing, by card through Stripe or by card and mobile money through Paystack), signing order, an approver role, and a sealed PDF with an audit certificate and verification code.",
  "Every plan keeps an audit trail. Senders can send by email, WhatsApp or SMS.",
  // Was: "There are no team seats today, and no API to send documents: the API
  // covers webhooks only." Replaced when POST /api/v1/documents shipped.
  "There are no team seats today. The API sends and finds documents and webhooks report every event, but there is no embedded signing and no bulk send.",
]

// ─── Templates ───────────────────────────────────────────────────────────────

export const TEMPLATE_CANDIDATES: TemplateCandidate[] = [
  // Written by hand instead, as content/templates/loan-agreement.md, when the
  // library grew toward 100 templates; kept here so the brief stays readable.
  // {
  //   kind: "template",
  //   slug: "loan-agreement",
  //   keyword: "loan agreement template",
  //   category: "contracts",
  //   type: "agreement",
  //   industries: ["finance", "professional-services"],
  //   teams: [],
  //   roles: [{ id: "lender", label: "Lender", you: true }, { id: "borrower", label: "Borrower" }],
  //   angle: "A personal or small-business loan between people who know each other: amount, repayment schedule, interest (or none), what happens on a missed payment. Written so a family loan is taken seriously without feeling hostile.",
  // },
  // Written by hand instead, as content/templates/website-design-contract.md, when the
  // library grew toward 100 templates; kept here so the brief stays readable.
  // {
  //   kind: "template",
  //   slug: "web-design-contract",
  //   keyword: "web design contract template",
  //   category: "freelance",
  //   type: "agreement",
  //   industries: ["software", "marketing"],
  //   teams: [],
  //   roles: [{ id: "designer", label: "Designer", you: true }, { id: "client", label: "Client" }],
  //   angle: "A fixed-scope website build: pages and features in scope, rounds of revisions, who supplies copy and images, hosting and domain ownership, and the handover of logins and files once the final invoice is paid.",
  // },
  // Written by hand instead, as content/templates/non-compete-agreement.md, when the
  // library grew toward 100 templates; kept here so the brief stays readable.
  // {
  //   kind: "template",
  //   slug: "non-compete-agreement",
  //   keyword: "non-compete agreement template",
  //   category: "employment",
  //   type: "agreement",
  //   industries: ["software", "professional-services", "finance"],
  //   teams: ["hr", "legal"],
  //   roles: [{ id: "company", label: "Company", you: true }, { id: "employee", label: "Employee" }],
  //   angle: "A narrow, reasonable restraint signed with an employment offer: limited duration, a named territory and named competing activities, plus non-solicitation of clients and staff. Enforceability depends heavily on where the employee works, which the page must say plainly.",
  // },
  // Written by hand instead, as content/templates/severance-agreement.md, when the
  // library grew toward 100 templates; kept here so the brief stays readable.
  // {
  //   kind: "template",
  //   slug: "severance-agreement",
  //   keyword: "severance agreement template",
  //   category: "employment",
  //   type: "agreement",
  //   industries: ["software", "professional-services", "retail"],
  //   teams: ["hr", "legal"],
  //   roles: [{ id: "company", label: "Company", you: true }, { id: "employee", label: "Employee" }],
  //   angle: "Ending employment on agreed terms: final working day, severance pay and when it is paid, return of property, a release of claims in exchange, a reference, and the time the employee has to consider it and take advice.",
  // },
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
  // Written by hand instead, as content/templates/event-planning-contract.md, when the
  // library grew toward 100 templates; kept here so the brief stays readable.
  // {
  //   kind: "template",
  //   slug: "event-planning-contract",
  //   keyword: "event planning contract template",
  //   category: "contracts",
  //   type: "agreement",
  //   industries: ["marketing", "professional-services"],
  //   teams: ["marketing"],
  //   roles: [{ id: "planner", label: "Event planner", you: true }, { id: "client", label: "Client" }],
  //   angle: "Planning one event: date and venue, the planner's services, a deposit that secures the date, a budget the planner manages on the client's behalf, vendor contracts, guest-count changes and a cancellation scale that tightens as the date approaches.",
  // },
  // Written by hand instead, as content/templates/social-media-management-contract.md, when the
  // library grew toward 100 templates; kept here so the brief stays readable.
  // {
  //   kind: "template",
  //   slug: "social-media-management-contract",
  //   keyword: "social media management contract template",
  //   category: "freelance",
  //   type: "agreement",
  //   industries: ["marketing"],
  //   teams: ["marketing"],
  //   roles: [{ id: "manager", label: "Social media manager", you: true }, { id: "client", label: "Client" }],
  //   angle: "A monthly retainer to run a brand's accounts: platforms and posts per week, approval of content before it goes out, who pays for ads, account access and its return, reporting, and what happens to content made during the term.",
  // },
  // Written by hand instead, as content/templates/vehicle-bill-of-sale.md, when the
  // library grew toward 100 templates; kept here so the brief stays readable.
  // {
  //   kind: "template",
  //   slug: "vehicle-sale-agreement",
  //   keyword: "vehicle sale agreement template",
  //   category: "contracts",
  //   type: "agreement",
  //   industries: ["retail"],
  //   teams: [],
  //   roles: [{ id: "seller", label: "Seller", you: true }, { id: "buyer", label: "Buyer" }],
  //   angle: "A private sale of a used car or motorbike: identifying the vehicle by registration and chassis number, the price and how it is paid, sold as seen, the seller's statements about ownership and debts, and the hand-over of keys and papers.",
  // },
  // Written by hand instead, as content/templates/medical-records-release-form.md, when the
  // library grew toward 100 templates; kept here so the brief stays readable.
  // {
  //   kind: "template",
  //   slug: "medical-records-release-form",
  //   keyword: "medical records release form",
  //   category: "forms",
  //   type: "form",
  //   industries: ["healthcare"],
  //   teams: [],
  //   roles: [{ id: "patient", label: "Patient" }, { id: "clinic", label: "Clinic", you: true }],
  //   angle: "A patient authorises a clinic to send their records to a named person or provider: which records and dates, the purpose, how they are sent, when the consent expires and how to withdraw it.",
  // },
  // Written by hand instead, as content/templates/training-repayment-agreement.md, when the
  // library grew toward 100 templates; kept here so the brief stays readable.
  // {
  //   kind: "template",
  //   slug: "training-agreement",
  //   keyword: "employee training agreement template",
  //   category: "employment",
  //   type: "agreement",
  //   industries: ["professional-services", "software", "manufacturing"],
  //   teams: ["hr"],
  //   roles: [{ id: "company", label: "Company", you: true }, { id: "employee", label: "Employee" }],
  //   angle: "The company pays for a course or certification and the employee agrees to stay for a period or repay part of the cost on a sliding scale: the course, its cost, the period, the repayment table and the cases where nothing is repaid.",
  // },
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
//
// One page per target market: the United States, Canada, the United Kingdom
// and Germany. (A Ghana page was planned here first and removed: Ghana is not
// a target market.) Every fact below was read on 22 October 2026 against the
// official text at its source, and its quote copied from that text; the
// agent re-reads the sources and re-checks every quote before each page.

const VERIFIED = "2026-10-22"

export const UNITED_STATES: ComplianceCandidate = {
  kind: "compliance",
  slug: "united-states",
  keyword: "electronic signature law united states",
  country: "United States",
  verified: VERIFIED,
  sources: [
    { label: "15 U.S.C. § 7001 (ESIGN Act, general rule of validity), Legal Information Institute", url: "https://www.law.cornell.edu/uscode/text/15/7001" },
    { label: "15 U.S.C. § 7003 (ESIGN Act, specific exceptions), Legal Information Institute", url: "https://www.law.cornell.edu/uscode/text/15/7003" },
    { label: "15 U.S.C. § 7006 (ESIGN Act, definitions), Legal Information Institute", url: "https://www.law.cornell.edu/uscode/text/15/7006" },
    { label: "15 U.S.C. § 7002 (ESIGN Act, exemption to preemption), Legal Information Institute", url: "https://www.law.cornell.edu/uscode/text/15/7002" },
    { label: "Uniform Electronic Transactions Act (1999), final act, Uniform Law Commission", url: "https://www.uniformlaws.org/HigherLogic/System/DownloadDocumentFile.ashx?DocumentFileKey=a19be858-11fd-b9d5-b444-76003a779652&forceDialog=0", format: "docx" },
  ],
  statutes: ["Electronic Signatures in Global and National Commerce Act", "ESIGN Act", "E-SIGN Act", "Uniform Electronic Transactions Act", "UETA", "Uniform Commercial Code", "UCC", "Uniform Computer Information Transactions Act"],
  facts: [
    { id: "esign-validity", cite: "15 U.S.C. § 7001(a)", source: 0, quote: "may not be denied legal effect, validity, or enforceability solely because it is in electronic form", text: "For any transaction in or affecting interstate or foreign commerce, a signature, contract or other record may not be denied legal effect, validity or enforceability solely because it is in electronic form, and a contract may not be denied legal effect solely because an electronic signature or electronic record was used in its formation." },
    { id: "esign-consumer", cite: "15 U.S.C. § 7001(c)(1)", source: 0, quote: "the consumer has affirmatively consented to such use and has not withdrawn such consent", text: "Where a law requires information to be given to a consumer in writing, an electronic record satisfies it only if the consumer has affirmatively consented and not withdrawn consent, was first given a clear and conspicuous statement of their right to paper copies and to withdraw consent, was told the hardware and software needed, and consented electronically in a way that reasonably demonstrates they can access the information." },
    { id: "esign-retention", cite: "15 U.S.C. § 7001(d)(1)", source: 0, quote: "accurately reflects the information set forth in the contract or other record", text: "A legal requirement to retain a contract or record is met by an electronic record that accurately reflects its information and remains accessible to everyone entitled to it, for the required period, in a form that can be accurately reproduced for later reference." },
    { id: "esign-definition", cite: "15 U.S.C. § 7006(5)", source: 2, quote: "executed or adopted by a person with the intent to sign the record", text: "An electronic signature is an electronic sound, symbol or process attached to or logically associated with a contract or other record and executed or adopted by a person with the intent to sign the record." },
    { id: "esign-exceptions-a", cite: "15 U.S.C. § 7003(a)", source: 1, quote: "the creation and execution of wills, codicils, or testamentary trusts", text: "ESIGN's general rule does not apply to records governed by the law of wills, codicils and testamentary trusts; by state law on adoption, divorce or other family law matters; or by the Uniform Commercial Code, other than sections 1-107 and 1-206 and Articles 2 and 2A." },
    { id: "esign-exceptions-b", cite: "15 U.S.C. § 7003(b)", source: 1, quote: "court orders or notices, or official court documents", text: "It also does not apply to court orders, notices and official court documents; notices of cancellation of utility services; notices of default, acceleration, repossession, foreclosure or eviction on a primary residence; notices cancelling health or life insurance benefits; product recall notices for health or safety risks; and documents that must accompany hazardous materials." },
    { id: "esign-states", cite: "15 U.S.C. § 7002(a)(1)", source: 3, quote: "Uniform Electronic Transactions Act as approved and recommended for enactment in all the States", text: "A state law may modify, limit or supersede ESIGN's general rule as to state law if it is an enactment of the Uniform Electronic Transactions Act as recommended in 1999 (with scope exceptions that conflict with ESIGN preempted), or sets out alternative procedures consistent with ESIGN." },
    { id: "ueta-recognition", cite: "UETA section 7", source: 4, quote: "If a law requires a signature, an electronic signature satisfies the law", text: "Under UETA, a record or signature may not be denied legal effect or enforceability solely because it is electronic; a contract may not be denied effect because an electronic record was used to form it; an electronic record satisfies a law requiring writing; and an electronic signature satisfies a law requiring a signature." },
    { id: "ueta-agreement", cite: "UETA section 5(b)", source: 4, quote: "applies only to transactions between parties each of which has agreed to conduct transactions by electronic means", text: "UETA applies only to transactions between parties who have each agreed to conduct transactions electronically, which is determined from the context and surrounding circumstances, including the parties' conduct; a party may refuse to conduct other transactions electronically (section 5(c))." },
    { id: "ueta-attribution", cite: "UETA section 9(a)", source: 4, quote: "including a showing of the efficacy of any security procedure", text: "An electronic signature is attributable to a person if it was the act of that person, which may be shown in any manner, including by showing the efficacy of a security procedure used to determine who signed." },
    { id: "ueta-retention", cite: "UETA section 12", source: 4, quote: "remains accessible for later reference", text: "A legal requirement to retain a record, or to keep an original, is satisfied by an electronic record that accurately reflects the information after it was first generated in final form and remains accessible for later reference." },
    { id: "ueta-evidence", cite: "UETA section 13", source: 4, quote: "evidence of a record or signature may not be excluded solely because it is in electronic form", text: "In a proceeding, evidence of a record or signature may not be excluded solely because it is in electronic form." },
    { id: "ueta-scope", cite: "UETA section 3(b)", source: 4, quote: "a law governing the creation and execution of wills, codicils, or testamentary trusts", text: "UETA does not apply to transactions governed by the law on wills, codicils or testamentary trusts, or by the Uniform Commercial Code other than sections 1-107 and 1-206 and Articles 2 and 2A; states may list further exclusions." },
  ],
  angle: "For businesses signing with US customers and staff: how the federal ESIGN Act and each state's UETA fit together, the consumer-consent steps ESIGN adds when a law requires written notice to a consumer, the records that are excluded, and what evidence of intent and attribution keeps an e-signature enforceable.",
}

export const CANADA: ComplianceCandidate = {
  kind: "compliance",
  slug: "canada",
  keyword: "electronic signature law canada",
  country: "Canada",
  verified: VERIFIED,
  sources: [
    { label: "Personal Information Protection and Electronic Documents Act (S.C. 2000, c. 5), Justice Laws Website", url: "https://laws-lois.justice.gc.ca/eng/acts/p-8.6/FullText.html" },
    { label: "Electronic Commerce Act, 2000 (Ontario, S.O. 2000, c. 17), e-Laws", url: "https://www.ontario.ca/laws/docs/00e17_e.doc", format: "doc" },
  ],
  statutes: ["Personal Information Protection and Electronic Documents Act", "PIPEDA", "Electronic Commerce Act", "Electronic Commerce Act, 2000"],
  facts: [
    { id: "pipeda-purpose", cite: "PIPEDA, section 32", source: 0, quote: "provide for the use of electronic alternatives in the manner provided for in this Part where federal laws contemplate the use of paper", text: "Part 2 of PIPEDA provides electronic alternatives where federal laws contemplate the use of paper; it governs requirements under federal law, while provincial laws govern requirements under provincial law." },
    { id: "pipeda-definitions", cite: "PIPEDA, subsection 31(1)", source: 0, quote: "symbols in digital form incorporated in, attached to or associated with an electronic document", text: "An electronic signature is one or more letters, characters, numbers or other symbols in digital form incorporated in, attached to or associated with an electronic document. A secure electronic signature is one that results from a technology or process prescribed by regulations under subsection 48(1)." },
    { id: "pipeda-signature", cite: "PIPEDA, section 43", source: 0, quote: "a requirement under a provision of a federal law for a signature is satisfied by an electronic signature if", text: "A requirement under a provision of federal law for a signature is satisfied by an electronic signature if the federal law or provision is listed in Schedule 2 or 3 and the regulations for that provision are complied with." },
    { id: "pipeda-secure", cite: "PIPEDA, subsection 48(2)", source: 0, quote: "the electronic signature resulting from the use by a person of the technology or process is unique to the person", text: "A technology or process may be prescribed for secure electronic signatures only if it can be proved that the signature is unique to the person, the process is under the person's sole control, it identifies the person, and it can show whether the document changed after signing." },
    { id: "pipeda-witness", cite: "PIPEDA, section 46", source: 0, quote: "each signatory and each witness signs the electronic document with their secure electronic signature", text: "Where federal law requires a signature to be witnessed, an electronic document satisfies it if each signatory and each witness signs with a secure electronic signature, the provision is listed in Schedule 2 or 3, and the regulations are complied with." },
    { id: "on-definition", cite: "Electronic Commerce Act, 2000 (Ontario), section 1", source: 1, quote: "electronic information that a person creates or adopts in order to sign a document", text: "In Ontario, an electronic signature is electronic information that a person creates or adopts in order to sign a document and that is in, attached to or associated with the document." },
    { id: "on-recognition", cite: "Electronic Commerce Act, 2000 (Ontario), sections 4 and 5", source: 1, quote: "is not invalid or unenforceable by reason only of being in electronic form", text: "Information or a document is not invalid or unenforceable only because it is electronic, and a legal requirement that it be in writing is satisfied by an electronic document that is accessible so as to be usable for subsequent reference." },
    { id: "on-signature", cite: "Electronic Commerce Act, 2000 (Ontario), section 11", source: 1, quote: "a legal requirement that a document be signed is satisfied by an electronic signature", text: "A legal requirement that a document be signed is satisfied by an electronic signature, subject to reliability and method requirements for prescribed documents (subsections 11(3) and (4)) and to the rules for public bodies (section 17)." },
    { id: "on-retention", cite: "Electronic Commerce Act, 2000 (Ontario), section 12", source: 1, quote: "or in a format that accurately represents the information contained in the written document", text: "A legal requirement to retain a document is satisfied by an electronic document kept in its original format or one that accurately represents its information, and accessible for subsequent reference by anyone entitled to it." },
    { id: "on-contracts", cite: "Electronic Commerce Act, 2000 (Ontario), section 19", source: 1, quote: "touching or clicking on an appropriate icon or other place on a computer screen", text: "An offer, an acceptance or anything material to forming or performing a contract may be expressed electronically, including by clicking on a screen, unless the parties agree otherwise, and a contract is not invalid only because it is electronic." },
    { id: "on-exclusions", cite: "Electronic Commerce Act, 2000 (Ontario), section 31", source: 1, quote: "Trusts created by wills or codicils", text: "The Ontario Act does not apply to wills and codicils, trusts created by wills or codicils, powers of attorney for an individual's financial affairs or personal care, negotiable instruments, prescribed documents, or (except for contracts for the carriage of goods) documents of title." },
  ],
  angle: "For businesses signing with Canadian customers and staff: why PIPEDA Part 2 covers federal requirements while each province's own Act covers contracts under provincial law, using Ontario's Electronic Commerce Act, 2000 as the worked example, the documents it excludes, and when a federal requirement calls for a secure electronic signature.",
}

export const UNITED_KINGDOM: ComplianceCandidate = {
  kind: "compliance",
  slug: "united-kingdom",
  keyword: "electronic signature law uk",
  country: "United Kingdom",
  verified: VERIFIED,
  sources: [
    { label: "Electronic Communications Act 2000, section 7, legislation.gov.uk", url: "https://www.legislation.gov.uk/ukpga/2000/7/section/7" },
    { label: "UK eIDAS (Regulation (EU) No 910/2014 as it applies in the UK), Article 25, legislation.gov.uk", url: "https://www.legislation.gov.uk/eur/2014/910/article/25" },
    { label: "UK eIDAS, Article 3 (definitions), legislation.gov.uk", url: "https://www.legislation.gov.uk/eur/2014/910/article/3" },
    { label: "UK eIDAS, Article 26 (advanced electronic signatures), legislation.gov.uk", url: "https://www.legislation.gov.uk/eur/2014/910/article/26" },
    { label: "Wills Act 1837, section 9, legislation.gov.uk", url: "https://www.legislation.gov.uk/ukpga/Will4and1Vict/7/26/section/9" },
    { label: "Law of Property (Miscellaneous Provisions) Act 1989, section 1, legislation.gov.uk", url: "https://www.legislation.gov.uk/ukpga/1989/34/section/1" },
  ],
  statutes: ["Electronic Communications Act 2000", "Electronic Communications Act", "UK eIDAS", "eIDAS Regulation", "Regulation (EU) No 910/2014", "Wills Act 1837", "Wills Act", "Law of Property (Miscellaneous Provisions) Act 1989", "Electronic Identification and Trust Services for Electronic Transactions Regulations 2016", "Electronic Identification and Trust Services for Electronic Transactions (Amendment etc.) (EU Exit) Regulations 2019"],
  facts: [
    { id: "eca-admissible", cite: "Electronic Communications Act 2000, section 7(1)", source: 0, quote: "shall each be admissible in evidence in relation to any question as to the authenticity of the communication or data", text: "In any legal proceedings, an electronic signature incorporated into or logically associated with an electronic communication or data, and any certification of it, are admissible in evidence on the authenticity or integrity of that communication or data." },
    { id: "eca-definition", cite: "Electronic Communications Act 2000, section 7(2)", source: 0, quote: "purports to be used by the individual creating it to sign", text: "For section 7, an electronic signature is anything in electronic form that is incorporated into or logically associated with an electronic communication or data and purports to be used by the individual creating it to sign." },
    { id: "eca-certified", cite: "Electronic Communications Act 2000, section 7(3)", source: 0, quote: "either alone or in combination with other factors) a valid means of", text: "A signature is certified when a person has stated that the signature, a means of producing, communicating or verifying it, or a procedure applied to it is a valid means of signing." },
    { id: "uk-eidas-effect", cite: "UK eIDAS, Article 25(1)", source: 1, quote: "shall not be denied legal effect and admissibility as evidence in legal proceedings solely on the grounds that it is in an electronic form", text: "An electronic signature shall not be denied legal effect and admissibility as evidence in legal proceedings solely because it is electronic or does not meet the requirements for qualified electronic signatures." },
    { id: "uk-eidas-qes", cite: "UK eIDAS, Article 25(2)", source: 1, quote: "shall have the equivalent legal effect of a handwritten signature", text: "A qualified electronic signature has the equivalent legal effect of a handwritten signature. Article 25(3), on recognising qualified signatures across EU member states, was omitted for the UK from 31 December 2020 by S.I. 2019/89." },
    { id: "uk-eidas-definitions", cite: "UK eIDAS, Article 3(10) to (12)", source: 2, quote: "which is attached to or logically associated with other data in electronic form", text: "An electronic signature is data in electronic form attached to or logically associated with other data in electronic form and used by the signatory to sign; an advanced electronic signature meets Article 26; a qualified one is an advanced signature created by a qualified signature creation device and based on a qualified certificate." },
    { id: "uk-eidas-advanced", cite: "UK eIDAS, Article 26", source: 3, quote: "it is uniquely linked to the signatory", text: "An advanced electronic signature is uniquely linked to the signatory, capable of identifying them, created using data they can use under their sole control with a high level of confidence, and linked to the signed data so that any later change is detectable." },
    { id: "uk-wills", cite: "Wills Act 1837, section 9", source: 4, quote: "the signature is made or acknowledged by the testator in the presence of two or more witnesses present at the same time", text: "A will in England and Wales is valid only if it is in writing, signed by the testator (or by someone in their presence and at their direction), and the signature is made or acknowledged in the presence of two or more witnesses present at the same time, each of whom attests and signs or acknowledges their signature." },
    { id: "uk-deeds", cite: "Law of Property (Miscellaneous Provisions) Act 1989, section 1(3)", source: 5, quote: "in the presence of a witness who attests the signature", text: "An instrument is validly executed as a deed by an individual only if it is signed in the presence of a witness who attests the signature (or at their direction in the presence of two attesting witnesses) and is delivered as a deed." },
  ],
  angle: "For businesses signing with UK customers and staff: how section 7 of the Electronic Communications Act 2000 and Article 25 of UK eIDAS make simple electronic signatures admissible and effective, what a qualified signature adds, and where witnessing rules (wills, deeds) still shape how a document must be signed.",
}

export const GERMANY: ComplianceCandidate = {
  kind: "compliance",
  slug: "germany",
  keyword: "electronic signature law germany",
  country: "Germany",
  verified: VERIFIED,
  sources: [
    { label: "Regulation (EU) No 910/2014 (eIDAS) as adopted, Article 25, legislation.gov.uk", url: "https://www.legislation.gov.uk/eur/2014/910/article/25/adopted" },
    { label: "Regulation (EU) No 910/2014 (eIDAS) as adopted, Article 3, legislation.gov.uk", url: "https://www.legislation.gov.uk/eur/2014/910/article/3/adopted" },
    { label: "Regulation (EU) No 910/2014 (eIDAS) as adopted, Article 26, legislation.gov.uk", url: "https://www.legislation.gov.uk/eur/2014/910/article/26/adopted" },
    { label: "Vertrauensdienstegesetz (VDG), § 1, gesetze-im-internet.de", url: "https://www.gesetze-im-internet.de/vdg/__1.html" },
    { label: "Vertrauensdienstegesetz (VDG), § 2, gesetze-im-internet.de", url: "https://www.gesetze-im-internet.de/vdg/__2.html" },
    { label: "Bürgerliches Gesetzbuch (BGB), § 126, gesetze-im-internet.de", url: "https://www.gesetze-im-internet.de/bgb/__126.html" },
    { label: "BGB, § 126a, gesetze-im-internet.de", url: "https://www.gesetze-im-internet.de/bgb/__126a.html" },
    { label: "BGB, § 126b, gesetze-im-internet.de", url: "https://www.gesetze-im-internet.de/bgb/__126b.html" },
    { label: "BGB, § 623, gesetze-im-internet.de", url: "https://www.gesetze-im-internet.de/bgb/__623.html" },
    { label: "BGB, § 766, gesetze-im-internet.de", url: "https://www.gesetze-im-internet.de/bgb/__766.html" },
    { label: "BGB, § 780, gesetze-im-internet.de", url: "https://www.gesetze-im-internet.de/bgb/__780.html" },
    { label: "BGB, § 781, gesetze-im-internet.de", url: "https://www.gesetze-im-internet.de/bgb/__781.html" },
  ],
  statutes: ["eIDAS Regulation", "Regulation (EU) No 910/2014", "eIDAS", "Vertrauensdienstegesetz", "VDG", "Trust Services Act", "Bürgerliches Gesetzbuch", "BGB", "German Civil Code", "Civil Code", "BSI-Gesetz"],
  facts: [
    { id: "eidas-effect", cite: "eIDAS, Article 25(1)", source: 0, quote: "shall not be denied legal effect and admissibility as evidence in legal proceedings solely on the grounds that it is in an electronic form", text: "Across the EU, including Germany, an electronic signature shall not be denied legal effect and admissibility as evidence in legal proceedings solely because it is electronic or is not a qualified electronic signature." },
    { id: "eidas-qes", cite: "eIDAS, Article 25(2) and (3)", source: 0, quote: "shall be recognised as a qualified electronic signature in all other Member States", text: "A qualified electronic signature has the equivalent legal effect of a handwritten signature, and one based on a qualified certificate issued in one member state is recognised as qualified in all others." },
    { id: "eidas-definitions", cite: "eIDAS, Article 3(10) to (12)", source: 1, quote: "means an advanced electronic signature that is created by a qualified electronic signature creation device", text: "An electronic signature is data in electronic form attached to or logically associated with other data and used by the signatory to sign; an advanced signature meets Article 26; a qualified signature is an advanced one created by a qualified signature creation device and based on a qualified certificate." },
    { id: "eidas-advanced", cite: "eIDAS, Article 26", source: 2, quote: "it is capable of identifying the signatory", text: "An advanced electronic signature is uniquely linked to the signatory, capable of identifying them, created using data under their sole control, and linked to the signed data so that any later change is detectable." },
    { id: "vdg-scope", cite: "VDG, § 1(1)", source: 3, quote: "die wirksame Durchf", text: "The Vertrauensdienstegesetz (Trust Services Act) of 18 July 2017 governs the effective implementation in Germany of the eIDAS rules on trust services." },
    { id: "vdg-supervision", cite: "VDG, § 2(1)", source: 4, quote: "Bundesnetzagentur", text: "The Bundesnetzagentur is the supervisory body under Article 17 of eIDAS for creating, verifying and validating electronic signatures, seals and time stamps, with the Federal Office for Information Security (BSI) responsible for website authentication certificates." },
    { id: "bgb-written", cite: "§ 126(1) and (3) BGB", source: 5, quote: "Die schriftliche Form kann durch die elektronische Form ersetzt werden", text: "Where a statute prescribes written form (Schriftform), the document must be signed by hand by its issuer; written form can be replaced by electronic form unless the law provides otherwise." },
    { id: "bgb-electronic", cite: "§ 126a BGB", source: 6, quote: "qualifizierten elektronischen Signatur versehen", text: "To replace statutory written form with electronic form, the issuer must add their name and sign the electronic document with a qualified electronic signature; for a contract, each party signs an identical document this way." },
    { id: "bgb-text", cite: "§ 126b BGB", source: 7, quote: "Ist durch Gesetz Textform vorgeschrieben", text: "Where a statute prescribes text form (Textform), a readable declaration naming the person making it, on a durable medium, is enough; no signature is required." },
    { id: "bgb-employment", cite: "§ 623 BGB", source: 8, quote: "die elektronische Form ist ausgeschlossen", text: "Ending an employment relationship by notice of termination or by a termination agreement requires written form to be effective; electronic form is excluded." },
    { id: "bgb-surety", cite: "§ 766 BGB", source: 9, quote: "in elektronischer Form ist ausgeschlossen", text: "A contract of suretyship (Bürgschaft) requires the surety's declaration in written form; giving it in electronic form is excluded." },
    { id: "bgb-promise", cite: "§ 780 BGB", source: 10, quote: "Die Erteilung des Versprechens in elektronischer Form ist ausgeschlossen", text: "An independent promise of performance (Schuldversprechen) requires the promise in written form, unless another form is prescribed; giving it in electronic form is excluded." },
    { id: "bgb-acknowledgement", cite: "§ 781 BGB", source: 11, quote: "Die Erteilung der Anerkennungserkl", text: "An acknowledgement of debt (Schuldanerkenntnis) requires the declaration in written form; giving it in electronic form is excluded." },
  ],
  angle: "For businesses signing with German customers and staff: why most contracts can be signed with a simple or advanced e-signature under eIDAS, when German law's written form (§ 126 BGB) forces a qualified signature under § 126a, the documents where electronic form is excluded outright (§§ 623, 766, 780, 781 BGB), and who supervises trust services under the VDG.",
}

export const COMPLIANCE_CANDIDATES: ComplianceCandidate[] = [UNITED_STATES, UNITED_KINGDOM, CANADA, GERMANY]

/**
 * Pages about markets that are not targets. They stay on the blog, but a law
 * page never links to them or treats them as its siblings, and the law hub
 * does not list them.
 */
export const OFF_MARKET_PATHS = new Set(["/blog/electronic-signatures-ghana-nigeria-kenya"])

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
