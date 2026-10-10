import { ClientMessagesProvider } from "@/i18n/client-provider"
import { SigningDiagnostics } from "@/components/esign/signing-telemetry"

/**
 * The public signing page's only layout job: hand its client components the
 * three namespaces they read (the wizard, the signature pad, the PDF viewer)
 * instead of the root layout's set. Signers open this page on phones from a
 * link, often on slow connections, so it carries the smallest message
 * payload of any area (src/i18n/client-messages.ts).
 *
 * It also mounts SigningDiagnostics, which tags every Sentry event from the
 * page with the browser it runs in and the steps the signer took
 * (src/components/esign/signing-telemetry.tsx).
 */
export default function SignLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClientMessagesProvider area="sign">
      <SigningDiagnostics />
      {children}
    </ClientMessagesProvider>
  )
}
