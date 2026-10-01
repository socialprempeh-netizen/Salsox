"use client"

/**
 * Entrance animation for the sections of the admin views (customers,
 * moderation): each block fades up in a short stagger set by `index`, so a
 * page of tables arrives in reading order instead of all at once. Drops the
 * movement, keeping only the fade, when the viewer prefers reduced motion.
 *
 * A wrapper rather than motion inside each section, because the sections are
 * server components that load data; only this shell runs in the browser.
 */
import { motion, useReducedMotion } from "framer-motion"

export function AdminReveal({
  children,
  index = 0,
  className,
}: {
  children: React.ReactNode
  index?: number
  className?: string
}) {
  const reduceMotion = useReducedMotion()
  return (
    <motion.div
      initial={{ opacity: 0, y: reduceMotion ? 0 : 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut", delay: reduceMotion ? 0 : index * 0.06 }}
      className={className}
    >
      {children}
    </motion.div>
  )
}
