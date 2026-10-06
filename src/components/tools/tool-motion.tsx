"use client"

/**
 * Animation for the free tools, per the design rules (framer-motion), at the
 * smallest cost framer-motion offers: `LazyMotion` with the `m` component,
 * whose features (motion-features.ts) load asynchronously after the tool is
 * interactive. Until they arrive, `m` elements simply render without
 * animating, so nothing is hidden waiting for JavaScript.
 *
 * `Appear` is the one effect the tools use: a short fade and lift when a
 * panel or step appears, without the lift under prefers-reduced-motion.
 */
import { AnimatePresence, LazyMotion, m, useReducedMotion } from "framer-motion"

const loadFeatures = () => import("./motion-features").then((mod) => mod.default)

export function ToolMotion({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={loadFeatures} strict>
      {children}
    </LazyMotion>
  )
}

export function Appear({ children, className, id }: { children: React.ReactNode; className?: string; id?: string }) {
  const reduce = useReducedMotion()
  return (
    <m.div
      key={id}
      initial={{ opacity: 0, y: reduce ? 0 : 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className={className}
    >
      {children}
    </m.div>
  )
}

export { AnimatePresence }
