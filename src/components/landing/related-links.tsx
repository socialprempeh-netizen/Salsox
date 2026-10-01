"use client"

/**
 * "Keep exploring": a short row of links to the pages related to this one,
 * at the end of a public page and on the 404.
 *
 * It exists for internal linking. The nav and footer link every page equally;
 * this block says which neighbours are actually related, which is a signal to
 * crawlers and a next step for a reader who reached the bottom. Which pages
 * appear is decided by `relatedPagesFor` in src/lib/related-pages.ts; this
 * component only renders them.
 *
 * Square corners and a single column on phones, widening to three. Cards fade
 * up in a short stagger when they scroll into view (framer-motion), and drop
 * the movement when the visitor prefers reduced motion.
 */
import Link from "next/link"
import { motion, useReducedMotion } from "framer-motion"
import { ArrowRight } from "lucide-react"
import { useTranslations } from "next-intl"
import { relatedPagesFor } from "@/lib/related-pages"
import { cn } from "@/lib/utils"

export function RelatedLinks({
  path,
  limit = 3,
  heading = "h2",
  className,
}: {
  /** The current page, so it is never suggested to itself. */
  path: string
  limit?: number
  heading?: "h2" | "h3"
  className?: string
}) {
  const t = useTranslations("related")
  const reduceMotion = useReducedMotion()
  const Heading = heading
  const pages = relatedPagesFor(path, limit)

  return (
    <nav aria-label={t("title")} className={cn("mt-16 border-t border-border pt-10", className)}>
      <Heading className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        {t("title")}
      </Heading>
      <ul className="mt-5 grid gap-3 sm:grid-cols-3">
        {pages.map(({ key, href }, i) => (
          <motion.li
            key={key}
            initial={{ opacity: 0, y: reduceMotion ? 0 : 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "0px 0px -10% 0px" }}
            transition={{ duration: 0.35, ease: "easeOut", delay: reduceMotion ? 0 : i * 0.07 }}
          >
            <Link
              href={href}
              className="group flex h-full flex-col border border-border bg-card p-4 transition-colors hover:border-primary/50 hover:bg-accent/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <span className="flex items-center justify-between gap-2 font-semibold text-foreground">
                {t(`${key}.title`)}
                <ArrowRight
                  aria-hidden="true"
                  className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
                />
              </span>
              <span className="mt-1 text-sm text-muted-foreground">{t(`${key}.body`)}</span>
            </Link>
          </motion.li>
        ))}
      </ul>
    </nav>
  )
}
