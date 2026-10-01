"use client"

/**
 * The warning on a document's page when this deployment has no email
 * provider, so no invitation was sent to anyone.
 *
 * Without it the page used to say "Sent! Each recipient got an email" and
 * mark everyone "Sent", because a missing provider was counted as delivered.
 * The document is live and every link works; the sender just has to share
 * them by hand, with the Share link button beside each recipient marked
 * "Share link manually". It is a warning, not an error: nothing failed, and
 * there is nothing to retry until a provider is configured.
 *
 * Shaped like UndeliveredNotice (square corners, a single phone-first column)
 * in amber instead of red. The entrance is a short framer-motion fade that
 * drops the slide when the visitor prefers reduced motion. `role="status"`
 * rather than "alert": it explains the state of things, it does not report a
 * failure.
 */
import { motion, useReducedMotion } from "framer-motion"
import { MailWarning } from "lucide-react"

export function EmailNotConfiguredNotice({ title, body }: { title: string; body: string }) {
  const reduceMotion = useReducedMotion()

  return (
    <motion.div
      role="status"
      initial={{ opacity: 0, y: reduceMotion ? 0 : -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="flex gap-3 border border-l-4 border-amber-500/40 border-l-amber-500 bg-amber-500/10 p-4"
    >
      <MailWarning className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{body}</p>
      </div>
    </motion.div>
  )
}
