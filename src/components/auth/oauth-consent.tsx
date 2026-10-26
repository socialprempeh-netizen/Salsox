"use client"

/**
 * The OAuth consent page's question (/oauth/authorize): what the connecting
 * app may do on this account, one line per granted scope, then Allow or
 * Cancel. Either asks the server where to send the browser
 * (src/app/actions/oauth.ts) and goes there.
 *
 * Enters with framer-motion, plain under reduced motion. Square corners.
 */
import { useState, useTransition } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { useTranslations } from "next-intl"
import { FileSearch, LayoutTemplate, Send, Webhook } from "lucide-react"
import { Button } from "@/components/ui/button"
import { approveOAuthAction, denyOAuthAction, type ConsentResult } from "@/app/actions/oauth"
import type { OAuthScope } from "@/lib/oauth-server/rules"

const SCOPE_ICON = { "documents:send": Send, "documents:read": FileSearch, "templates:read": LayoutTemplate, "webhooks:manage": Webhook } as const

export function OAuthConsent({ params, scopes, appName }: { params: Record<string, string | undefined>; scopes: OAuthScope[]; appName: string }) {
  const t = useTranslations("oauthConsent")
  const reduceMotion = useReducedMotion()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const go = (action: (p: unknown) => Promise<ConsentResult>) =>
    start(async () => {
      setError(null)
      const result = await action(params)
      if (result.ok) window.location.assign(result.url)
      else setError(result.error === "rate" ? t("errorRate") : result.error === "signedOut" ? t("errorSignedOut") : t("errorInvalid"))
    })

  const label = (scope: OAuthScope) =>
    scope === "documents:send" ? t("scopeSend") : scope === "documents:read" ? t("scopeRead") : scope === "templates:read" ? t("scopeTemplates") : t("scopeWebhooks")

  return (
    <motion.div initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
      <p className="text-sm font-medium text-foreground">{t("canTitle", { app: appName })}</p>
      <ul className="mt-3 space-y-3 border-y border-border py-4">
        {scopes.map((scope) => {
          const Icon = SCOPE_ICON[scope]
          return (
            <li key={scope} className="flex items-start gap-3 text-sm text-foreground">
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              <span>{label(scope)}</span>
            </li>
          )
        })}
      </ul>
      <p className="mt-3 text-xs text-muted-foreground">{t("revokeNote")}</p>
      {error && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="mt-6 flex flex-col gap-2 sm:flex-row-reverse">
        <Button type="button" className="h-11 flex-1 rounded-none" disabled={pending} onClick={() => go(approveOAuthAction)}>
          {t("allow")}
        </Button>
        <Button type="button" variant="outline" className="h-11 flex-1 rounded-none" disabled={pending} onClick={() => go(denyOAuthAction)}>
          {t("cancel")}
        </Button>
      </div>
    </motion.div>
  )
}
