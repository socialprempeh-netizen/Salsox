"use client"

/**
 * The hover for the homepage's feature cards (features.tsx), on the purple
 * band: the card lifts a few pixels and its shadow deepens, with a pointer
 * cursor, like the site's other interactive cards. Its own client component
 * because the grid around it renders on the server, and framer-motion runs
 * only in the browser.
 *
 * It replaces a CSS lift (hover:-translate-y-1 on the card) that moved the
 * card but left its shadow flat. Under prefers-reduced-motion the card does
 * not move; the shadow still deepens, which is a change of colour, not of
 * position.
 */
import { motion, useReducedMotion } from "framer-motion"
import { cn } from "@/lib/utils"

// Shadows tinted with the band's own purple, not a grey one, so the lift
// reads on the violet behind the cards.
const REST = "0 1px 2px rgb(15 15 25 / 0.06), 0 4px 12px rgb(76 29 149 / 0.10)"
const LIFTED = "0 4px 8px rgb(15 15 25 / 0.08), 0 18px 36px -6px rgb(15 15 25 / 0.35)"

export function FeatureCardHover({ children, className }: { children: React.ReactNode; className?: string }) {
  const reduceMotion = useReducedMotion()
  return (
    <motion.div
      className={cn("h-full cursor-pointer", className)}
      initial={{ y: 0, boxShadow: REST }}
      whileHover={{ y: reduceMotion ? 0 : -6, boxShadow: LIFTED }}
      transition={{ type: "spring", stiffness: 380, damping: 28 }}
    >
      {children}
    </motion.div>
  )
}
