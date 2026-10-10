"use client"

/**
 * The signing page's own error boundary. Same screen as the app's
 * (src/app/error.tsx), but the report is tagged `boundary: sign`, and it
 * arrives carrying what the signing layout recorded before the failure: the
 * browser it ran in, the features it lacked, and the breadcrumb trail of the
 * signer's steps (src/components/esign/signing-telemetry.tsx).
 *
 * It sits below the signing layout, so the "errorBoundary" messages reach it
 * through the sign area's set, which includes the shell's.
 */
import { LazyErrorView } from "@/components/error-view-lazy"

export default function SignError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <LazyErrorView error={error} retry={retry} tags={{ boundary: "sign", area: "sign" }} />
}
