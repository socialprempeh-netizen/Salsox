"use client"

/**
 * "Publish all pending drafts" in the social studio (/admin/outreach/social).
 *
 * Two steps, so nothing is posted by surprise: the button first asks the
 * server what it would do (previewPublishAll: every X, LinkedIn and Facebook
 * draft, each to publish or to skip, with the reason, such as a platform
 * known to be failing for an account problem), and shows that plan. Only
 * the confirm button publishes (publishAllDraftsNow), one draft at a time
 * with a short pause on the server, and the dialog then lists what happened
 * to each draft. The logic is in src/lib/outreach-agent/agent.ts
 * (planPublishAll, publishAllDrafts).
 *
 * Square corners; rows enter with framer-motion, snapping under
 * prefers-reduced-motion.
 */
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { CheckCircle2, CircleSlash, Send, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { previewPublishAll, publishAllDraftsNow } from "@/app/actions/outreach-agent"
import { PlatformMark, type Platform } from "@/components/admin/social-studio"
import { PLATFORM_LABEL } from "@/lib/outreach-agent/social"
import { cn } from "@/lib/utils"

type Row = { id: string; platform: Platform; excerpt: string; action: "publish" | "skip"; reason?: string; ok?: boolean; message?: string }

export function PublishAllDrafts() {
  const t = useTranslations("admin.socialStudio.publishAll")
  const router = useRouter()
  const reduce = useReducedMotion()
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<Row[]>([])
  const [done, setDone] = useState<string | null>(null)
  const [step, setStep] = useState<"plan" | "publish" | null>(null)
  const [, startTransition] = useTransition()
  const toPublish = rows.filter((r) => r.action === "publish").length

  const preview = () => {
    setStep("plan")
    startTransition(async () => {
      const result = await previewPublishAll()
      setStep(null)
      if (!result.ok) return void toast.error(t("planFailed"))
      setRows(result.items as Row[])
      setDone(null)
      setOpen(true)
    })
  }

  const publishAll = () => {
    setStep("publish")
    startTransition(async () => {
      const result = await publishAllDraftsNow()
      setStep(null)
      if (!result.ok) return void toast.error(t("runFailed"))
      setRows(result.results as Row[])
      setDone(result.message)
      router.refresh()
    })
  }

  return (
    <>
      <Button variant="outline" onClick={preview} loading={step === "plan"} disabled={step !== null}>
        <Send aria-hidden className="h-4 w-4" />
        {t("button")}
      </Button>
      <Dialog open={open} onOpenChange={(o) => step !== "publish" && setOpen(o)}>
        {/* The dialog is a grid: its children may shrink, so a long draft truncates instead of pushing the dialog sideways. */}
        <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto [&>*]:min-w-0">
          <DialogHeader>
            <DialogTitle>{t("title")}</DialogTitle>
            <DialogDescription>{done ?? (rows.length ? t("plan", { publish: toPublish, skip: rows.length - toPublish }) : t("empty"))}</DialogDescription>
          </DialogHeader>
          <ul className="divide-y divide-border border border-border">
            <AnimatePresence initial={false}>
              {rows.map((r, i) => {
                const state = done ? (r.action === "skip" ? "skipped" : r.ok ? "published" : "failed") : r.action === "skip" ? "skipped" : "ready"
                return (
                  <motion.li
                    key={r.id}
                    layout={!reduce}
                    initial={reduce ? false : { opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: reduce ? 0 : 0.2, delay: reduce ? 0 : Math.min(i, 8) * 0.03 }}
                    className="flex gap-3 p-3"
                  >
                    <PlatformMark platform={r.platform} size={24} />
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-x-2 text-sm font-medium">
                        {PLATFORM_LABEL[r.platform]}
                        <span className={cn("inline-flex items-center gap-1 text-xs", state === "published" || state === "ready" ? "text-emerald-700 dark:text-emerald-400" : state === "failed" ? "text-destructive" : "text-muted-foreground")}>
                          {state === "published" || state === "ready" ? <CheckCircle2 aria-hidden className="h-3.5 w-3.5" /> : state === "failed" ? <XCircle aria-hidden className="h-3.5 w-3.5" /> : <CircleSlash aria-hidden className="h-3.5 w-3.5" />}
                          {t(`state.${state}`)}
                        </span>
                      </p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">{r.excerpt}</p>
                      {(r.message ?? r.reason) && state !== "ready" && state !== "published" && <p className="mt-1 break-words text-xs text-foreground/80">{r.message ?? r.reason}</p>}
                    </div>
                  </motion.li>
                )
              })}
            </AnimatePresence>
          </ul>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={step === "publish"}>
              {done ? t("close") : t("cancel")}
            </Button>
            {!done && (
              <Button onClick={publishAll} loading={step === "publish"} disabled={toPublish === 0 || step !== null}>
                {t("confirm", { count: toPublish })}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
