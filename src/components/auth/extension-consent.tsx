"use client"

/**
 * The connect page's question (/extension/connect): what the Salsox Signing
 * extension will be able to do, then Connect or Cancel. Either button asks
 * the server where to send the window (src/app/actions/extension-connect.ts)
 * and goes there; Chrome hands that address to the extension, which closes
 * the window.
 *
 * Enters with framer-motion, plain under reduced motion. Square corners.
 */
import { useState, useTransition } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { useTranslations } from "next-intl"
import { FileSignature, KeyRound, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cancelExtensionConnectAction, connectExtensionAction, type ConnectActionResult } from "@/app/actions/extension-connect"

export function ExtensionConsent({ redirectUri }: { redirectUri: string }) {
  const t = useTranslations("dashboard.extensionConnect")
  const reduceMotion = useReducedMotion()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const go = (action: (uri: string) => Promise<ConnectActionResult>) =>
    start(async () => {
      setError(null)
      const result = await action(redirectUri)
      if (result.ok) window.location.replace(result.url)
      else setError(result.error === "rate" ? t("errorRate") : t("errorInvalid"))
    })

  const items = [
    { icon: Send, text: t("canSend") },
    { icon: FileSignature, text: t("canPlan") },
    { icon: KeyRound, text: t("canRevoke") },
  ]

  return (
    <motion.div initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
      <ul className="space-y-3 border-y border-border py-4">
        {items.map(({ icon: Icon, text }) => (
          <li key={text} className="flex items-start gap-3 text-sm text-foreground">
            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <span>{text}</span>
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="mt-6 flex flex-col gap-2 sm:flex-row-reverse">
        <Button type="button" className="h-11 flex-1 rounded-none" disabled={pending} onClick={() => go(connectExtensionAction)}>
          {t("connect")}
        </Button>
        <Button type="button" variant="outline" className="h-11 flex-1 rounded-none" disabled={pending} onClick={() => go(cancelExtensionConnectAction)}>
          {t("cancel")}
        </Button>
      </div>
    </motion.div>
  )
}
