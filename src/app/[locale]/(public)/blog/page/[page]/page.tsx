import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { BlogIndex } from "@/components/blog/blog-index"
import { paginate } from "@/lib/blog"
// Was getAllPosts: the archive counts the SEO agent's articles too.
import { getBlogPosts } from "@/lib/seo-agent/blog-posts"
import { siteConfig } from "@/config/site"
import { pageMetadata } from "@/lib/metadata"

/**
 * Pages two and up of the archive, as real prerendered routes.
 *
 * Page 1 is not generated here: it lives at the bare /blog, so the same list
 * never answers at two addresses. A number past the end is a 404 rather than
 * an empty page, because an address that renders nothing still looks valid to
 * a crawler.
 */
// Posts are files, so every valid address is known at build time. Anything
// else is a 404 without rendering: with no posts at all, an on-demand render
// of an unknown slug used to hit the navbar's session read and answer 500.
// Was `dynamicParams = false` with the note below. The SEO agent publishes
// articles between deploys, which can add a page to the archive: a page not
// built ahead renders on its first request, and a number past the end is
// still a 404 (checked in the page).
//   Posts are files, so every valid address is known at build time. Anything
//   else is a 404 without rendering: with no posts at all, an on-demand render
//   of an unknown slug used to hit the navbar's session read and answer 500.
// export const dynamicParams = false
export const dynamicParams = true

export async function generateStaticParams() {
  const { totalPages } = paginate(await getBlogPosts(), 1)
  return Array.from({ length: Math.max(0, totalPages - 1) }, (_, i) => ({
    page: String(i + 2),
  }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ page: string }>
}): Promise<Metadata> {
  const { page } = await params
  return pageMetadata({
    title: `Blog, page ${page} | ${siteConfig.name}`,
    description: `Guides, product updates and build notes from ${siteConfig.name}.`,
    path: `/blog/page/${page}`,
  })
}

export default async function BlogPagedIndexPage({
  params,
}: {
  params: Promise<{ page: string }>
}) {
  const { page } = await params
  const n = Number(page)
  const { totalPages } = paginate(await getBlogPosts(), 1)

  if (!Number.isInteger(n) || n < 2 || n > totalPages) notFound()

  return <BlogIndex page={n} />
}
