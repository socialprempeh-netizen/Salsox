/**
 * Metadata for a registry page (src/lib/seo/pages.ts): unique title and
 * description from its frontmatter, a canonical URL without query strings,
 * Open Graph and Twitter cards (the image comes from the route's
 * opengraph-image file), and hreflang alternates when, and only when, the
 * page exists in more than one language.
 *
 * Builds on pageMetadata in src/lib/metadata.ts so these pages share the
 * site's conventions; the one difference is that the social image is left to
 * the per-page generated card rather than the site-wide one.
 */
import type { Metadata } from "next"
import { pageMetadata } from "@/lib/metadata"
import { localizedPath } from "@/i18n/alternates"
import { siteConfig } from "@/config/site"
import { routing } from "@/i18n/routing"
import type { SitePage } from "./pages"

/** hreflang alternates for a page in several locales, with x-default; empty for one. */
export function languageAlternates(path: string, locales: string[]): Record<string, string> | undefined {
  if (locales.length < 2) return undefined
  const url = (locale: string) => `${siteConfig.url}${localizedPath(path, locale)}`
  return { ...Object.fromEntries(locales.map((l) => [l, url(l)])), "x-default": url(routing.defaultLocale) }
}

export function sitePageMetadata(page: SitePage): Metadata {
  const base = pageMetadata({ title: page.title, description: page.description, path: page.path })
  const languages = languageAlternates(page.path, page.locales)
  return {
    ...base,
    alternates: { canonical: `${siteConfig.url}${localizedPath(page.path, page.locale)}`, ...(languages ? { languages } : {}) },
    // The per-page card from the route's opengraph-image file replaces the
    // site-wide one; without an images entry here, Next uses the file.
    openGraph: { ...base.openGraph, images: undefined },
    twitter: { ...base.twitter, images: undefined },
  }
}
