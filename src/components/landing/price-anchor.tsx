"use client"

/**
 * The price anchor at the top of the pricing section: Salsox's plans beside
 * the DocuSign plans they compare to, like for like (entry plan against entry
 * plan, payment collection against payment collection), with each side's
 * sending limit. The point it makes is the envelope cap, so that is what moves:
 * as it scrolls into view each Salsox bar runs off the edge, uncapped, and
 * each DocuSign bar stops short at a marked cap (framer-motion). The bars are
 * a picture of capped against uncapped, not a scale, so they are hidden from
 * assistive technology; the figures beside them carry the facts.
 *
 * Everything shown arrives as props, worded and priced by PlanPricing from
 * the Plan rows and src/lib/competitor-pricing.ts, so a price here is never a
 * second copy of the one on the cards.
 */
import Link from "next/link"
import { motion, useReducedMotion } from "framer-motion"

export type AnchorSide = { name: string; price: string; unit: string; limit: string }
export type AnchorGroup = { label: string; own: AnchorSide; competitor: AnchorSide }

export function PriceAnchor({
  title,
  subtitle,
  groups,
  note,
  compare,
}: {
  title: string
  subtitle: string
  groups: AnchorGroup[]
  note: React.ReactNode
  compare: { href: string; label: string }
}) {
  const reduceMotion = useReducedMotion()
  if (groups.length === 0) return null
  const grow = (delay: number, duration: number) =>
    reduceMotion
      ? { initial: false as const }
      : {
          initial: { scaleX: 0 },
          whileInView: { scaleX: 1 },
          viewport: { once: true, margin: "-60px" },
          transition: { duration, delay, ease: [0.22, 1, 0.36, 1] as const },
        }

  return (
    <motion.div
      className="mx-auto mb-12 max-w-5xl border border-border bg-background"
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.45, ease: "easeOut" }}
    >
      <div className="border-b border-border p-5 sm:p-8">
        <h3 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{title}</h3>
        <p className="mt-2 max-w-2xl text-muted-foreground">{subtitle}</p>
      </div>

      <div className="grid grid-cols-1 divide-y divide-border md:grid-cols-2 md:divide-x md:divide-y-0">
        {groups.map((group, g) => (
          <div key={group.label} className="p-5 sm:p-8">
            <p className="text-sm font-medium text-muted-foreground">{group.label}</p>
            {/* Was a <dl> with each name/price pair wrapped in a <div> beside the
                bar and the limit: a definition list may hold only name/value
                groups, so axe flagged it (definition-list, dlitem). Plain
                blocks now; each row reads in order as name, price, limit. */}
            <div className="mt-4 space-y-6">
              {[group.own, group.competitor].map((side, s) => {
                const own = s === 0
                return (
                  <div key={side.name}>
                    <div className="flex items-baseline justify-between gap-3">
                      <p className={own ? "font-semibold text-foreground" : "font-medium text-muted-foreground"}>{side.name}</p>
                      <p className="shrink-0 tabular-nums">
                        <span className={own ? "text-3xl font-extrabold text-foreground" : "text-2xl font-bold text-muted-foreground"}>{side.price}</span>
                        <span className="text-sm text-muted-foreground">{side.unit}</span>
                      </p>
                    </div>
                    {/* The bar: ours fades out past the edge, theirs stops at a cap. */}
                    <div aria-hidden className="relative mt-2 h-2 overflow-hidden bg-muted">
                      {own ? (
                        <motion.div
                          className="absolute inset-y-0 left-0 w-full origin-left bg-gradient-to-r from-primary via-primary to-primary/0"
                          {...grow(0.15 + g * 0.15, 1.2)}
                        />
                      ) : (
                        <motion.div
                          className="absolute inset-y-0 left-0 w-[22%] origin-left border-r-2 border-foreground bg-foreground/35"
                          {...grow(0.15 + g * 0.15, 0.45)}
                        />
                      )}
                    </div>
                    <p className={`mt-1.5 text-sm ${own ? "font-medium text-primary" : "text-muted-foreground"}`}>{side.limit}</p>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2 border-t border-border p-5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <p className="max-w-2xl">{note}</p>
        <Link href={compare.href} className="shrink-0 font-medium text-foreground underline underline-offset-4 hover:text-primary">
          {compare.label}
        </Link>
      </div>
    </motion.div>
  )
}
