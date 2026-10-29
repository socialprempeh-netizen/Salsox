/**
 * The SEO agent's page matrix: the dimensions programmatic pages are built
 * from (competitors, industries, roles within industries, target markets),
 * and the generators that combine them into page candidates for the daily
 * run (page-agent.ts), alongside the hand-curated queue in page-queue.ts.
 *
 * Why a matrix: the large e-signature sites reach thousands of indexed pages
 * by combining dimensions. Checked on their live sites on 2026-10-29,
 * SignNow's sitemaps list 664 "A vs B" alternative pages
 * (/alternative/{a}-vs-{b}-alternative-signnow), 4,220 business-case pages
 * crossing industry, US state and document type, and role pages such as
 * "Draft the best signature for Leasing Agent"; PandaDoc's industry pages
 * open with a row of outcome figures, then benefit blocks, then the jobs the
 * industry does, then a signup call to action.
 *
 * What is deliberately not here, and why:
 *  - City or region pages. Signing a document is the same in Leeds as in
 *    Manchester; a page per city with the noun swapped is what search
 *    engines' spam policies call a doorway page. The only geographic
 *    dimension is the four target markets (the US, Canada, the UK and
 *    Germany), and only because their law differs: each market page states
 *    that country's verified law facts (page-queue.ts), nothing else.
 *  - Outcome statistics. The stats bar shows product facts only
 *    (src/lib/seo/stats.ts), because there are no measured customer outcomes.
 *  - Industry x role x market triples: a role's documents do not change by
 *    country, so the third dimension would add pages, not substance.
 *
 * Every candidate still goes through the same gates as any other page:
 * facts fetched or verified first, intro and duplicate checks against its
 * neighbours (a lookalike is flagged and noindexed, never auto-published),
 * one page per search intent, links only to pages that exist. Volume is
 * whatever survives those gates.
 *
 * Adding volume is adding data: an industry here gains its own page, its
 * role pages, a page per market (if listed in MARKET_INDUSTRIES) and a page
 * per competitor (if listed in COMPARED_INDUSTRIES). Pure; tested in
 * page-matrix.test.ts.
 */
import { ALL_CANDIDATES, CANADA, COMPETITOR_CANDIDATES, GERMANY, UNITED_KINGDOM, UNITED_STATES, type CompetitorCandidate, type ComplianceCandidate, type PageCandidate, type Source, type UseCaseCandidate } from "./page-queue"
import type { TemplateIndustry } from "@/lib/templates-taxonomy"

// ─── Competitors ────────────────────────────────────────────────────────────

export type MatrixCompetitor = {
  id: string
  name: string
  url: string
  /**
   * Published pages the facts come from, fetched on the day of the run. At
   * least one must be readable or the page is not written. Read with the
   * agent's own fetcher on 2026-10-29: PandaDoc answered HTTP 429 to it and
   * SignNow's pricing page renders only in a browser (its home page reads);
   * SignRequest's pricing page was a 404 and its home page too thin, so its
   * pages are set aside as missing data until it publishes one.
   */
  sources: Source[]
}

export const MATRIX_COMPETITORS: MatrixCompetitor[] = [
  { id: "docusign", name: "DocuSign", url: "https://www.docusign.com", sources: [{ label: "DocuSign eSignature pricing", url: "https://ecom.docusign.com/plans-and-pricing/esignature" }] },
  { id: "pandadoc", name: "PandaDoc", url: "https://www.pandadoc.com", sources: [{ label: "PandaDoc pricing", url: "https://www.pandadoc.com/pricing/" }] },
  { id: "dropbox-sign", name: "Dropbox Sign", url: "https://sign.dropbox.com", sources: [{ label: "Dropbox Sign pricing", url: "https://sign.dropbox.com/products/dropbox-sign/pricing" }] },
  { id: "adobe-acrobat-sign", name: "Adobe Acrobat Sign", url: "https://www.adobe.com/acrobat/business/sign.html", sources: [{ label: "Adobe Acrobat business plans", url: "https://www.adobe.com/acrobat/business/pricing/plans.html" }] },
  {
    id: "jotform-sign",
    name: "Jotform Sign",
    url: "https://www.jotform.com/products/sign/",
    sources: [
      { label: "Jotform pricing", url: "https://www.jotform.com/pricing/" },
      { label: "Jotform Sign", url: "https://www.jotform.com/products/sign/" },
    ],
  },
  {
    id: "signnow",
    name: "SignNow",
    url: "https://www.signnow.com",
    sources: [
      { label: "SignNow pricing", url: "https://www.signnow.com/pricing" },
      { label: "SignNow", url: "https://www.signnow.com/" },
    ],
  },
  { id: "signeasy", name: "Signeasy", url: "https://signeasy.com", sources: [{ label: "Signeasy pricing", url: "https://signeasy.com/pricing" }] },
  { id: "zoho-sign", name: "Zoho Sign", url: "https://www.zoho.com/sign/", sources: [{ label: "Zoho Sign pricing", url: "https://www.zoho.com/sign/pricing.html" }] },
  {
    id: "signrequest",
    name: "SignRequest",
    url: "https://signrequest.com",
    sources: [
      { label: "SignRequest pricing", url: "https://signrequest.com/en/pricing" },
      { label: "SignRequest", url: "https://signrequest.com/" },
    ],
  },
  {
    id: "nitro-sign",
    name: "Nitro Sign",
    url: "https://www.gonitro.com/sign",
    sources: [
      { label: "Nitro pricing", url: "https://www.gonitro.com/pricing" },
      { label: "Nitro Sign", url: "https://www.gonitro.com/sign" },
    ],
  },
]

/**
 * What every comparison's table must cover, so the rows that matter for
 * this product are never left out: the free plan's limits, Sign & Pay,
 * signing on a phone with no account, and fixing a recipient or an expired
 * link without rebuilding the document (src/lib/esign/recipients.ts). Each
 * competitor cell still comes only from its fetched page, or says the page
 * does not list it.
 */
export const DIFFERENTIATOR_ROWS = [
  "Free plan and its monthly document limit",
  "Entry paid plan and pricing basis (per user or per account)",
  "Payment collected during signing (Sign & Pay)",
  "Signing on a phone, with no account or app for the signer",
  "Sending by email, WhatsApp or SMS",
  "Correcting a recipient's email or renewing an expired link without rebuilding the document",
  "Audit trail and sealed PDF",
]

// ─── Industries ─────────────────────────────────────────────────────────────

export type Industry = {
  slug: string
  /** As it reads after "e-signatures for": "insurance agencies". */
  name: string
  /** The documents this industry signs: the substance its pages are written from. */
  documents: string[]
  angle: string
  templates?: TemplateIndustry
  /** A page that already exists as a file under content/pages/use-cases: used as a parent, never rewritten. */
  existing?: boolean
}

const EXISTING = (slug: string, name: string, documents: string[], templates?: TemplateIndustry): Industry => ({ slug, name, documents, angle: "", templates, existing: true })

export const INDUSTRIES: Industry[] = [
  // The file pages, kept as parents for role, market and comparison pages.
  EXISTING("real-estate", "real estate", ["tenancy and lease agreements", "offers and reservation forms", "inventory and move-in reports", "lease renewals and notices", "management agreements"], "real-estate"),
  EXISTING("hr", "HR teams", ["offer letters", "employment contracts", "onboarding forms", "policy acknowledgements", "NDAs"]),
  EXISTING("recruitment", "recruitment agencies", ["candidate offer letters", "terms of business with clients", "contractor agreements", "right-to-work declarations", "timesheets"], "recruitment"),
  EXISTING("law-firms", "law firms", ["engagement letters", "retainer agreements", "client authorisations", "settlement agreements", "conflict waivers"], "legal"),
  EXISTING("contractors", "contractors", ["quotes and bids", "change orders", "subcontractor agreements", "lien waivers", "completion sign-offs"], "construction"),
  EXISTING("clinics", "clinics", ["patient consent forms", "intake forms", "treatment plans", "privacy notices", "payment plans"], "healthcare"),
  EXISTING("accountants", "accountants", ["engagement letters", "tax return authorisations", "client onboarding forms", "fee agreements", "data processing agreements"], "finance"),
  EXISTING("freelancers", "freelancers", ["client contracts", "statements of work", "NDAs", "change requests", "invoices with terms"]),
  EXISTING("agencies-and-consultants", "agencies and consultants", ["proposals", "retainer agreements", "statements of work", "NDAs", "change orders"], "marketing"),
  EXISTING("schools", "schools", ["parent consent forms", "trip permissions", "enrolment forms", "staff contracts", "photo consent"], "education"),
  EXISTING("professional-services", "professional services firms", ["engagement letters", "proposals", "master services agreements", "NDAs"], "professional-services"),
  EXISTING("retail", "retail businesses", ["supplier agreements", "staff contracts", "layaway and deposit agreements", "returns authorisations"], "retail"),

  // New industry pages.
  { slug: "insurance", name: "insurance agencies", documents: ["policy applications", "broker of record letters", "signed quotes and binders", "claims forms", "cancellation requests", "premium payment authorisations"], angle: "Insurance paperwork is a chain of acknowledgements, from the application to the binder to the claim, and a signature that arrives a day late can leave a client uncovered." },
  { slug: "property-management", name: "property management companies", documents: ["owner management agreements", "tenant leases and renewals", "maintenance authorisations", "move-out inspections", "deposit return statements"], angle: "A property manager signs with owners on one side and tenants on the other, often for the same unit in the same week, and needs both records to line up." },
  { slug: "mortgage-brokers", name: "mortgage brokers", documents: ["client fee agreements", "authorisations to obtain credit reports", "disclosures and acknowledgements", "fact-find forms", "privacy consents"], angle: "Brokers collect many small authorisations before a lender sees a file; the delay is chasing them, not writing them." },
  { slug: "financial-advisors", name: "financial advisors", documents: ["client service agreements", "risk profile questionnaires", "fee disclosures", "advice acknowledgements", "account transfer forms"], angle: "Advice is regulated paperwork: the client acknowledges what was recommended and what it costs, and the record has to survive an audit years later." },
  { slug: "dental-practices", name: "dental practices", documents: ["treatment consent forms", "medical history forms", "treatment plans and estimates", "payment plans", "privacy notices"], angle: "A dental treatment plan is a consent and a cost estimate at once, signed most often in the chair or the night before on a phone." },
  { slug: "veterinary-clinics", name: "veterinary clinics", documents: ["treatment consent forms", "anaesthesia consents", "estimates and deposit agreements", "boarding agreements", "euthanasia consents"], angle: "Vet clinics need an owner's consent and agreement to an estimate before treatment, often while the owner is not in the room." },
  { slug: "therapists", name: "therapists and counsellors", documents: ["informed consent to therapy", "intake questionnaires", "cancellation and fee policies", "release of information forms", "telehealth consents"], angle: "A therapy practice's first documents set the terms of a confidential relationship, and many clients now never visit an office." },
  { slug: "physiotherapists", name: "physiotherapy clinics", documents: ["treatment consent forms", "intake and injury history forms", "cancellation policies", "package and payment agreements", "insurance assignment forms"], angle: "Physiotherapy is sold in courses of sessions, so consent and the payment for a package are signed together at the start." },
  { slug: "gyms-and-fitness-studios", name: "gyms and fitness studios", documents: ["membership agreements", "liability waivers", "health questionnaires", "freeze and cancellation forms", "personal training packages"], angle: "A membership is a waiver, a health declaration and a recurring payment, and members expect to sign up on their phone at the front desk." },
  { slug: "salons-and-spas", name: "salons and spas", documents: ["treatment consent and patch-test forms", "booking deposit agreements", "cancellation policies", "chair rental agreements", "staff contracts"], angle: "Salons lose money on no-shows; a booking that is signed and paid for at the same time is the fix." },
  { slug: "event-planners", name: "event planners", documents: ["client event contracts", "vendor agreements", "deposit and payment schedules", "change requests", "venue hire agreements"], angle: "An event is a stack of contracts with one date in common, and the deposit is what makes each booking real." },
  { slug: "photographers", name: "photographers", documents: ["session and wedding contracts", "model releases", "image licensing agreements", "booking deposits", "second-shooter agreements"], angle: "A photographer's contract and booking fee secure the date; the model release decides what can be done with the photos afterwards." },
  { slug: "auto-dealerships", name: "auto dealerships", documents: ["vehicle purchase agreements", "trade-in appraisals", "deposit receipts", "test drive waivers", "service authorisations"], angle: "Dealerships sign documents at every step of a sale and every service visit, often with a buyer who has already left the forecourt." },
  { slug: "car-rental", name: "car and equipment rental companies", documents: ["rental agreements", "damage inspection reports", "deposit authorisations", "additional driver forms", "return condition reports"], angle: "A rental is a contract, a condition report and a deposit, and disputes come down to what both sides signed at pick-up and return." },
  { slug: "logistics", name: "logistics and trucking companies", documents: ["carrier agreements", "rate confirmations", "proof of delivery", "owner-operator contracts", "driver onboarding forms"], angle: "Freight runs on rate confirmations and proofs of delivery signed far from any office, by drivers on a phone." },
  { slug: "nonprofits", name: "nonprofits", documents: ["volunteer agreements and waivers", "grant agreements", "donor pledge forms", "board resolutions", "photo consent"], angle: "Nonprofits collect signatures from volunteers, donors and boards who all give their time for free, so the signing has to cost them none." },
  { slug: "tutoring", name: "tutoring and coaching businesses", documents: ["tutoring agreements", "parent consent forms", "lesson package and payment terms", "cancellation policies", "safeguarding acknowledgements"], angle: "Tutors sign with parents, not with the student, and sell lessons in packages paid in advance." },
  { slug: "childcare", name: "childcare and daycare providers", documents: ["enrolment agreements", "medical and allergy forms", "authorised pick-up forms", "fee agreements", "photo and trip consents"], angle: "Childcare enrolment is a contract, a medical record and a list of who may collect a child, and parents fill it in between drop-offs." },
  { slug: "home-services", name: "home service businesses", documents: ["service quotes", "work authorisations", "maintenance plans", "completion sign-offs", "warranty registrations"], angle: "Cleaners, plumbers and installers win the job at the door; a quote the homeowner signs and pays a deposit on there and then is a booked job." },
  { slug: "solar-installers", name: "solar installers", documents: ["installation contracts", "site survey approvals", "financing and payment schedules", "interconnection authorisations", "completion certificates"], angle: "A solar sale has a long tail of signatures, from the survey to the grid connection, and each one can stall the install." },
  { slug: "it-and-msps", name: "IT services and MSPs", documents: ["managed services agreements", "statements of work", "data processing agreements", "change authorisations", "equipment lease agreements"], angle: "Managed service providers renew agreements and authorise changes constantly, and every one needs a named person's sign-off." },
  { slug: "hospitality", name: "hotels and hospitality", documents: ["group booking contracts", "event and banquet orders", "supplier agreements", "staff contracts", "guest damage authorisations"], angle: "Group bookings and events are signed against a deposit and a deadline; the hotel holds rooms only while it waits." },
  { slug: "restaurants", name: "restaurants and catering", documents: ["catering contracts", "private dining deposits", "supplier agreements", "staff contracts and rotas", "food allergy acknowledgements"], angle: "Catering and private dining are booked with a contract and a deposit, often by a client planning on a phone." },
  { slug: "travel-agencies", name: "travel agencies", documents: ["booking terms and conditions", "passenger information forms", "deposit and balance agreements", "travel insurance declarations", "amendment requests"], angle: "A trip is confirmed when the traveller accepts the terms and pays the deposit; everything after is amendments to the same booking." },
  { slug: "coworking-spaces", name: "coworking spaces", documents: ["membership agreements", "office licence agreements", "house rules acknowledgements", "access card forms", "meeting room bookings"], angle: "Coworking members sign up online and want a desk the same day, so the licence and the first month's fee go together." },
  { slug: "moving-companies", name: "moving companies", documents: ["moving estimates", "bills of lading", "inventory lists", "valuation and liability forms", "delivery receipts"], angle: "A move is signed for at the start and again at the end, by a customer standing in a hallway with a phone." },
  { slug: "architects", name: "architects and designers", documents: ["client appointment agreements", "fee proposals", "design approvals", "change requests", "subconsultant agreements"], angle: "Design work moves forward stage by stage, and each stage needs the client's written approval before the next one is billed." },
  { slug: "creators-and-influencers", name: "creators and influencer agencies", documents: ["brand partnership agreements", "content usage licences", "talent management agreements", "NDAs", "invoices with payment terms"], angle: "Creator deals are short, numerous and time-sensitive, and the usage licence decides what the brand may do with the content." },
  { slug: "churches", name: "churches and faith organisations", documents: ["volunteer and safeguarding forms", "facility hire agreements", "event registrations and waivers", "giving pledges", "staff contracts"], angle: "Faith organisations run on volunteers and events, and need consent and safeguarding records without asking anyone to install anything." },
  { slug: "sports-clubs", name: "sports clubs", documents: ["membership forms", "parental consents", "medical declarations", "liability waivers", "coach agreements"], angle: "A season starts with a stack of membership forms, parental consents and medical declarations, all due before the first session." },
]

// ─── Roles within industries ───────────────────────────────────────────────

export type Role = { slug: string; name: string; industry: string; documents: string[]; angle: string }

const role = (industry: string, slug: string, name: string, documents: string[], angle: string): Role => ({ slug, name, industry, documents, angle })

export const ROLES: Role[] = [
  role("real-estate", "leasing-agents", "leasing agents", ["rental applications", "lease agreements", "guarantor forms", "holding deposit agreements", "move-in checklists"], "A leasing agent turns a viewing into a signed lease, often the same day, and the holding deposit decides who gets the unit."),
  role("real-estate", "real-estate-brokers", "real estate brokers", ["listing agreements", "buyer representation agreements", "agent commission agreements", "disclosure acknowledgements"], "A broker signs with clients and with the agents who work under them, and both sets of agreements set who gets paid."),
  role("property-management", "landlords", "independent landlords", ["tenancy agreements", "deposit protection notices", "inventory reports", "rent increase notices", "notice to quit acknowledgements"], "A landlord with a handful of units has the same paperwork as an agency and none of its staff."),
  role("insurance", "insurance-agents", "insurance agents", ["policy applications", "coverage declinations", "signed quotes", "beneficiary designations"], "An agent needs the client's signature on what was offered and what was declined, because the gap is where complaints start."),
  role("insurance", "insurance-brokers", "insurance brokers", ["broker of record letters", "terms of business agreements", "client disclosures", "premium finance agreements"], "A broker works for the client, and the letter that says so is the first thing to sign."),
  role("insurance", "claims-adjusters", "claims adjusters", ["proof of loss forms", "settlement agreements", "repair authorisations", "release forms"], "Adjusters settle claims in the field and need the claimant's signature before money can move."),
  role("contractors", "electricians", "electricians", ["job quotes", "work authorisations", "change orders", "completion and test certificates acknowledgements"], "An electrician's quote becomes a job when the customer signs it, and extra work needs a signature before it starts."),
  role("contractors", "plumbers", "plumbers", ["service quotes", "emergency call-out authorisations", "change orders", "completion sign-offs"], "Plumbing work is often urgent; the call-out authorisation and its price have to be agreed in minutes."),
  role("contractors", "roofers", "roofers", ["roofing estimates", "insurance claim authorisations", "material selection approvals", "completion sign-offs"], "Roofing jobs often run through an insurance claim, so the homeowner signs both the estimate and the authorisation to deal with the insurer."),
  role("contractors", "hvac-technicians", "HVAC technicians", ["installation quotes", "maintenance agreements", "service authorisations", "warranty registrations"], "HVAC work is sold as an install plus a maintenance plan, and both are signed at the customer's home."),
  role("contractors", "subcontractors", "subcontractors", ["subcontract agreements", "lien waivers", "insurance certificates acknowledgements", "variation requests"], "A subcontractor signs with the main contractor, not the client, and gets paid only when the waivers are in."),
  role("law-firms", "immigration-lawyers", "immigration lawyers", ["engagement letters", "client declarations", "authority to act forms", "fee agreements"], "Immigration clients are often abroad, so engagement and authority to act have to be signed remotely."),
  role("law-firms", "family-lawyers", "family lawyers", ["engagement letters", "financial disclosure acknowledgements", "parenting plan drafts for review", "settlement agreements"], "Family matters involve two parties who will not sit in the same room, so documents travel to each separately."),
  role("law-firms", "estate-planning-attorneys", "estate planning attorneys", ["engagement letters", "estate planning questionnaires", "fee agreements", "acknowledgements of advice"], "Estate planning is the clearest case of what e-signatures cannot do: wills usually need ink and witnesses, but everything around them can be signed online."),
  role("law-firms", "paralegals", "paralegals", ["client intake forms", "authorisations to obtain records", "document review acknowledgements", "witness statements for signature"], "Paralegals do most of a firm's chasing for signatures, and every chase is time the client is not billed for."),
  role("clinics", "chiropractors", "chiropractors", ["treatment consent forms", "case history forms", "care plans", "payment agreements"], "Chiropractic care is consented to and paid for as a plan, before the first adjustment."),
  role("accountants", "bookkeepers", "bookkeepers", ["engagement letters", "bank feed authorisations", "monthly sign-offs", "fee agreements"], "A bookkeeper's client signs once to start and then approves the books every month."),
  role("accountants", "tax-preparers", "tax preparers", ["engagement letters", "authorisations to file", "client organisers", "fee agreements"], "Tax season compresses every signature into a few weeks, and the authorisation to file is the one that cannot be late."),
  role("freelancers", "freelance-designers", "freelance designers", ["design contracts", "revision policies", "usage and licence terms", "deposit invoices"], "A designer's contract decides how many rounds of changes are included and who owns the files at the end."),
  role("freelancers", "freelance-developers", "freelance developers", ["development contracts", "statements of work", "NDAs", "IP assignment agreements"], "A developer's contract has to say who owns the code, and clients often ask for an NDA before the first call."),
  role("freelancers", "freelance-writers", "freelance writers", ["writing contracts", "kill fee terms", "rights and licence agreements", "invoices with terms"], "A writer's contract sets the rights sold and the kill fee if the piece is dropped."),
  role("gyms-and-fitness-studios", "personal-trainers", "personal trainers", ["training packages", "health questionnaires", "liability waivers", "cancellation policies"], "A personal trainer sells sessions in packages, so the waiver, the health check and the payment belong in one document."),
  role("gyms-and-fitness-studios", "yoga-studios", "yoga studios", ["class pass agreements", "liability waivers", "health declarations", "teacher agreements"], "Yoga studios sign up students for passes and sign teachers on as contractors, both best done before the first class."),
  role("event-planners", "wedding-planners", "wedding planners", ["planning contracts", "vendor agreements", "payment schedules", "day-of timelines for approval"], "A wedding is planned for a year and paid for in instalments, and every vendor's contract hangs off the planner's."),
  role("event-planners", "event-venues", "event venues", ["venue hire agreements", "deposit and damage terms", "catering orders", "risk assessments acknowledgements"], "A venue holds a date only against a signed hire agreement and a deposit."),
  role("photographers", "wedding-photographers", "wedding photographers", ["wedding photography contracts", "booking retainers", "timeline approvals", "image usage terms"], "Wedding photographers book a date a year or more ahead, and the retainer is what keeps the date."),
  role("auto-dealerships", "car-salespeople", "car salespeople", ["purchase agreements", "deposit receipts", "trade-in authorisations", "finance application consents"], "A sale can be agreed on the phone; the deposit and the purchase agreement are what stop the buyer looking elsewhere."),
  role("logistics", "owner-operators", "owner-operators", ["lease-on agreements", "rate confirmations", "proof of delivery", "fuel card agreements"], "Owner-operators sign with carriers and brokers from the cab, between loads."),
  role("nonprofits", "volunteer-coordinators", "volunteer coordinators", ["volunteer agreements", "safeguarding declarations", "liability waivers", "photo consent"], "A volunteer coordinator onboards people who owe the organisation nothing, so the paperwork has to take a minute, not an evening."),
  role("tutoring", "music-teachers", "music teachers", ["lesson agreements", "term fee schedules", "cancellation policies", "parent consents"], "Music teachers sell terms of lessons, paid in advance, and most pupils are children whose parents sign."),
  role("home-services", "cleaning-companies", "cleaning companies", ["service agreements", "key holding authorisations", "recurring payment agreements", "staff contracts"], "Cleaning companies sign recurring service agreements and are often trusted with keys, which needs its own authorisation."),
  role("home-services", "landscapers", "landscapers", ["landscaping quotes", "seasonal maintenance contracts", "change orders", "deposit agreements"], "Landscapers sell seasonal contracts and one-off projects, both secured by a signed quote and a deposit."),
  role("it-and-msps", "it-consultants", "IT consultants", ["consulting agreements", "statements of work", "NDAs", "access authorisations"], "An IT consultant needs a signed authorisation before touching a client's systems."),
  role("recruitment", "staffing-coordinators", "staffing coordinators", ["temp worker assignments", "timesheet approvals", "client terms of business", "worker declarations"], "Staffing coordinators place temps weekly and need timesheets approved before anyone is paid."),
  role("hr", "hr-managers", "HR managers", ["offer letters", "contract variations", "disciplinary outcome letters", "exit agreements"], "An HR manager handles the sensitive documents: the ones that change a contract or end one."),
]

// ─── Markets ───────────────────────────────────────────────────────────────

export type Market = { id: string; label: string; law: ComplianceCandidate }

/** The four target markets, each with the verified law facts its pages may cite. */
export const MARKETS: Market[] = [
  { id: "us", label: "the US", law: UNITED_STATES },
  { id: "uk", label: "the UK", law: UNITED_KINGDOM },
  { id: "canada", label: "Canada", law: CANADA },
  { id: "germany", label: "Germany", law: GERMANY },
]

/** Industries whose documents have formal requirements that differ by country, so a market page has something to say. */
export const MARKET_INDUSTRIES = ["real-estate", "hr", "law-firms", "contractors", "insurance", "clinics", "recruitment", "accountants", "property-management", "financial-advisors", "nonprofits", "auto-dealerships"]

/** Industries that get a page per competitor ("DocuSign alternative for real estate"). */
export const COMPARED_INDUSTRIES = ["real-estate", "hr", "law-firms", "contractors", "insurance", "clinics", "recruitment", "accountants", "freelancers", "property-management", "agencies-and-consultants", "nonprofits"]

// ─── Generators ────────────────────────────────────────────────────────────

const industryBySlug = (slug: string) => INDUSTRIES.find((i) => i.slug === slug)
export const industryPath = (slug: string) => `/esignature-for/${slug}`

/** One page per competitor that has no "{site} vs X" page in the files or the curated queue yet. */
export function singleComparisonCandidates(existingSlugs: Set<string>): CompetitorCandidate[] {
  return MATRIX_COMPETITORS.filter((c) => !existingSlugs.has(c.id)).map((c) => ({
    kind: "comparison",
    slug: c.id,
    keyword: c.name.toLowerCase(),
    competitor: { name: c.name, url: c.url },
    sources: c.sources,
    angle: `A reader weighing ${c.name} against {site}: what ${c.name}'s own pages say it charges and includes, and where payment at signing and phone-first signing change the answer.`,
  }))
}

/** "{site} vs A vs B" for every pair of competitors, in list order. */
export function threeWayCandidates(): CompetitorCandidate[] {
  const out: CompetitorCandidate[] = []
  MATRIX_COMPETITORS.forEach((a, i) => {
    for (const b of MATRIX_COMPETITORS.slice(i + 1)) {
      out.push({
        kind: "comparison",
        slug: `${a.id}-vs-${b.id}`,
        keyword: `${a.name} vs ${b.name}`.toLowerCase(),
        competitor: { name: a.name, url: a.url },
        sources: a.sources,
        rival: { name: b.name, url: b.url, sources: b.sources },
        angle: `A reader already choosing between ${a.name} and ${b.name}: how the two differ on their own published terms, and when a third option, {site}, fits better than either.`,
      })
    }
  })
  return out
}

/** One industry page per new industry. Existing file pages are parents only. */
export function industryCandidates(): UseCaseCandidate[] {
  return INDUSTRIES.filter((i) => !i.existing).map((i) => ({
    kind: "use-case",
    slug: i.slug,
    keyword: `esignature for ${i.name}`.toLowerCase(),
    audience: i.name,
    documents: i.documents,
    templates: i.templates,
    angle: i.angle,
  }))
}

/** One page per role, under its industry's page. */
export function roleCandidates(): UseCaseCandidate[] {
  return ROLES.filter((r) => industryBySlug(r.industry)).map((r) => ({
    kind: "use-case",
    slug: r.slug,
    keyword: `esignature for ${r.name}`.toLowerCase(),
    audience: r.name,
    documents: r.documents,
    parent: industryPath(r.industry),
    templates: industryBySlug(r.industry)?.templates,
    angle: r.angle,
  }))
}

/** One page per industry per target market, stating that market's verified law. */
export function marketCandidates(): UseCaseCandidate[] {
  return MARKET_INDUSTRIES.flatMap((slug) => {
    const industry = industryBySlug(slug)
    if (!industry) return []
    return MARKETS.map((m) => ({
      kind: "use-case" as const,
      slug: `${slug}-${m.id}`,
      keyword: `esignature for ${industry.name} ${m.id === "us" ? "usa" : m.id}`.toLowerCase(),
      audience: industry.name,
      documents: industry.documents,
      parent: industryPath(slug),
      market: { label: m.label, law: m.law },
      templates: industry.templates,
      angle: `What ${m.law.country}'s e-signature law means for the documents ${industry.name} sign: which can be signed electronically, which need more, and what the record has to show.`,
    }))
  })
}

/** "{site} vs X for an industry": a comparison read through one industry's documents. */
export function industryComparisonCandidates(): CompetitorCandidate[] {
  return COMPARED_INDUSTRIES.flatMap((slug) => {
    const industry = industryBySlug(slug)
    if (!industry) return []
    return MATRIX_COMPETITORS.map((c) => ({
      kind: "comparison" as const,
      slug: `${c.id}-for-${slug}`,
      keyword: `${c.name} alternative for ${industry.name}`.toLowerCase(),
      competitor: { name: c.name, url: c.url },
      sources: c.sources,
      industry: { name: industry.name, documents: industry.documents, path: industryPath(slug) },
      angle: `${industry.name} comparing ${c.name} with {site} for the documents they actually sign: ${industry.documents.slice(0, 3).join(", ")}.`,
    }))
  })
}

/** Every matrix candidate, given the comparison slugs that already exist. */
export function matrixCandidates(existingComparisonSlugs: Set<string>) {
  return [...singleComparisonCandidates(existingComparisonSlugs), ...industryCandidates(), ...roleCandidates(), ...marketCandidates(), ...threeWayCandidates(), ...industryComparisonCandidates()]
}

/**
 * Everything the daily run may write: the curated queue first, then the
 * matrix. A competitor the curated queue already compares is not compared
 * again; one with a file page is skipped by the picker, which checks paths.
 */
export const PAGE_QUEUE: PageCandidate[] = [...ALL_CANDIDATES, ...matrixCandidates(new Set(COMPETITOR_CANDIDATES.map((c) => c.slug)))]
