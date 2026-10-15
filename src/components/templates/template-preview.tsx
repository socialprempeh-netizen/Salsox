"use client"

/**
 * The live preview on a template page: the same document in two views, the
 * sample (every blank filled with a realistic value) and the blank template,
 * switched with two tabs above the sheet.
 *
 * Both views are rendered on the server and passed in as children, so the
 * HTML holds the full text of each and this component only chooses which one
 * shows. The change crossfades with framer-motion; with prefers-reduced-motion
 * it swaps at once. The hidden view stays in the page (hidden attribute),
 * readable without JavaScript as the sample view.
 */
import { useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { cn } from "@/lib/utils"

export function TemplatePreview({ sample, blank, labels }: { sample: React.ReactNode; blank: React.ReactNode; labels: { sample: string; blank: string; group: string } }) {
  const [view, setView] = useState<"sample" | "blank">("sample")
  const reduceMotion = useReducedMotion()
  const tab = (id: "sample" | "blank", label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={view === id}
      onClick={() => setView(id)}
      className={cn(
        "relative h-10 px-4 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary",
        view === id ? "text-foreground" : "text-muted-foreground hover:text-foreground"
      )}
    >
      {label}
      {view === id && (
        <motion.span layoutId="template-preview-tab" aria-hidden className="absolute inset-x-0 -bottom-px h-0.5 bg-primary" transition={reduceMotion ? { duration: 0 } : { type: "spring", bounce: 0.15, duration: 0.35 }} />
      )}
    </button>
  )

  return (
    <div>
      <div role="tablist" aria-label={labels.group} className="flex border-b border-border">
        {tab("sample", labels.sample)}
        {tab("blank", labels.blank)}
      </div>
      <div className="border border-t-0 border-border bg-card p-5 sm:p-10">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={view}
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduceMotion ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            {view === "sample" ? sample : blank}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
