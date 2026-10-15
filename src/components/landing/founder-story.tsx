"use client"

/**
 * The founder's note on the About page: why the product exists, in the
 * founder's own words, signed, with a way to answer it.
 *
 * Set as a letter rather than another titled section: a primary-coloured rule
 * runs down its left edge and draws itself top to bottom on load, then the
 * signature and the reply link settle in under it. That is the only motion,
 * and the paragraphs never move, so the text is readable from the first paint
 * (no hidden-until-hydrated content on a public page). Under
 * prefers-reduced-motion everything renders in its final state.
 *
 * Copy is passed in already translated: the page is a server component and
 * owns the message lookups, this shell only animates.
 */
import Link from "next/link"
import { motion, useReducedMotion } from "framer-motion"

export function FounderStory({
  title,
  paragraphs,
  signature,
  contactLabel,
}: {
  title: string
  paragraphs: string[]
  signature: string
  contactLabel: string
}) {
  const reduceMotion = useReducedMotion()
  const [lead, ...rest] = paragraphs

  return (
    <article aria-labelledby="founder-story-title" className="relative mt-12 pl-5 sm:pl-8">
      <motion.span
        aria-hidden
        className="absolute inset-y-0 left-0 w-0.5 origin-top bg-primary"
        initial={reduceMotion ? false : { scaleY: 0 }}
        animate={{ scaleY: 1 }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
      />

      <h2 id="founder-story-title" className="text-2xl font-semibold tracking-tight text-foreground">
        {title}
      </h2>

      <div className="mt-5 space-y-5 leading-7 text-muted-foreground">
        <p className="text-lg leading-8 text-foreground">{lead}</p>
        {rest.map((p) => (
          <p key={p}>{p}</p>
        ))}
      </div>

      <motion.div
        className="mt-8 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between"
        initial={reduceMotion ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut", delay: 0.7 }}
      >
        <p className="font-medium text-foreground">{signature}</p>
        <Link
          href="/contact"
          className="inline-flex h-10 items-center border border-border px-4 text-sm font-medium text-foreground transition-colors hover:border-primary hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {contactLabel}
        </Link>
      </motion.div>
    </article>
  )
}
