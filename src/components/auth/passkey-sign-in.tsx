"use client"

/**
 * "Sign in with a passkey" on the sign-in page, shown while passkeys are on
 * (/admin/security). The browser asks for the fingerprint, face, PIN or
 * security key; Better Auth's passkey client (src/lib/auth-client.ts) checks
 * the signed answer and opens the session, which counts as a second factor
 * (src/lib/auth/security-gate.ts), so a passkey sign-in asks for no code.
 *
 * Its words come from the page as props: the sign-in pages send no messages
 * to client components. The error line fades in with framer-motion.
 */
import { useState, useTransition } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { Fingerprint } from "lucide-react"
import { useRouter } from "next/navigation"
import { authClient } from "@/lib/auth-client"

export function PasskeySignIn({ label, failed, cancelled }: { label: string; failed: string; cancelled: string }) {
  const reduceMotion = useReducedMotion()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  function signIn() {
    setError(null)
    startTransition(async () => {
      const result = await authClient.signIn.passkey()
      if (result?.error) {
        setError(/cancel|abort|not allowed/i.test(String(result.error.message ?? "")) ? cancelled : failed)
        return
      }
      router.push("/dashboard")
      router.refresh()
    })
  }

  return (
    <div>
      <button
        type="button"
        onClick={signIn}
        disabled={pending}
        className="flex h-12 w-full items-center justify-center gap-2 border border-border bg-background px-4 text-sm font-medium text-foreground transition-all hover:-translate-y-0.5 hover:shadow-soft disabled:pointer-events-none disabled:opacity-70"
      >
        <Fingerprint className="h-4 w-4" aria-hidden="true" />
        {label}
      </button>
      <AnimatePresence initial={false}>
        {error && (
          <motion.p
            role="alert"
            initial={{ opacity: 0, y: reduceMotion ? 0 : -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-2 text-center text-xs text-destructive"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  )
}
