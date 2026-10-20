/**
 * /admin/seo/agent/[id]: one article the SEO agent wrote, rendered the way
 * the blog will show it (FAQ included), so a draft can be read before it is
 * published. Publish and Discard sit at the top. Admin only; drafts are not
 * reachable anywhere else.
 */
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { ArrowLeft } from "lucide-react"
import { getCurrentUser } from "@/lib/auth"
import { articleMarkdown } from "@/lib/seo-agent/article"
import { getArticle } from "@/lib/seo-agent/store"
import { MarkdownBody } from "@/components/seo/markdown-body"
import { AdminReveal } from "@/components/admin/admin-reveal"
import { DraftActions } from "@/components/admin/seo-agent-console"

export const dynamic = "force-dynamic"
export const maxDuration = 300

export default async function SeoAgentArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user || user.role !== "ADMIN") redirect("/dashboard")
  const { id } = await params
  const article = await getArticle(id).catch(() => null)
  if (!article) notFound()
  const t = await getTranslations("admin.seoAgent")
  const faq = Array.isArray(article.faq) ? (article.faq as { q: string; a: string }[]) : []
  const path = `/blog/${article.slug}`
  const status = article.target.status

  return (
    <div className="space-y-6">
      <Link href="/admin/seo/agent" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft aria-hidden className="h-4 w-4" />
        {t("back")}
      </Link>

      <AdminReveal className="flex flex-col gap-3 border border-border border-l-2 border-l-amber-500 bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="min-w-0 break-words text-sm">
          {status === "PUBLISHED" ? t("publishedBanner", { path }) : status === "DISCARDED" ? t("discardedBanner") : t("draftBanner", { path })}
        </p>
        {status === "DRAFT" && <DraftActions articleId={article.id} />}
      </AdminReveal>

      <AdminReveal index={1} className="mx-auto max-w-3xl">
        <p className="text-sm text-muted-foreground">{t("query", { keyword: article.keyword })}</p>
        <h1 className="mt-2 break-words text-3xl font-bold tracking-tight">{article.title}</h1>
        <p className="mt-3 text-lg text-muted-foreground">{article.description}</p>
        <div className="mt-8 min-w-0">
          <MarkdownBody source={articleMarkdown(article.body, faq)} />
        </div>
      </AdminReveal>
    </div>
  )
}
