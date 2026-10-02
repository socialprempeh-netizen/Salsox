"use client"

/**
 * A short fade-up entrance for a block of server-rendered content (the legal
 * pages wrap their text in it). The content is rendered on the server and
 * only this shell runs in the browser; under reduced motion it only fades.
 */
import { motion, useReducedMotion } from "framer-motion"

export function FadeUp({ children, className, delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const reduceMotion = useReducedMotion()
  return (
    <motion.div
      initial={{ opacity: 0, y: reduceMotion ? 0 : 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut", delay: reduceMotion ? 0 : delay }}
      className={className}
    >
      {children}
    </motion.div>
  )
}
