"use client"

/**
 * The action row on a free template page: download the PDF, copy the text,
 * or go straight to getting it signed.
 *
 * Copy writes the plain text (no Markdown) to the clipboard and answers with a
 * short label swap, animated with framer-motion: the icon and word change in
 * place so the button keeps its size. Under prefers-reduced-motion the swap is
 * instant. Both actions send a `template_used` event with the slug and the
 * action only, never the text.
 *
 * Strings arrive translated from the server page, so this component needs no
 * client messages on the public pages.
 */
import { useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { ArrowRight, Check, Copy, Download } from "lucide-react"
import { TrackedLink } from "@/components/analytics/tracked-link"
import { track } from "@/lib/analytics"

export function TemplateActions({
  slug,
  text,
  pdfHref,
  signHref,
  labels,
}: {
  slug: string
  text: string
  pdfHref: string
  signHref: string
  labels: { download: string; copy: string; copied: string; copyFailed: string; sign: string }
}) {
  const reduceMotion = useReducedMotion()
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle")

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setState("copied")
      track("template_used", { template: slug, action: "copy" })
    } catch {
      setState("failed")
    }
    window.setTimeout(() => setState("idle"), 2000)
  }

  const swap = {
    initial: reduceMotion ? false : { opacity: 0, y: 6 },
    animate: { opacity: 1, y: 0 },
    exit: reduceMotion ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, y: -6 },
    transition: { duration: 0.16 },
  } as const

  const secondary =
    "inline-flex h-12 items-center justify-center gap-2 whitespace-nowrap border border-border bg-background px-3 text-sm sm:px-5 font-semibold transition-colors hover:border-foreground/40 hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
      <TrackedLink
        href={signHref}
        location={`template:${slug}`}
        className="inline-flex h-12 items-center justify-center gap-2 bg-primary px-6 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        {labels.sign} <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </TrackedLink>
      <div className="grid grid-cols-2 gap-3 sm:flex">
        <a href={pdfHref} download onClick={() => track("template_used", { template: slug, action: "download" })} className={secondary}>
          <Download className="h-4 w-4" aria-hidden="true" /> {labels.download}
        </a>
        <button type="button" onClick={copy} className={secondary} aria-live="polite">
          <AnimatePresence mode="wait" initial={false}>
            <motion.span key={state} {...swap} className="inline-flex items-center gap-2">
              {state === "copied" ? <Check className="h-4 w-4 text-primary" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
              {state === "copied" ? labels.copied : state === "failed" ? labels.copyFailed : labels.copy}
            </motion.span>
          </AnimatePresence>
        </button>
      </div>
    </div>
  )
}
