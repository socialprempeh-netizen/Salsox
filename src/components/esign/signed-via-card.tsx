"use client"

/**
 * "Signed via {site}": the card a signer sees under the confirmation once
 * they have signed, or once the whole document is complete.
 *
 * It replaces the small "Secured by" line on those two screens. The signer
 * has just used the product end to end without an account, which makes them
 * the warmest prospect it will ever have; the card says what they just used
 * and offers the same thing for their own documents, with a tagged signup
 * link (src/lib/esign/viral.ts) recorded as a `cta_clicked` event.
 *
 * Motion is one beat, after the confirmation: the card rises in 0.45s after
 * the screen renders, so "You've signed" lands first and the offer second.
 * With prefers-reduced-motion it is simply there.
 *
 * Strings arrive translated: the signing page sends its client components as
 * few messages as possible, since it is opened on phones from a link.
 */
import { motion, useReducedMotion } from "framer-motion"
import { ArrowRight } from "lucide-react"
import { TrackedLink } from "@/components/analytics/tracked-link"

export function SignedViaCard({ href, title, body, cta }: { href: string; title: string; body: string; cta: string }) {
  const reduceMotion = useReducedMotion()
  return (
    <motion.aside
      aria-label={title}
      initial={reduceMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut", delay: 0.45 }}
      className="mt-6 w-full border border-border bg-card p-5 text-left"
    >
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="mt-1.5 text-sm text-muted-foreground">{body}</p>
      <TrackedLink
        href={href}
        location="signed-via:signing-page"
        className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 border border-primary px-4 text-sm font-semibold text-primary transition-colors hover:bg-primary hover:text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        {cta} <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </TrackedLink>
    </motion.aside>
  )
}
