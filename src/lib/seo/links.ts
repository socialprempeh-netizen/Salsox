/**
 * Internal links, resolved to something a reader can choose between: a path,
 * a short name and one line about where it goes.
 *
 * The internal linking plan (homepage → product pages → free tools → signup;
 * guides → the pages they support; comparisons → signup) is expressed as
 * lists of paths in the content files. This turns a path into a card the
 * same way wherever it appears, from the page registry, the blog, or the
 * small set of fixed routes below, so a renamed page renames every link to it.
 *
 * Unknown paths are dropped rather than rendered as dead links; the content
 * tests (src/lib/seo/pages.test.ts) are what make sure there are none.
 */
import { getAllPosts } from "@/lib/blog"
import { getPages } from "./pages"

export type LinkCard = { href: string; name: string; description: string }

/** Labels for routes outside the registry and the blog, from the caller's messages. */
export type FixedLabels = Record<string, { name: string; description: string }>

export function resolveLinks(paths: string[], fixed: FixedLabels): LinkCard[] {
  const pages = new Map(getPages().map((p) => [p.path, { name: p.breadcrumb, description: p.description }]))
  const posts = new Map(getAllPosts().map((p) => [`/blog/${p.slug}`, { name: p.title, description: p.description }]))
  return paths.flatMap((href) => {
    const found = pages.get(href) ?? posts.get(href) ?? fixed[href]
    return found ? [{ href, ...found }] : []
  })
}
