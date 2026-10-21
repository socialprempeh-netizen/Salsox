"use client"

/**
 * The interactive parts of the SEO agent tab (/admin/seo/agent): the run
 * buttons, the publishing mode, the list of articles with their Publish,
 * Discard and Unpublish actions, and the orphan pages to review. The page
 * around them is a server component that loads the data; these only call the
 * server actions (src/app/actions/seo-agent.ts) and refresh.
 *
 * - Publishing mode: two choices, each a row with a square check, and a tint
 *   that slides to the chosen one; under them three square slots that fill as
 *   the first three articles are written, which is the review period before
 *   auto-publishing starts.
 * - Articles: one card per run's target, newest first, single column at
 *   every width so a phone never scrolls sideways. A destructive action
 *   (Discard, Unpublish) asks for a second tap.
 *
 * Motion: rows animate into their new state when an action changes it, and
 * the mode indicator slides (framer-motion). Under prefers-reduced-motion
 * everything snaps.
 */
import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { useFormatter, useTranslations } from "next-intl"
import { toast } from "sonner"
import { Check, ExternalLink, FilePlus2, FileText, Play, Radar } from "lucide-react"
import { Button } from "@/components/ui/button"
import { crawlNow, discardDraft, publishDraft, runAgentNow, setOrphanReview, setReviewEveryArticle, unpublish, type SeoAgentResult } from "@/app/actions/seo-agent"
import { Chip, Empty, type Tone } from "@/components/admin/admin-ui"
import { cn } from "@/lib/utils"

export type TargetStatus = "WRITING" | "DRAFT" | "PUBLISHED" | "DISCARDED" | "FAILED"

export type ArticleRow = {
  id: string
  keyword: string
  status: TargetStatus
  createdAt: string
  impressions: number
  clicks: number
  position: number
  page: string | null
  error: string | null
  article: { id: string; slug: string; title: string; description: string; autoPublished: boolean; links: number } | null
}

export type OrphanRow = { path: string; status: "OPEN" | "REVIEWED" }

// The console's shared Chip tones. Was its own class strings, with sky blue
// for WRITING; that is the brand teal (info) now.
const STATUS_TONE: Record<TargetStatus, Tone> = {
  WRITING: "info",
  DRAFT: "warn",
  PUBLISHED: "good",
  DISCARDED: "default",
  FAILED: "bad",
}

/** Runs an action, toasts its outcome, refreshes the page on success. */
function useAction() {
  const t = useTranslations("admin.seoAgent")
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [busy, setBusy] = useState<string | null>(null)
  const run = (key: string, action: () => Promise<SeoAgentResult>, success: string) => {
    setBusy(key)
    startTransition(async () => {
      try {
        const result = await action()
        if (result.ok) {
          toast.success(success, result.message ? { description: result.message } : undefined)
          router.refresh()
        } else toast.error(result.message ?? t("actionFailed"))
      } catch {
        toast.error(t("actionFailed"))
      } finally {
        setBusy(null)
      }
    })
  }
  return { run, pending, busy }
}

export function AgentRunButtons({ canRun }: { canRun: boolean }) {
  const t = useTranslations("admin.seoAgent")
  const { run, pending, busy } = useAction()
  return (
    <div className="flex shrink-0 flex-wrap gap-2">
      <Button size="sm" variant="outline" loading={pending && busy === "crawl"} disabled={pending} onClick={() => run("crawl", crawlNow, t("crawlDone"))}>
        <Radar aria-hidden className="h-4 w-4" />
        {pending && busy === "crawl" ? t("crawling") : t("crawlNow")}
      </Button>
      <Button size="sm" loading={pending && busy === "run"} disabled={pending || !canRun} onClick={() => run("run", runAgentNow, t("runDone"))}>
        <Play aria-hidden className="h-4 w-4" />
        {pending && busy === "run" ? t("running") : t("runNow")}
      </Button>
    </div>
  )
}

export function PublishingMode({ reviewEvery, written, reviewFirst }: { reviewEvery: boolean; written: number; reviewFirst: number }) {
  const t = useTranslations("admin.seoAgent")
  const reduceMotion = useReducedMotion()
  const { run, pending } = useAction()
  const [value, setValue] = useState(reviewEvery)
  const left = Math.max(0, reviewFirst - written)

  const choose = (next: boolean) => {
    if (next === value || pending) return
    setValue(next)
    run("mode", async () => {
      const result = await setReviewEveryArticle(next)
      if (!result.ok) setValue(!next)
      return result
    }, t("modeSaved"))
  }

  const options = [
    { on: false, label: t("modeAuto", { count: reviewFirst }) },
    { on: true, label: t("modeReview") },
  ]

  return (
    <div className="space-y-4">
      {/* Was a two-cell switch filled solid teal on the chosen side; now rows
          with a square check, the chosen one tinted and outlined. */}
      <div role="radiogroup" aria-label={t("modeLabel")} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {options.map((option) => {
          const active = option.on === value
          return (
            <button
              key={String(option.on)}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={pending}
              onClick={() => choose(option.on)}
              className={cn(
                "relative flex min-h-14 items-center gap-3 border px-4 py-3 text-left text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60",
                active ? "border-primary/50 text-foreground" : "border-border text-muted-foreground hover:border-foreground/25 hover:text-foreground"
              )}
            >
              {active && (
                <motion.span
                  layoutId="seo-agent-mode"
                  aria-hidden
                  className="absolute inset-0 bg-primary/[0.07]"
                  transition={reduceMotion ? { duration: 0 } : { type: "spring", bounce: 0.12, duration: 0.35 }}
                />
              )}
              <span aria-hidden className={cn("relative flex h-5 w-5 shrink-0 items-center justify-center border transition-colors", active ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card")}>
                <AnimatePresence initial={false}>
                  {active && (
                    <motion.span key="check" initial={reduceMotion ? false : { scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }} transition={{ duration: 0.15 }}>
                      <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                    </motion.span>
                  )}
                </AnimatePresence>
              </span>
              <span className="relative">{option.label}</span>
            </button>
          )
        })}
      </div>

      <div className="flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:items-center sm:gap-3">
        <div className="flex gap-1" aria-hidden>
          {Array.from({ length: reviewFirst }, (_, i) => (
            <motion.span
              key={i}
              initial={false}
              animate={{ scale: i < written ? 1 : 0.85 }}
              transition={reduceMotion ? { duration: 0 } : { delay: i * 0.08, duration: 0.25 }}
              className={cn("h-4 w-4 border", i < written ? "border-primary bg-primary" : "border-border bg-muted/40")}
            />
          ))}
        </div>
        <p className="text-sm text-muted-foreground">{value ? t("trialReview") : left > 0 ? t("trialLeft", { count: left }) : t("trialDone")}</p>
      </div>
    </div>
  )
}

export function ArticleList({ rows }: { rows: ArticleRow[] }) {
  const t = useTranslations("admin.seoAgent")
  const format = useFormatter()
  const reduceMotion = useReducedMotion()
  const { run, pending, busy } = useAction()
  // The row whose destructive action is armed by a first tap.
  const [armed, setArmed] = useState<string | null>(null)

  if (rows.length === 0) return <Empty icon={FilePlus2}>{t("noArticles")}</Empty>

  const confirmThen = (key: string, go: () => void) => {
    if (armed === key) {
      setArmed(null)
      go()
    } else setArmed(key)
  }

  return (
    <ul className="divide-y divide-border">
      <AnimatePresence initial={false}>
        {rows.map((row) => {
          const a = row.article
          const busyHere = pending && busy?.endsWith(row.id)
          return (
            <motion.li
              key={row.id}
              layout={!reduceMotion}
              initial={reduceMotion ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: busyHere ? 0.6 : 1, y: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="min-w-0 p-4 sm:px-5"
            >
              <div className="flex flex-wrap items-center gap-2">
                <motion.span key={row.status} initial={reduceMotion ? false : { opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="inline-flex">
                  <Chip tone={STATUS_TONE[row.status]}>{t(`status.${row.status}`)}</Chip>
                </motion.span>
                {a?.autoPublished && row.status === "PUBLISHED" && <span className="text-xs text-muted-foreground">{t("auto")}</span>}
                <span className="ml-auto text-xs text-muted-foreground">{format.dateTime(new Date(row.createdAt), { dateStyle: "medium" })}</span>
              </div>

              <h3 className="mt-2.5 break-words font-semibold tracking-tight">{a?.title ?? row.keyword}</h3>
              <p className="mt-0.5 break-words text-sm text-muted-foreground">{t("query", { keyword: row.keyword })}</p>

              <dl className="mt-3 grid grid-cols-3 divide-x divide-border border border-border bg-muted/25 text-sm sm:max-w-sm [&>div]:px-3 [&>div]:py-2">
                <div>
                  <dt className="text-xs text-muted-foreground">{t("impressions")}</dt>
                  <dd className="font-semibold tabular-nums">{format.number(row.impressions)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t("clicks")}</dt>
                  <dd className="font-semibold tabular-nums">{format.number(row.clicks)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t("position")}</dt>
                  <dd className="font-semibold tabular-nums">{row.position.toFixed(1)}</dd>
                </div>
              </dl>

              {row.status === "FAILED" && row.error && <p className="mt-3 break-words border-l-2 border-destructive pl-3 text-sm text-destructive">{t("failedReason", { error: row.error })}</p>}
              {row.status === "PUBLISHED" && a && <p className="mt-3 text-sm text-muted-foreground">{t("links", { count: a.links })}</p>}

              {a && (row.status === "DRAFT" || row.status === "PUBLISHED") && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {row.status === "DRAFT" && (
                    <>
                      <Button size="sm" disabled={pending} loading={busy === `publish:${row.id}`} onClick={() => run(`publish:${row.id}`, () => publishDraft(a.id), t("publishedToast"))}>
                        {busy === `publish:${row.id}` ? t("publishing") : t("publish")}
                      </Button>
                      <Button size="sm" variant="outline" asChild>
                        <Link href={`/admin/seo/agent/${a.id}`}>
                          <FileText aria-hidden className="h-4 w-4" />
                          {t("preview")}
                        </Link>
                      </Button>
                      <Button
                        size="sm"
                        variant={armed === `discard:${row.id}` ? "destructive" : "ghost"}
                        disabled={pending}
                        onClick={() => confirmThen(`discard:${row.id}`, () => run(`discard:${row.id}`, () => discardDraft(a.id), t("discardedToast")))}
                      >
                        {armed === `discard:${row.id}` ? t("confirmDiscard") : t("discard")}
                      </Button>
                    </>
                  )}
                  {row.status === "PUBLISHED" && (
                    <>
                      <Button size="sm" variant="outline" asChild>
                        <a href={`/blog/${a.slug}`} target="_blank" rel="noopener noreferrer">
                          <ExternalLink aria-hidden className="h-4 w-4" />
                          {t("view")}
                        </a>
                      </Button>
                      <Button
                        size="sm"
                        variant={armed === `unpublish:${row.id}` ? "destructive" : "ghost"}
                        disabled={pending}
                        onClick={() => confirmThen(`unpublish:${row.id}`, () => run(`unpublish:${row.id}`, () => unpublish(a.id), t("unpublishedToast")))}
                      >
                        {armed === `unpublish:${row.id}` ? t("confirmUnpublish") : t("unpublish")}
                      </Button>
                    </>
                  )}
                </div>
              )}
            </motion.li>
          )
        })}
      </AnimatePresence>
    </ul>
  )
}

export function DraftActions({ articleId }: { articleId: string }) {
  const t = useTranslations("admin.seoAgent")
  const router = useRouter()
  const { run, pending, busy } = useAction()
  const [armed, setArmed] = useState(false)
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        size="sm"
        disabled={pending}
        loading={busy === "publish"}
        onClick={() =>
          run("publish", async () => {
            const result = await publishDraft(articleId)
            if (result.ok) router.push("/admin/seo/agent")
            return result
          }, t("publishedToast"))
        }
      >
        {busy === "publish" ? t("publishing") : t("publish")}
      </Button>
      <Button
        size="sm"
        variant={armed ? "destructive" : "ghost"}
        disabled={pending}
        onClick={() => {
          if (!armed) return setArmed(true)
          run("discard", async () => {
            const result = await discardDraft(articleId)
            if (result.ok) router.push("/admin/seo/agent")
            return result
          }, t("discardedToast"))
        }}
      >
        {armed ? t("confirmDiscard") : t("discard")}
      </Button>
    </div>
  )
}

export function OrphanList({ rows }: { rows: OrphanRow[] }) {
  const t = useTranslations("admin.seoAgent")
  const reduceMotion = useReducedMotion()
  const { run, pending, busy } = useAction()
  return (
    <ul className="divide-y divide-border">
      <AnimatePresence initial={false}>
        {rows.map((row) => (
          <motion.li key={row.path} layout={!reduceMotion} initial={reduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:px-5">
            {/* Its own line on a phone, so a long path is not squeezed into a sliver beside the buttons. */}
            <a href={row.path} target="_blank" rel="noopener noreferrer" className="min-w-0 basis-full break-all font-mono text-xs text-foreground underline-offset-4 hover:underline sm:basis-0 sm:flex-1">
              {row.path}
            </a>
            <Chip tone={row.status === "OPEN" ? "warn" : "default"}>{t(`orphanStatus.${row.status}`)}</Chip>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              loading={busy === row.path}
              onClick={() => run(row.path, () => setOrphanReview(row.path, row.status === "OPEN" ? "REVIEWED" : "OPEN"), row.status === "OPEN" ? t("markedReviewed") : t("reopened"))}
            >
              {row.status === "OPEN" ? t("markReviewed") : t("reopen")}
            </Button>
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  )
}
