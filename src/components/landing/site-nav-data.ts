/**
 * Loads the public navigation (src/lib/site-nav.ts) on the server: pages from
 * the registry, words from the "nav" messages. The navbar hands the result to
 * its client menus as plain data, and the footer renders the same value, so
 * neither the browser bundle nor the client message areas carry the registry.
 */
import { getTranslations } from "next-intl/server"
import { siteConfig } from "@/config/site"
import { hasPosts } from "@/lib/blog"
import { getPages, TOOL_IDS } from "@/lib/seo/pages"
import { buildSiteNav, type SiteNav } from "@/lib/site-nav"

export async function getSiteNav(): Promise<SiteNav> {
  const t = await getTranslations("nav")
  const pages = getPages().map(({ kind, path, breadcrumb, tool }) => ({ kind, path, breadcrumb, tool }))
  return buildSiteNav({
    pages,
    showBlog: hasPosts(),
    toolOrder: TOOL_IDS,
    text: {
      why: t("menu.why", { site: siteConfig.name }),
      whatYouCanDo: t("menu.whatYouCanDo"),
      useCases: t("menu.useCases"),
      exploreFeatures: t("menu.exploreFeatures"),
      allUseCases: t("menu.allUseCases"),
      tools: t("menu.tools"),
      allTools: t("menu.allTools"),
      toolBlurbs: {
        "sign-pdf": t("menu.toolBlurbs.signPdf"),
        "add-signature-to-pdf": t("menu.toolBlurbs.addSignature"),
        "fill-and-sign-pdf": t("menu.toolBlurbs.fillAndSign"),
        "request-signature": t("menu.toolBlurbs.requestSignature"),
        "pdf-signature-generator": t("menu.toolBlurbs.signatureGenerator"),
      },
      compare: t("menu.compare"),
      allComparisons: t("menu.allComparisons"),
      resources: t("menu.resources"),
      blog: t("blog"),
      blogBlurb: t("menu.blogBlurb"),
      docs: t("menu.docs"),
      docsBlurb: t("menu.docsBlurb"),
      verify: t("menu.verify"),
      verifyBlurb: t("menu.verifyBlurb"),
      changelog: t("changelog"),
      changelogBlurb: t("menu.changelogBlurb"),
      faq: t("faq"),
      faqBlurb: t("menu.faqBlurb"),
      pricing: t("pricing"),
    },
  })
}
