/**
 * Calls back once an element has been reached by scrolling: in view, or
 * already scrolled past. Used by the scroll-in animations (Reveal on the
 * landing and SEO pages, FadeUp on the legal pages), which hide a block that
 * starts below the fold and show it when the visitor gets there.
 *
 * Why not an IntersectionObserver alone, as they used before: an observer
 * reports changes in intersection, and a page that jumps from above a block
 * to below it (the End key, an anchor link, scroll restoration on Back, a
 * full-page screenshot) never intersects it. The block stayed at opacity 0
 * for good, which read as large blank gaps in the page. "Reached" is the
 * question that matters, so a passive scroll check answers it too.
 */

/** Reached: its top is above the bottom edge of the view, less a margin (in view or passed). */
export function hasReached(top: number, viewportHeight: number, bottomMargin = 0.1): boolean {
  return top < viewportHeight * (1 - bottomMargin)
}

export function whenReached(el: Element, onReached: () => void, bottomMargin = 0.1): () => void {
  let done = false
  let frame = 0
  const finish = () => {
    if (done) return
    done = true
    stop()
    onReached()
  }
  const check = () => {
    frame = 0
    if (hasReached(el.getBoundingClientRect().top, window.innerHeight, bottomMargin)) finish()
  }
  const onScroll = () => {
    if (!frame) frame = requestAnimationFrame(check)
  }
  const observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) finish()
    },
    { threshold: 0, rootMargin: `0px 0px -${Math.round(bottomMargin * 100)}% 0px` }
  )
  function stop() {
    observer.disconnect()
    window.removeEventListener("scroll", onScroll)
    window.removeEventListener("resize", onScroll)
    if (frame) cancelAnimationFrame(frame)
  }
  observer.observe(el)
  window.addEventListener("scroll", onScroll, { passive: true })
  window.addEventListener("resize", onScroll, { passive: true })
  return () => {
    done = true
    stop()
  }
}
