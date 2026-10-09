"use client"

/**
 * The app's error boundary: catches an error thrown while rendering any page
 * or nested layout below the root layout (public pages, dashboard, admin,
 * sign-in, the signing page) and shows ErrorView in its place, with the
 * error reported to Sentry (error-view-lazy.tsx). The root layout itself is
 * covered by global-error.tsx.
 *
 * It renders inside the root layout, so the "errorBoundary" messages reach it
 * through the root's shell set (src/i18n/client-messages.ts).
 *
 * `retry` (Next 16) re-fetches and re-renders the failed segment, which is
 * what a temporary failure needs; `reset` only re-renders.
 */
import { LazyErrorView } from "@/components/error-view-lazy"

export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <LazyErrorView error={error} retry={retry} />
}
