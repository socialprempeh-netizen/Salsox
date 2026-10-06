"use client"

/**
 * The 404 view, loaded only when a 404 is actually shown.
 *
 * The root `not-found.tsx` is part of the root layout's module graph, so
 * whatever it imports statically ships to every page. NotFoundView animates
 * with framer-motion, and before this file that put framer-motion (about
 * 145 KB of JavaScript) on the landing page, which never uses it, for the
 * phone to download and parse before the page became interactive.
 *
 * `next/dynamic` from a client component is what splits the code: from a
 * server component Next does not split client imports (see
 * node_modules/next/dist/docs/01-app/02-guides/lazy-loading.md). Still
 * server-rendered, so a 404 paints at once and only its animation waits for
 * the chunk.
 */
import dynamic from "next/dynamic"

const NotFoundView = dynamic(() => import("./not-found-view").then((m) => m.NotFoundView))

export function LazyNotFoundView({ showBlog }: { showBlog: boolean }) {
  return <NotFoundView showBlog={showBlog} />
}
