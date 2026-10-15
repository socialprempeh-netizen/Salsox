"use client"

/**
 * The legal-standing strip under the landing hero: the laws Salsox signatures
 * are valid under, and the audit trail that backs each one. Whether an
 * e-signature holds up is the first thing people switching from another tool
 * ask, so it is answered before the features.
 *
 * Worded to what the product is: simple electronic signatures (eIDAS's
 * baseline level), with signer consent and a logged audit trail on every
 * document, not qualified signatures. The sealed audit certificate is a
 * Business feature and is not claimed here. The copy is in `complianceBadges`
 * in en.json; the page passes it in, since client components on the public
 * pages do not carry that namespace.
 *
 * Each seal settles in like a stamp as the strip scrolls into view
 * (framer-motion); with reduced motion the strip simply fades in.
 */
import { motion, useReducedMotion } from "framer-motion"
import { FileClock, Globe2, Landmark, type LucideIcon } from "lucide-react"

export type ComplianceBadge = { icon: "esign" | "eidas" | "audit"; title: string; body: string }

const ICONS: Record<ComplianceBadge["icon"], LucideIcon> = { esign: Landmark, eidas: Globe2, audit: FileClock }

export function ComplianceBadges({ label, badges, note }: { label: string; badges: ComplianceBadge[]; note: string }) {
  const reduceMotion = useReducedMotion()
  return (
    <section aria-label={label} className="border-y border-border bg-background">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-12">
        <ul className="grid grid-cols-1 divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {badges.map((badge, i) => {
            const Icon = ICONS[badge.icon]
            return (
              <motion.li
                key={badge.icon}
                className="flex items-start gap-4 py-5 sm:px-6 sm:first:pl-0 sm:last:pr-0"
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: reduceMotion ? 0.2 : 0.4, delay: reduceMotion ? 0 : i * 0.08, ease: "easeOut" }}
              >
                <motion.span
                  aria-hidden
                  className="flex h-10 w-10 shrink-0 items-center justify-center border border-primary/30 bg-primary/10 text-primary"
                  initial={reduceMotion ? false : { scale: 1.35, rotate: -8, opacity: 0 }}
                  whileInView={{ scale: 1, rotate: 0, opacity: 1 }}
                  viewport={{ once: true, margin: "-40px" }}
                  transition={{ type: "spring", stiffness: 420, damping: 22, delay: 0.12 + i * 0.08 }}
                >
                  <Icon className="h-5 w-5" />
                </motion.span>
                <div className="min-w-0">
                  <p className="font-semibold text-foreground">{badge.title}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{badge.body}</p>
                </div>
              </motion.li>
            )
          })}
        </ul>
        <p className="border-t border-border py-3 text-xs text-muted-foreground">{note}</p>
      </div>
    </section>
  )
}
