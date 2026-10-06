import { ClientMessagesProvider } from "@/i18n/client-provider"

/**
 * The public signing page's only layout job: hand its client components the
 * three namespaces they read (the wizard, the signature pad, the PDF viewer)
 * instead of the root layout's set. Signers open this page on phones from a
 * link, often on slow connections, so it carries the smallest message
 * payload of any area (src/i18n/client-messages.ts).
 */
export default function SignLayout({ children }: { children: React.ReactNode }) {
  return <ClientMessagesProvider area="sign">{children}</ClientMessagesProvider>
}
