import { siteConfig } from "@/config/site"
// Was FREE_DOCUMENTS_PER_MONTH and isKitSite, for the product paragraph that
// moved to src/lib/product-summary.ts (the SEO agent's writer reads it too).
// import { FREE_DOCUMENTS_PER_MONTH } from "@/lib/esign/plans"
// import { isKitSite } from "@/config/kit"
// Was getDocs from "@/lib/docs": /docs now redirects to the Help Center.
import { getHelpArticles, helpArticlePath } from "@/lib/help"
// Was getAllPosts, getCategories and hasPosts from "@/lib/blog": the blog now
// includes the SEO agent's published articles.
import { getBlogCategories, getBlogPosts } from "@/lib/seo-agent/blog-posts"
import { productSummary } from "@/lib/product-summary"
// Was getPages and getTemplates: the SEO agent's published pages are listed too.
import type { PageKind } from "@/lib/seo/pages"
import { TEMPLATES_PATH } from "@/lib/templates"
import { libraryTemplates, registryPages } from "@/lib/seo-agent/published-pages"

// Rebuilt at most daily, and whenever the SEO agent publishes.
export const revalidate = 86400

/**
 * The landing, tool, comparison and use-case pages, one plain-language
 * section per kind, so an assistant reading this file knows what each part
 * of the site is for before it opens a link.
 */
const PAGE_SECTIONS: { kind: PageKind; heading: string; intro: string }[] = [
  { kind: "tool", heading: "Free tools", intro: "Free PDF tools that run in the browser, with no account needed." },
  { kind: "solution", heading: "Features", intro: "What the product does, one capability per page." },
  { kind: "use-case", heading: "Use cases", intro: "How the product is used in particular industries and teams." },
  { kind: "comparison", heading: "Comparisons", intro: "Side-by-side comparisons with other e-signature services, with the date their facts were checked." },
  { kind: "alternative", heading: "Alternatives", intro: "Options for people looking to switch from another e-signature service." },
  { kind: "integration", heading: "Integrations", intro: "The tools the product works with, each page saying whether the connection works today or is still being built." },
  { kind: "compliance", heading: "E-signature law", intro: "What each country's law says about electronic signatures, section by section, with the date it was checked." },
]

/**
 * llms.txt: a Markdown map of the site for large language models, following
 * the llmstxt.org convention (H1, a one-line summary, then curated link
 * lists). Built from the same siteConfig, docs manifest and blog content as
 * the sitemap, so the two never drift and it works on any deployment domain.
 * Served at /llms.txt.
 */
export async function GET(): Promise<Response> {
  const base = siteConfig.url
  const repo = siteConfig.links.github

  // Was the /docs guides; that section now redirects to the Help Center.
  // const docs = getDocs().map(
  //   (d) => `- [${d.title}](${base}/docs/${d.slug}): ${d.description}`,
  // ).join("\n")
  const docs = getHelpArticles().map(
    (a) => `- [${a.title}](${base}${helpArticlePath(a.slug)}): ${a.description}`,
  ).join("\n")

  const categories = (await getBlogCategories())
    .map((c) => `- [${c.name}](${base}/blog/category/${c.slug}): ${c.count} post${c.count === 1 ? "" : "s"}.`)
    .join("\n")

  const allPosts = await getBlogPosts()
  const posts = allPosts
    .map((p) => `- [${p.title}](${base}/blog/${p.slug}): ${p.description}`)
    .join("\n")

  // The positioning line first, when there is one: an assistant reading this
  // file summarises from the top, and a sentence written for that purpose beats
  // one assembled out of a tagline.
  const summary = siteConfig.llmsSummary ? `
${siteConfig.llmsSummary}
` : ""

  const pageSections = (await Promise.all(PAGE_SECTIONS.map(async ({ kind, heading, intro }) => {
    const pages = await registryPages([kind])
    if (pages.length === 0) return ""
    const lines = pages.map((p) => `- [${p.h1}](${base}${p.path}): ${p.description}`).join("\n")
    return `## ${heading}\n${intro}\n\n${lines}\n`
  }))).filter(Boolean).join("\n")

  const templates = await libraryTemplates()
  const templateSection = templates.length
    ? `## Templates
Ready-to-sign document templates (agreements, letters, forms), each one free to read and download.

- [All templates](${base}${TEMPLATES_PATH}): The full library, by category.
${templates.map((t) => `- [${t.h1}](${base}${t.path}): ${t.description}`).join("\n")}
`
    : ""

  const body = `# ${siteConfig.name}

> ${siteConfig.description} ${siteConfig.tagline}.
${summary}
${productSummary()}

## Documentation
${docs}

## Product
- [Home](${base}/): What ${siteConfig.name} is and who it is for.
- [Pricing](${base}/pricing): Plans and what each tier includes.
- [Changelog](${base}/changelog): Notable changes across releases (current version ${siteConfig.version}).
- [About](${base}/about): What ${siteConfig.name} is for and the thinking behind it.
- [Contact](${base}/contact): How to reach the team.${repo ? `\n- [Source code](${repo}): The public source repository.` : ""}

${pageSections}
${templateSection}
${allPosts.length > 0 ? `## Blog
- [Blog](${base}/blog): Articles and product updates.
${categories}
` : ""}
## Optional
${posts}
- [Privacy policy](${base}/privacy): How user data is handled.
- [Terms of service](${base}/terms): Terms that govern use of the site.
- [Cookie policy](${base}/cookies): Cookies used by the site.
`

  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=0, s-maxage=86400, stale-while-revalidate=86400",
    },
  })
}
