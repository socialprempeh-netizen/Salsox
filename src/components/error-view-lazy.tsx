"use client"

/**
 * The error boundaries' entry point: reports the error to Sentry, then shows
 * ErrorView, loaded only when an error is actually shown.
 *
 * Why lazy: the root error boundary (src/app/error.tsx) is part of the root
 * layout's module graph, so whatever it imports statically ships to every
 * page, and ErrorView animates with framer-motion. Same split, for the same
 * reason, as the 404 page (not-found-lazy.tsx).
 *
 * Why the report is made here and not in ErrorView: a common reason for an
 * error screen is a chunk that failed to download after a deploy. If the
 * report lived in the lazy chunk, that error would go unreported exactly when
 * the chunk cannot load. Sentry itself is already in the page's bundle
 * (src/instrumentation-client.ts), so importing it here costs nothing.
 *
 * Errors React catches in a boundary are not rethrown, so the SDK's global
 * handlers never see them: this report is the only one they get. Without a
 * DSN, `captureException` does nothing.
 */
import { useEffect } from "react"
import dynamic from "next/dynamic"
import * as Sentry from "@sentry/nextjs"

const ErrorView = dynamic(() => import("./error-view").then((m) => m.ErrorView))

export function LazyErrorView({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])
  return <ErrorView digest={error.digest} retry={retry} />
}
