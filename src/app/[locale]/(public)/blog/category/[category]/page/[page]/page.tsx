import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { CategoryIndex } from "@/components/blog/category-index"
import { getCategories, paginate } from "@/lib/blog"
// Was getPostsByCategory: a category counts the SEO agent's articles too.
import { getBlogPostsByCategory } from "@/lib/seo-agent/blog-posts"
import { siteConfig } from "@/config/site"
import { pageMetadata } from "@/lib/metadata"

/** Pages two and up of a category. Page 1 stays at the bare category address. */
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
  const categories = getCategories()
  const counts = await Promise.all(categories.map((c) => getBlogPostsByCategory(c.slug)))
  return categories.flatMap((c, i) => {
    const { totalPages } = paginate(counts[i], 1)
    return Array.from({ length: Math.max(0, totalPages - 1) }, (_, i) => ({
      category: c.slug,
      page: String(i + 2),
    }))
  })
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string; page: string }>
}): Promise<Metadata> {
  const { category, page } = await params
  const match = getCategories().find((c) => c.slug === category)
  if (!match) return {}

  return pageMetadata({
    title: `${match.name}, page ${page} | ${siteConfig.name}`,
    path: `/blog/category/${category}/page/${page}`,
  })
}

export default async function BlogCategoryPagedPage({
  params,
}: {
  params: Promise<{ category: string; page: string }>
}) {
  const { category, page } = await params
  const n = Number(page)
  if (!getCategories().some((c) => c.slug === category)) notFound()

  const { totalPages } = paginate(await getBlogPostsByCategory(category), 1)
  if (!Number.isInteger(n) || n < 2 || n > totalPages) notFound()

  return <CategoryIndex category={category} page={n} />
}
