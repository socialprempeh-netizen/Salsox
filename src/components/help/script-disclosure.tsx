"use client"

/**
 * The expandable "Recording script" under each video card on
 * /resources/help/videos.
 *
 * The script itself is rendered on the server (help-markdown.tsx) and passed
 * in as children. It stays in the page while closed, collapsed to no height
 * and inert (out of the tab order and the accessibility tree), so the full
 * text is in the HTML for anyone who needs it. Opening and closing animate
 * the height with framer-motion, instantly under prefers-reduced-motion.
 */
import { useId, useState, type ReactNode } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { ChevronDown, FileText } from "lucide-react"
import { cn } from "@/lib/utils"

export function ScriptDisclosure({ label, hint, children }: { label: string; hint: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const reduceMotion = useReducedMotion()
  const id = useId()

  return (
    <div className="border-t border-border">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-12 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-primary/5"
      >
        <FileText className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{label}</span>
          <span className="block text-xs text-muted-foreground">{hint}</span>
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200", open && "rotate-180")} aria-hidden="true" />
      </button>
      <motion.div
        id={id}
        initial={false}
        animate={open ? { height: "auto", opacity: 1 } : { height: 0, opacity: 0 }}
        transition={reduceMotion ? { duration: 0 } : { duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        inert={!open}
        className="overflow-hidden"
      >
        <div className="border-t border-border bg-muted/30 px-4 py-5">{children}</div>
      </motion.div>
    </div>
  )
}
