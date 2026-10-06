"use client"

/**
 * Defers a piece of interactive UI until somebody reaches for it.
 *
 * The landing page's menus and dialogs (theme switch, mobile menu, contact
 * dialog) are built on Radix, and each pulled its primitives into the first
 * load of every public page: JavaScript the phone downloaded and parsed before
 * hydrating, for menus nobody had opened yet. With this, the page renders a
 * plain trigger button. The first hover, focus or touch starts loading the
 * real component, and the first click swaps it in, mounted already open.
 *
 * The placeholder stays on screen until the module has arrived, so a slow
 * connection sees a button that takes a moment, never one that blinks out
 * (which is what `next/dynamic`'s empty loading state would do). A plain
 * `import()` in a client component is its own chunk, so no wrapper is needed.
 */
import { useCallback, useState, type ComponentType } from "react"

export function useDeferred<P>(load: () => Promise<{ default: ComponentType<P> }>) {
  const [Component, setComponent] = useState<ComponentType<P> | null>(null)
  const prefetch = useCallback(() => {
    load().catch(() => {})
  }, [load])
  const arm = useCallback(() => {
    load()
      .then((mod) => setComponent(() => mod.default))
      // Offline: the button stays a button, and the next click tries again.
      .catch(() => {})
  }, [load])
  // Spread onto (or cloned into) the placeholder trigger.
  const triggerProps = { onPointerEnter: prefetch, onFocus: prefetch, onTouchStart: prefetch, onClick: arm }
  return { Component, triggerProps }
}
