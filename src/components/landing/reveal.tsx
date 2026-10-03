"use client"

import { useEffect, useRef } from "react"
// `useState` and `cn` were used only by the replaced version below.
// import { useState } from "react"
// import { cn } from "@/lib/utils"

interface RevealProps {
  children: React.ReactNode
  className?: string
  /** Delay in ms before the animation starts once in view */
  delay?: number
  as?: "div" | "section" | "li"
}

// Replaced by the version below. This one server-rendered every wrapped
// section at `opacity-0` and showed it only once React had hydrated and the
// observer fired, so on a slow phone the landing page painted as an empty
// shell (Lighthouse: slow first contentful paint).
// /**
//  * Fades + slides its children in when they scroll into view.
//  * Uses IntersectionObserver (no animation library). Honors
//  * prefers-reduced-motion via the global CSS reset in globals.css.
//  */
// export function Reveal({ children, className, delay = 0, as = "div" }: RevealProps) {
//   const ref = useRef<HTMLElement | null>(null)
//   const [visible, setVisible] = useState(false)
//
//   useEffect(() => {
//     const el = ref.current
//     if (!el) return
//
//     const observer = new IntersectionObserver(
//       ([entry]) => {
//         if (entry.isIntersecting) {
//           setVisible(true)
//           observer.disconnect()
//         }
//       },
//       { threshold: 0.15, rootMargin: "0px 0px -10% 0px" }
//     )
//
//     observer.observe(el)
//     return () => observer.disconnect()
//   }, [])
//
//   const Comp = as
//
//   return (
//     <Comp
//       ref={ref as React.Ref<never>}
//       style={visible ? { animationDelay: `${delay}ms` } : undefined}
//       className={cn(
//         "transition-none",
//         visible ? "animate-fade-in-up" : "opacity-0",
//         className
//       )}
//     >
//       {children}
//     </Comp>
//   )
// }

/**
 * Fades + slides its children in when they scroll into view, without ever
 * hiding them from the first paint.
 *
 * The server renders the content plainly visible. Only after hydration, and
 * only for an element that is still entirely below the fold, does it get
 * hidden and armed to animate in when scrolled to. Anything already on screen
 * (or scrolled past, on a reload) is left alone, so nothing the visitor can
 * see ever blinks out. With prefers-reduced-motion it never animates at all.
 *
 * The classes are toggled on the DOM node directly rather than through state:
 * the animation is presentation only, and a re-render per section would buy
 * nothing.
 */
export function Reveal({ children, className, delay = 0, as = "div" }: RevealProps) {
  const ref = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    if (el.getBoundingClientRect().top < window.innerHeight) return

    el.classList.add("opacity-0")
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.style.animationDelay = `${delay}ms`
          el.classList.replace("opacity-0", "animate-fade-in-up")
          observer.disconnect()
        }
      },
      // Was `threshold: 0.15`: a section taller than the screen could never
      // reach 15% visible and stayed hidden. Any part in view is enough.
      { threshold: 0, rootMargin: "0px 0px -10% 0px" }
    )

    observer.observe(el)
    return () => {
      observer.disconnect()
      // Never leave content hidden behind an observer that is gone.
      el.classList.remove("opacity-0")
    }
  }, [delay])

  const Comp = as

  return (
    <Comp ref={ref as React.Ref<never>} className={className}>
      {children}
    </Comp>
  )
}
