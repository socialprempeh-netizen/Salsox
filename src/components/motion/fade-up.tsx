"use client"

// Replaced by the version below. This one server-rendered the block at
// opacity 0 (framer-motion writes `initial` into the HTML), so the whole
// legal page stayed blank until JavaScript had loaded and hydrated.
// /**
//  * A short fade-up entrance for a block of server-rendered content (the legal
//  * pages wrap their text in it). The content is rendered on the server and
//  * only this shell runs in the browser; under reduced motion it only fades.
//  */
// import { motion, useReducedMotion } from "framer-motion"
//
// export function FadeUp({ children, className, delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
//   const reduceMotion = useReducedMotion()
//   return (
//     <motion.div
//       initial={{ opacity: 0, y: reduceMotion ? 0 : 12 }}
//       animate={{ opacity: 1, y: 0 }}
//       transition={{ duration: 0.35, ease: "easeOut", delay: reduceMotion ? 0 : delay }}
//       className={className}
//     >
//       {children}
//     </motion.div>
//   )
// }

/**
 * A short fade-up entrance for a block of server-rendered content (the legal
 * pages wrap their text in it), without ever hiding it from the first paint.
 *
 * Same rule as Reveal on the landing page: the server renders the block
 * plainly visible, and only after hydration, and only if the block is still
 * entirely below the fold, is it hidden and animated in when scrolled to. A
 * block already on screen (the legal pages open with theirs) just paints:
 * fading in what the visitor can already read would make it blink out first.
 * Under reduced motion it only fades, without the slide.
 */
import { useEffect } from "react"
import { inView, useAnimate, useReducedMotion } from "framer-motion"

export function FadeUp({ children, className, delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const [scope, animate] = useAnimate<HTMLDivElement>()
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    const el = scope.current
    if (!el || el.getBoundingClientRect().top < window.innerHeight) return

    animate(el, { opacity: 0, y: reduceMotion ? 0 : 12 }, { duration: 0 })
    const stop = inView(
      el,
      () => {
        animate(el, { opacity: 1, y: 0 }, { duration: 0.35, ease: "easeOut", delay: reduceMotion ? 0 : delay })
      },
      // Any part of the block in view, not a share of it: the legal pages wrap
      // a whole document, and with `amount: 0.15` one taller than the screen
      // could never reach 15% visible and stayed hidden for good.
      { amount: "some", margin: "0px 0px -10% 0px" }
    )
    return () => {
      stop()
      // Never leave content hidden behind an observer that is gone.
      el.style.opacity = ""
      el.style.transform = ""
    }
  }, [scope, animate, reduceMotion, delay])

  return (
    <div ref={scope} className={className}>
      {children}
    </div>
  )
}
