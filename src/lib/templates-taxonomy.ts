/**
 * How the template library is organised: categories (what the document is),
 * types (its form: agreement, proposal, invoice…), industries and teams.
 * Every template file (content/templates/*.md) is tagged with ids from here,
 * and the library's filters, category pages and the industry and team pages
 * all read the same lists, so a template appears everywhere it belongs.
 *
 * Labels and descriptions are not here: they are user-facing text and live in
 * src/locales/en.json under `templates.taxonomy`, keyed by these ids.
 *
 * The categories were chosen from the documents small businesses most often
 * need signed (proposals, quotes, contracts, NDAs, employment and HR forms,
 * consent and waivers, orders, SOWs, leases, construction), the same ground
 * the large e-signature vendors' public libraries cover. The templates
 * themselves are written for Salsox; none is copied from anyone.
 *
 * Industry and team pages are pages of the existing SEO registry
 * (src/lib/seo/pages.ts, kind "use-case", under /esignature-for), not a
 * second page system: each entry below names the registry page that serves
 * it, and that page lists the matching templates. Real estate and HR reuse
 * the pages that already existed.
 */

export const TEMPLATE_CATEGORIES = [
  "proposals",
  "quotes",
  "invoices",
  "contracts",
  "nda",
  "freelance",
  "employment",
  "forms",
  "orders",
  "sow",
  "rentals",
  "construction",
] as const
export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number]

export const TEMPLATE_TYPES = ["agreement", "proposal", "quote", "invoice", "form", "letter", "order"] as const
export type TemplateType = (typeof TEMPLATE_TYPES)[number]

/** Industries, each with the registry page that serves it. */
export const TEMPLATE_INDUSTRIES = {
  software: "/esignature-for/software-companies",
  "professional-services": "/esignature-for/professional-services",
  education: "/esignature-for/schools",
  healthcare: "/esignature-for/clinics",
  construction: "/esignature-for/contractors",
  "real-estate": "/esignature-for/real-estate",
  finance: "/esignature-for/accountants",
  marketing: "/esignature-for/agencies-and-consultants",
  legal: "/esignature-for/law-firms",
  recruitment: "/esignature-for/recruitment",
  manufacturing: "/esignature-for/manufacturing",
  retail: "/esignature-for/retail",
} as const
export type TemplateIndustry = keyof typeof TEMPLATE_INDUSTRIES
export const INDUSTRY_IDS = Object.keys(TEMPLATE_INDUSTRIES) as TemplateIndustry[]

/** Teams, each with the registry page that serves it. */
export const TEMPLATE_TEAMS = {
  sales: "/esignature-for/sales-teams",
  hr: "/esignature-for/hr",
  marketing: "/esignature-for/marketing-teams",
  "customer-success": "/esignature-for/customer-success",
  legal: "/esignature-for/legal-teams",
} as const
export type TemplateTeam = keyof typeof TEMPLATE_TEAMS
export const TEAM_IDS = Object.keys(TEMPLATE_TEAMS) as TemplateTeam[]

/** Where a category's own page lives. */
export const categoryPath = (category: TemplateCategory) => `/templates/category/${category}`

/** A category gets an indexable page only with at least this many templates: fewer would be a thin page. */
export const MIN_TEMPLATES_PER_CATEGORY_PAGE = 3
