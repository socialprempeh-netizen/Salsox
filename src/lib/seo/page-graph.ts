/**
 * What a registry page (src/lib/seo/pages.ts) says about itself: its
 * breadcrumb trail and its structured data, built from the same values the
 * page renders, so the markup cannot describe something the page does not
 * show.
 *
 * - every page: WebPage and BreadcrumbList;
 * - a tool: WebApplication (it is one, and it is free);
 * - any page with an FAQ section: FAQPage, from the questions printed on it.
 *
 * Comparison and use-case pages get no product offers or ratings: the offers
 * live on /pricing (src/lib/pricing-jsonld.ts), and no page has reviews to
 * mark up.
 */
import { breadcrumbJsonLd, faqPageJsonLd, webApplicationJsonLd, webPageJsonLd, type Crumb } from "./jsonld"
import type { PageKind, SitePage } from "./pages"

/** The hub each kind sits under in the trail, if any. */
export const HUB: Partial<Record<PageKind, { path: string; key: "tools" | "compare" | "useCases" }>> = {
  tool: { path: "/tools", key: "tools" },
  comparison: { path: "/compare", key: "compare" },
  alternative: { path: "/compare", key: "compare" },
  "use-case": { path: "/esignature-for", key: "useCases" },
}

/** Home, the hub (when there is one), the page. Labels come from the caller's messages. */
export function pageTrail(page: Pick<SitePage, "kind" | "path" | "breadcrumb">, labels: { home: string; tools: string; compare: string; useCases: string }): Crumb[] {
  const hub = HUB[page.kind]
  return [
    { name: labels.home, href: "/" },
    ...(hub ? [{ name: labels[hub.key], href: hub.path }] : []),
    { name: page.breadcrumb, href: page.path },
  ]
}

export function pageGraph(page: SitePage, trail: Crumb[]): object[] {
  const graphs: (object | null)[] = [
    webPageJsonLd({ path: page.path, name: page.h1, description: page.description, dateModified: page.updated }),
    breadcrumbJsonLd(trail),
    page.kind === "tool"
      ? webApplicationJsonLd({
          path: page.path,
          name: page.h1,
          description: page.description,
          features: [...page.howItWorks.map((s) => s.title), ...page.benefits.map((b) => b.title)],
        })
      : null,
    faqPageJsonLd(page.faq),
  ]
  return graphs.filter((g): g is object => g !== null)
}
