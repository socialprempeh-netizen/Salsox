/**
 * The blog as readers see it: the Markdown posts in content/blog plus the
 * articles the SEO agent published, which live in the database.
 *
 * Every public blog surface (the index and its pages, categories, the post
 * page, the feed, the sitemap, /llms.txt) reads posts through here instead of
 * src/lib/blog.ts directly, so a published article appears everywhere a file
 * post does. A file post wins over an article with the same slug; the agent
 * never picks a taken slug, so that only matters if a file is added later.
 *
 * This and site.ts are the two places the seo-agent module touches the app
 * around it.
 */
import { siteConfig } from "@/config/site"
import { categoriesOf, categorySlug, getAllPosts, getPost, type Category, type Post } from "@/lib/blog"
import { articleJsonLd, articleMarkdown, countWords } from "./article"
import { publishedArticle, publishedArticles, type PublishedArticle } from "./store"

const day = (d: Date) => d.toISOString().slice(0, 10)
const fill = (text: string) => text.replaceAll("{site}", siteConfig.name)

/** An article in the blog's own shape, its FAQ rendered into the body. */
export function articleAsPost(a: PublishedArticle): Post {
  const content = fill(articleMarkdown(a.body, a.faq))
  const date = day(a.publishedAt)
  const updated = day(a.updatedAt)
  return {
    slug: a.slug,
    title: fill(a.title),
    description: fill(a.description),
    date,
    updated: updated > date ? updated : undefined,
    category: a.category,
    keyword: a.keyword,
    faq: a.faq.map(({ q, a: answer }) => ({ q: fill(q), a: fill(answer) })),
    related: a.related,
    content,
    readingMinutes: Math.max(1, Math.round(countWords(content) / 220)),
  }
}

/** Every post, files and published articles, newest first. */
export async function getBlogPosts(): Promise<Post[]> {
  const files = getAllPosts()
  const taken = new Set(files.map((p) => p.slug))
  const articles = (await publishedArticles()).filter((a) => !taken.has(a.slug)).map(articleAsPost)
  return [...files, ...articles].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
}

export type BlogPost = { post: Post; source: "file" } | { post: Post; source: "agent"; jsonLd: object[] }

/** One post by slug, with the agent's own structured data when it is an article. */
export async function getBlogPost(slug: string): Promise<BlogPost | undefined> {
  const file = getPost(slug)
  if (file) return { post: file, source: "file" }
  const article = await publishedArticle(slug)
  if (!article) return undefined
  const post = articleAsPost(article)
  const jsonLd = articleJsonLd({
    siteName: siteConfig.name,
    siteUrl: siteConfig.url,
    siteDescription: siteConfig.description,
    slug: post.slug,
    title: post.title,
    description: post.description,
    keyword: article.keyword,
    faq: post.faq ?? [],
    publishedAt: article.publishedAt.toISOString(),
    updatedAt: article.updatedAt.toISOString(),
  })
  return { post, source: "agent", jsonLd }
}

export async function getBlogCategories(): Promise<Category[]> {
  return categoriesOf(await getBlogPosts())
}

export async function getBlogPostsByCategory(slug: string): Promise<Post[]> {
  return (await getBlogPosts()).filter((p) => categorySlug(p.category) === slug)
}
