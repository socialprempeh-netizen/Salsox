import type { Metadata } from "next"

import { BlogIndex } from "@/components/blog/blog-index"
import { siteConfig } from "@/config/site"
import { pageMetadata } from "@/lib/metadata"
import { hasPosts } from "@/lib/blog"

export const metadata: Metadata = {
  ...pageMetadata({
    title: `Blog | ${siteConfig.name}`,
    description: `Guides, product updates and build notes from ${siteConfig.name}.`,
    path: "/blog",
  }),
  // Keeps the feed discoverable alongside the canonical the helper builds.
  alternates: {
    canonical: `${siteConfig.url}/blog`,
    types: { "application/rss+xml": "/blog/rss.xml" },
  },
  // Still reachable while empty (an old link, a typed URL), but not a page
  // to index until the first post is published. Nothing links to it then:
  // see hasPosts() in src/lib/blog.ts.
  ...(hasPosts() ? {} : { robots: { index: false, follow: true } }),
}

export default function BlogIndexPage() {
  return <BlogIndex page={1} />
}
