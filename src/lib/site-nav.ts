/**
 * The public site's navigation as data: which groups the top menu has, what
 * each one lists, and in what order. The desktop dropdowns, the phone menu
 * and the footer all render this one value, so a page added to the registry
 * (content/pages, src/lib/seo/pages.ts) shows up in all three at once, and
 * the three cannot drift apart.
 *
 * The grouping follows the shape established e-signature sites use: a "why
 * us" group (what you can do, who it is for), the product's free tools, head
 * to head comparisons, and resources, with Pricing as a plain link beside
 * them. Each group ends with a link to its hub page, so the full list is one
 * click away even when the menu shows a selection.
 *
 * Pure: text comes in already translated (`NavText`), pages come in already
 * loaded. src/components/landing/site-nav-data.ts does both on the server.
 */
// Types only: the menus import this file in the browser, and pages.ts reads
// the file system.
import type { PageKind, ToolId } from "@/lib/seo/pages"

export type NavLink = { href: string; label: string; description?: string }
export type NavColumn = { heading?: string; links: NavLink[] }
export type NavGroupId = "why" | "tools" | "compare" | "resources"
export type NavGroup = { id: NavGroupId; label: string; columns: NavColumn[]; footer: NavLink }
export type SiteNav = { groups: NavGroup[]; pricing: NavLink }

/** The registry fields navigation needs: nothing else is sent to the browser. */
export type NavPage = { kind: PageKind; path: string; breadcrumb: string; tool?: ToolId }

/** Every word the navigation shows, translated by the caller. */
export type NavText = {
  why: string
  // Replaced by `byIndustry`: the solution pages moved under "Use cases" (see
  // the why group below), and the industry pages took a heading of their own.
  // whatYouCanDo: string
  useCases: string
  byIndustry: string
  exploreFeatures: string
  allUseCases: string
  tools: string
  allTools: string
  toolBlurbs: Record<ToolId, string>
  compare: string
  allComparisons: string
  resources: string
  blog: string
  blogBlurb: string
  docs: string
  docsBlurb: string
  verify: string
  verifyBlurb: string
  changelog: string
  changelogBlurb: string
  faq: string
  faqBlurb: string
  pricing: string
}

export const HUB_PATHS = { tools: "/tools", compare: "/compare", useCases: "/esignature-for" } as const

/**
 * Where the menu's Pricing link lands: the plan cards themselves (the anchor
 * on the cards in plan-pricing.tsx and pricing.tsx), not the top of the page,
 * whose heading and intro pushed the cards below the fold on arrival.
 */
export const PRICING_HREF = "/pricing#plans"

export function buildSiteNav({
  pages,
  showBlog,
  text,
  toolOrder = [],
}: {
  pages: NavPage[]
  showBlog: boolean
  text: NavText
  /** The order tools are listed in (TOOL_IDS); unlisted ones go last. */
  toolOrder?: readonly ToolId[]
}): SiteNav {
  const toolRank = (p: NavPage) => {
    const i = p.tool ? toolOrder.indexOf(p.tool) : -1
    return i < 0 ? toolOrder.length : i
  }
  const of = (kind: PageKind) => pages.filter((p) => p.kind === kind)
  const link = (p: NavPage): NavLink => ({ href: p.path, label: p.breadcrumb })

  // "Use cases" lists every solution page, the same list the footer shows
  // under this group, and the industry pages follow under their own heading.
  // It used to head only the three industry pages, beside a "What you can
  // do" column holding the solutions, so the menu's use cases were three
  // where the footer's were seven. Was:
  //   { heading: text.whatYouCanDo, links: [...of("solution").map(link), { href: "/#features", label: text.exploreFeatures }] },
  //   { heading: text.useCases, links: of("use-case").map(link) },
  const why: NavGroup = {
    id: "why",
    label: text.why,
    columns: [
      { heading: text.useCases, links: of("solution").map(link) },
      { heading: text.byIndustry, links: [...of("use-case").map(link), { href: "/#features", label: text.exploreFeatures }] },
    ],
    footer: { href: HUB_PATHS.useCases, label: text.allUseCases },
  }

  const tools: NavGroup = {
    id: "tools",
    label: text.tools,
    // In the given order (sign a PDF first), not the files' alphabetical one.
    columns: [{ links: of("tool").sort((a, b) => toolRank(a) - toolRank(b)).map((p) => ({ ...link(p), description: p.tool ? text.toolBlurbs[p.tool] : undefined })) }],
    footer: { href: HUB_PATHS.tools, label: text.allTools },
  }

  // Alternatives sit with comparisons: both answer "how does it compare".
  const compare: NavGroup = {
    id: "compare",
    label: text.compare,
    columns: [{ links: [...of("comparison"), ...of("alternative")].map(link) }],
    footer: { href: HUB_PATHS.compare, label: text.allComparisons },
  }

  const resources: NavGroup = {
    id: "resources",
    label: text.resources,
    columns: [
      {
        links: [
          // An empty blog gets no link (hasPosts()).
          ...(showBlog ? [{ href: "/blog", label: text.blog, description: text.blogBlurb }] : []),
          { href: "/docs", label: text.docs, description: text.docsBlurb },
          { href: "/verify", label: text.verify, description: text.verifyBlurb },
          { href: "/changelog", label: text.changelog, description: text.changelogBlurb },
        ],
      },
    ],
    footer: { href: "/#faq", label: text.faq, description: text.faqBlurb },
  }

  // A group with nothing in it (a deployment that removed every comparison)
  // is left out rather than shown as an empty dropdown.
  const groups = [why, tools, compare, resources].filter((g) => g.columns.some((c) => c.links.length > 0))
  // Was href "/pricing": opened the page at its heading, cards out of sight.
  return { groups, pricing: { href: PRICING_HREF, label: text.pricing } }
}

/** True when `pathname` is the link's page or below it: marks the open group's current page. */
export function isCurrent(href: string, pathname: string): boolean {
  // A home-page section (/#features, /#faq) is never "the current page", but
  // an anchor into another page (/pricing#plans) is that page. Was:
  //   if (href.includes("#")) return false
  if (href.startsWith("/#")) return false
  const path = href.split("#")[0]
  return pathname === path || pathname.startsWith(`${path}/`)
}
