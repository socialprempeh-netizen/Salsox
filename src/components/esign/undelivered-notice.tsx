"use client"

/**
 * The warning on a document's page when the email provider refused one or
 * more invitations.
 *
 * The document is live at that point and every link works; what did not
 * happen is the email. So this says exactly that, in place of the "Sent!"
 * banner, and points at the way to retry: the Resend button beside each
 * recipient marked "Email not delivered", or sharing their link directly.
 *
 * It takes finished strings from the page (which already holds the
 * translations and the count) and only presents them. Whether to show it is
 * decided on the server from the rows themselves (`undeliveredInvites` in
 * src/lib/esign/rules.ts), so it disappears by itself once a resend succeeds.
 *
 * Square corners and a phone-first single column, per the design rules; the
 * entrance is a short framer-motion fade that drops the slide when the
 * visitor prefers reduced motion. `role="alert"` because this is news the
 * sender has to act on, not decoration.
 */
import { motion, useReducedMotion } from "framer-motion"
import { MailX } from "lucide-react"

export function UndeliveredNotice({ title, body }: { title: string; body: string }) {
  const reduceMotion = useReducedMotion()

  return (
    <motion.div
      role="alert"
      initial={{ opacity: 0, y: reduceMotion ? 0 : -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="flex gap-3 border border-l-4 border-destructive/40 border-l-destructive bg-destructive/5 p-4"
    >
      <MailX className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{body}</p>
      </div>
    </motion.div>
  )
}
