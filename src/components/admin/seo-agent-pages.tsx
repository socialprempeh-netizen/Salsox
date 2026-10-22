"use client"

/**
 * The page mode's part of the SEO agent tab (/admin/seo/agent): the pages
 * the agent wrote (templates, comparisons, e-signature law pages) with the
 * result of each quality gate, their Publish, Discard and Unpublish actions,
 * and the duplicate report listing pages held back as too close to an
 * existing one. The page around them loads the data on the server; these
 * call the server actions (src/app/actions/seo-agent.ts) and refresh.
 *
 * The one distinctive element is the gate strip: one square per gate, filled
 * when it passed, outlined in red when it stopped the page, amber when it
 * flagged it, filling left to right as a row appears. Everything else is the
 * console's own vocabulary (chips, square buttons, divided rows), single
 * column at every width so a phone never scrolls sideways.
 *
 * Motion (framer-motion): rows rise in, the strip's squares settle in
 * sequence, the similarity bar grows to its value. Under
 * prefers-reduced-motion everything snaps into place.
 */
import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { useFormatter, useTranslations } from "next-intl"
import { Check, ExternalLink, FilePlus2, FileText, ShieldCheck, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { discardPage, publishPage, unpublishPage } from "@/app/actions/seo-agent"
import { Chip, Empty, type Tone } from "@/components/admin/admin-ui"
import { useAction } from "@/components/admin/seo-agent-console"
import { cn } from "@/lib/utils"

export type PageKind = "TEMPLATE" | "COMPARISON" | "ALTERNATIVE" | "COMPLIANCE"
export type PageStatus = "DRAFT" | "FLAGGED" | "PUBLISHED" | "DISCARDED" | "FAILED"
export type GateRow = { id: "required" | "intro" | "duplicate" | "links" | "facts"; ok: boolean; detail: string }

export type PageRow = {
  id: string
  kind: PageKind
  path: string
  status: PageStatus
  title: string
  createdAt: string
  autoPublished: boolean
  noindex: boolean
  similarity: number
  similarTo: string | null
  /** The duplicate limit for this kind of page, 0-1. */
  threshold: number
  error: string | null
  attempts: number
  gates: GateRow[]
}

const STATUS_TONE: Record<PageStatus, Tone> = { DRAFT: "warn", FLAGGED: "bad", PUBLISHED: "good", DISCARDED: "default", FAILED: "bad" }

const pct = (n: number) => `${Math.round(n * 100)}%`

/** One square per gate: solid when it passed, red outline when it stopped the page, amber when it only flagged it. */
export function GateStrip({ gates }: { gates: GateRow[] }) {
  const t = useTranslations("admin.seoAgent")
  const reduce = useReducedMotion()
  if (gates.length === 0) return null
  return (
    <div>
      <p className="sr-only">{t("gatesLabel")}</p>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:flex sm:flex-wrap sm:gap-x-5">
        {gates.map((gate, i) => {
          const flag = !gate.ok && gate.id === "duplicate"
          return (
            <li key={gate.id} className="flex min-w-0 items-center gap-2 text-xs">
              <motion.span
                aria-hidden
                initial={reduce ? false : { scale: 0.4, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: reduce ? 0 : i * 0.07, duration: 0.2, ease: "easeOut" }}
                className={cn(
                  "flex h-4 w-4 shrink-0 items-center justify-center border",
                  gate.ok ? "border-emerald-600 bg-emerald-600 text-white dark:border-emerald-500 dark:bg-emerald-500" : flag ? "border-amber-500 bg-amber-500/15 text-amber-700 dark:text-amber-400" : "border-destructive bg-destructive/10 text-destructive"
                )}
              >
                {gate.ok ? <Check className="h-3 w-3" strokeWidth={3} /> : <X className="h-3 w-3" strokeWidth={3} />}
              </motion.span>
              <span className={cn("truncate", gate.ok ? "text-muted-foreground" : "font-medium text-foreground")}>
                {t(`gates.${gate.id}`)}
                <span className="sr-only">: {gate.ok ? t("gatePassed") : flag ? t("gateFlagged") : t("gateFailed")}</span>
              </span>
            </li>
          )
        })}
      </ul>
      {gates.some((g) => !g.ok) && (
        <ul className="mt-2.5 space-y-1">
          {gates
            .filter((g) => !g.ok)
            .map((g) => (
              <li key={g.id} className={cn("break-words border-l-2 pl-3 text-xs", g.id === "duplicate" ? "border-amber-500 text-amber-800 dark:text-amber-300" : "border-destructive text-destructive")}>
                <span className="font-medium">{t(`gates.${g.id}`)}:</span> {g.detail}
              </li>
            ))}
        </ul>
      )}
    </div>
  )
}

/** How close the page is to its nearest existing page, against the limit for its kind. */
function SimilarityBar({ value, threshold, closest }: { value: number; threshold: number; closest: string | null }) {
  const t = useTranslations("admin.seoAgent")
  const reduce = useReducedMotion()
  // The bar spans twice the limit, so the limit sits in the middle and a near-duplicate visibly crosses it.
  const scale = Math.max(threshold * 2, value, 0.01)
  const over = value > threshold
  return (
    <div className="space-y-1">
      <div className="relative h-1.5 w-full bg-muted" role="img" aria-label={t("similarityAria", { value: pct(value), limit: pct(threshold) })}>
        <motion.span
          className={cn("absolute inset-y-0 left-0", over ? "bg-amber-500" : "bg-primary")}
          initial={reduce ? false : { width: 0 }}
          animate={{ width: `${Math.min(100, (value / scale) * 100)}%` }}
          transition={{ duration: reduce ? 0 : 0.5, ease: "easeOut" }}
        />
        <span aria-hidden className="absolute -top-1 bottom-[-4px] w-px bg-foreground/60" style={{ left: `${(threshold / scale) * 100}%` }} />
      </div>
      <p className="break-words text-xs text-muted-foreground">{closest ? t("similarity", { value: pct(value), path: closest, limit: pct(threshold) }) : t("similarityNone")}</p>
    </div>
  )
}

export function GeneratedPageList({ rows }: { rows: PageRow[] }) {
  const t = useTranslations("admin.seoAgent")
  const format = useFormatter()
  const reduce = useReducedMotion()
  const { run, pending, busy } = useAction()
  const [armed, setArmed] = useState<string | null>(null)

  if (rows.length === 0) return <Empty icon={FilePlus2}>{t("noPages")}</Empty>

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
          const busyHere = pending && busy?.endsWith(row.id)
          return (
            <motion.li
              key={row.id}
              layout={!reduce}
              initial={reduce ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: busyHere ? 0.6 : 1, y: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="min-w-0 space-y-3 p-4 sm:px-5"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Chip tone={STATUS_TONE[row.status]}>{t(`pageStatus.${row.status}`)}</Chip>
                <Chip tone="info">{t(`pageKind.${row.kind}`)}</Chip>
                {row.noindex && row.status !== "FAILED" && <Chip>{t("noindex")}</Chip>}
                {row.autoPublished && row.status === "PUBLISHED" && <span className="text-xs text-muted-foreground">{t("auto")}</span>}
                <span className="ml-auto text-xs text-muted-foreground">{format.dateTime(new Date(row.createdAt), { dateStyle: "medium" })}</span>
              </div>

              <div className="min-w-0">
                <h3 className="break-words font-semibold tracking-tight">{row.title}</h3>
                <p className="mt-0.5 break-all font-mono text-xs text-muted-foreground">{row.path}</p>
              </div>

              <GateStrip gates={row.gates} />
              {row.status !== "FAILED" && <SimilarityBar value={row.similarity} threshold={row.threshold} closest={row.similarTo} />}

              {row.status === "FAILED" && (
                <p className="break-words border-l-2 border-destructive pl-3 text-sm text-destructive">
                  {t("pageFailed", { attempts: row.attempts })} {row.gates.length === 0 && row.error ? row.error : null}
                </p>
              )}
              {row.status === "FLAGGED" && <p className="text-sm text-muted-foreground">{t("flaggedNote")}</p>}

              {(row.status === "DRAFT" || row.status === "FLAGGED" || row.status === "PUBLISHED") && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {row.status === "DRAFT" && (
                    <Button size="sm" disabled={pending} loading={busy === `publish:${row.id}`} onClick={() => run(`publish:${row.id}`, () => publishPage(row.id), t("publishedToast"))}>
                      {busy === `publish:${row.id}` ? t("publishing") : t("publish")}
                    </Button>
                  )}
                  {row.status === "FLAGGED" && (
                    <Button
                      size="sm"
                      variant={armed === `publish:${row.id}` ? "destructive" : "outline"}
                      disabled={pending}
                      loading={busy === `publish:${row.id}`}
                      onClick={() => confirmThen(`publish:${row.id}`, () => run(`publish:${row.id}`, () => publishPage(row.id), t("publishedToast")))}
                    >
                      {armed === `publish:${row.id}` ? t("confirmPublishNoindex") : t("publishNoindex")}
                    </Button>
                  )}
                  {row.status !== "PUBLISHED" && (
                    <Button size="sm" variant="outline" asChild>
                      <Link href={`/admin/seo/agent/${row.id}`}>
                        <FileText aria-hidden className="h-4 w-4" />
                        {t("preview")}
                      </Link>
                    </Button>
                  )}
                  {row.status !== "PUBLISHED" && (
                    <Button
                      size="sm"
                      variant={armed === `discard:${row.id}` ? "destructive" : "ghost"}
                      disabled={pending}
                      onClick={() => confirmThen(`discard:${row.id}`, () => run(`discard:${row.id}`, () => discardPage(row.id), t("discardedToast")))}
                    >
                      {armed === `discard:${row.id}` ? t("confirmDiscard") : t("discard")}
                    </Button>
                  )}
                  {row.status === "PUBLISHED" && (
                    <>
                      <Button size="sm" variant="outline" asChild>
                        <a href={row.path} target="_blank" rel="noopener noreferrer">
                          <ExternalLink aria-hidden className="h-4 w-4" />
                          {t("view")}
                        </a>
                      </Button>
                      <Button
                        size="sm"
                        variant={armed === `unpublish:${row.id}` ? "destructive" : "ghost"}
                        disabled={pending}
                        onClick={() => confirmThen(`unpublish:${row.id}`, () => run(`unpublish:${row.id}`, () => unpublishPage(row.id), t("unpublishedToast")))}
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

/** The near-duplicates the agent held back: which page, what it resembled, how closely. */
export function DuplicateReport({ rows }: { rows: PageRow[] }) {
  const t = useTranslations("admin.seoAgent")
  const reduce = useReducedMotion()
  if (rows.length === 0) return <Empty icon={ShieldCheck}>{t("reportEmpty")}</Empty>
  return (
    <ul className="divide-y divide-border">
      {rows.map((row, i) => (
        <motion.li
          key={row.id}
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: reduce ? 0 : i * 0.04 }}
          className="grid gap-1 px-4 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-center sm:gap-4 sm:px-5"
        >
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground sm:sr-only">{t("reportPage")}</p>
            <Link href={`/admin/seo/agent/${row.id}`} className="break-all font-mono text-xs text-foreground underline-offset-4 hover:underline">
              {row.path}
            </Link>
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground sm:sr-only">{t("reportClosest")}</p>
            <span className="break-all font-mono text-xs text-muted-foreground">{row.similarTo ?? "–"}</span>
          </div>
          <p className="font-semibold tabular-nums text-amber-700 dark:text-amber-400">
            <span className="text-xs font-normal text-muted-foreground sm:sr-only">{t("reportScore")} </span>
            {pct(row.similarity)}
          </p>
        </motion.li>
      ))}
    </ul>
  )
}

/** Publish and Discard on a page's preview. */
export function PageDraftActions({ pageId, flagged }: { pageId: string; flagged: boolean }) {
  const t = useTranslations("admin.seoAgent")
  const { run, pending, busy } = useAction()
  const router = useRouter()
  const [armed, setArmed] = useState<"publish" | "discard" | null>(null)
  const go = (key: "publish" | "discard", action: () => void) => {
    if (key === "discard" || flagged) {
      if (armed !== key) return setArmed(key)
      setArmed(null)
    }
    action()
  }
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        size="sm"
        variant={flagged ? (armed === "publish" ? "destructive" : "outline") : "primary"}
        disabled={pending}
        loading={busy === "publish"}
        onClick={() =>
          go("publish", () =>
            run("publish", async () => {
              const result = await publishPage(pageId)
              if (result.ok) router.push("/admin/seo/agent")
              return result
            }, t("publishedToast"))
          )
        }
      >
        {flagged ? (armed === "publish" ? t("confirmPublishNoindex") : t("publishNoindex")) : busy === "publish" ? t("publishing") : t("publish")}
      </Button>
      <Button
        size="sm"
        variant={armed === "discard" ? "destructive" : "ghost"}
        disabled={pending}
        onClick={() =>
          go("discard", () =>
            run("discard", async () => {
              const result = await discardPage(pageId)
              if (result.ok) router.push("/admin/seo/agent")
              return result
            }, t("discardedToast"))
          )
        }
      >
        {armed === "discard" ? t("confirmDiscard") : t("discard")}
      </Button>
    </div>
  )
}
