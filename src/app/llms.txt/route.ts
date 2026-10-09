import { siteConfig } from "@/config/site"
import { FREE_DOCUMENTS_PER_MONTH } from "@/lib/esign/plans"
import { isKitSite } from "@/config/kit"
import { getDocs } from "@/lib/docs"
import { getAllPosts, getCategories, hasPosts } from "@/lib/blog"

/**
 * llms.txt: a Markdown map of the site for large language models, following
 * the llmstxt.org convention (H1, a one-line summary, then curated link
 * lists). Built from the same siteConfig, docs manifest and blog content as
 * the sitemap, so the two never drift and it works on any deployment domain.
 * Served at /llms.txt.
 */
export function GET(): Response {
  const base = siteConfig.url
  const repo = siteConfig.links.github

  const docs = getDocs().map(
    (d) => `- [${d.title}](${base}/docs/${d.slug}): ${d.description}`,
  ).join("\n")

  const categories = getCategories()
    .map((c) => `- [${c.name}](${base}/blog/category/${c.slug}): ${c.count} post${c.count === 1 ? "" : "s"}.`)
    .join("\n")

  const posts = getAllPosts()
    .map((p) => `- [${p.title}](${base}/blog/${p.slug}): ${p.description}`)
    .join("\n")

  // The positioning line first, when there is one: an assistant reading this
  // file summarises from the top, and a sentence written for that purpose beats
  // one assembled out of a tagline.
  const summary = siteConfig.llmsSummary ? `
${siteConfig.llmsSummary}
` : ""

  const body = `# ${siteConfig.name}

> ${siteConfig.description} ${siteConfig.tagline}.
${summary}
${
    isKitSite
      ? `${siteConfig.name} is an open-source, production-ready SaaS starter kit. It ships with authentication, Stripe billing, a Postgres database via Prisma, a file-based blog and docs, transactional email and a full dashboard, so you can launch a real product without wiring the plumbing yourself.`
      : // Was the kit's placeholder ("${siteConfig.name} is a SaaS product... Replace
        // this paragraph with a short description of what you do"), served
        // as-is to every assistant that read this file.
        `${siteConfig.name} is an e-signature service built for phones. Senders upload any PDF, choose who signs, and send it by email, WhatsApp or SMS; signers need no account or app and sign one field at a time in their browser. Documents can collect a payment as part of signing (Sign & Pay, by card or mobile money through Stripe or Paystack), go to signers in a set order, and finish as a sealed PDF with an audit certificate. Free accounts send ${FREE_DOCUMENTS_PER_MONTH} documents a month; paid plans send unlimited documents.`
  }

## Documentation
${docs}

## Product
- [Home](${base}/): What ${siteConfig.name} is and who it is for.
- [Pricing](${base}/pricing): Plans and what each tier includes.
- [Changelog](${base}/changelog): Notable changes across releases (current version ${siteConfig.version}).
- [About](${base}/about): What ${siteConfig.name} is for and the thinking behind it.
- [Contact](${base}/contact): How to reach the team.${repo ? `\n- [Source code](${repo}): The public source repository.` : ""}

${hasPosts() ? `## Blog
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
