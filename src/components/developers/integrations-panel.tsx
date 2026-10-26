"use client"

/**
 * Integrations on the Developers page:
 *
 * - HubSpot and Salesforce, where this deployment offers them: connect (a
 *   link into the OAuth flow, /api/integrations/{provider}/connect), what is
 *   connected, and disconnect. Salesforce connects a production org or a
 *   sandbox, and says when write-backs to it have failed for good.
 * - Connected apps: integrations this account allowed to use it through
 *   OAuth (the Salesforce package), with what each may do and when it was
 *   last used, and Disconnect, which ends every token it holds.
 *
 * Says what happened after a connection attempt, from the callback's
 * `connected=` or `integrationError=` (a toast, once). Phone-first: rows
 * stack and buttons go full width. Square corners. Rows enter and leave with
 * framer-motion; reduced motion makes them appear.
 */
import { useEffect, useTransition } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { useTranslations } from "next-intl"
import { Cable, Cloud, Plug } from "lucide-react"
import { toast } from "@/components/ui/sonner"
import { Button } from "@/components/ui/button"
import { disconnectIntegrationAction } from "@/app/actions/integrations"
import { revokeOAuthGrantAction } from "@/app/actions/oauth"

type HubSpot = { offered: boolean; connected: { hubId: string; hubDomain: string | null; since: string } | null }
type Salesforce = { offered: boolean; connected: { orgId: string; username: string | null; sandbox: boolean; since: string; failedJobs: number } | null }
type App = { id: string; name: string; scopes: string[]; since: string; lastUsed: string | null }

export function IntegrationsPanel({ hubspot, salesforce, apps }: { hubspot: HubSpot; salesforce: Salesforce; apps: App[] }) {
  const t = useTranslations("dashboard.developers.integrations")
  const reduceMotion = useReducedMotion()
  const router = useRouter()
  const search = useSearchParams()
  const [pending, start] = useTransition()

  // The callback's outcome, said once, then dropped from the address.
  useEffect(() => {
    const connected = search.get("connected")
    const failed = search.get("integrationError")
    if (!connected && !failed) return
    const name = t((connected ?? failed) === "hubspot" ? "hubspotName" : "salesforceName")
    if (connected) toast.success(t("connectedToast", { name }))
    else toast.error(search.get("reason") === "declined" ? t("declinedToast", { name }) : t("failedToast", { name }))
    router.replace("/dashboard/developers#integrations", { scroll: false })
  }, [search, router, t])

  const disconnect = (provider: "hubspot" | "salesforce", name: string) =>
    start(async () => {
      const result = await disconnectIntegrationAction(provider)
      if (result.ok) toast.success(t("disconnectedToast", { name }))
      router.refresh()
    })
  const revoke = (app: App) =>
    start(async () => {
      const result = await revokeOAuthGrantAction(app.id)
      if (result.ok) toast.success(t("disconnectedToast", { name: app.name }))
      router.refresh()
    })

  // A full navigation, not a client-side one: the connect route answers with a redirect to the provider.
  const connect = (href: string) => window.location.assign(href)

  const row = "flex flex-col gap-3 border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
  const enter = { initial: { opacity: 0, y: reduceMotion ? 0 : 6 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0 }, transition: { duration: reduceMotion ? 0 : 0.2 } }

  return (
    <div className="space-y-3">
      {hubspot.offered && (
        <motion.div {...enter} className={row}>
          <div className="min-w-0">
            <p className="font-medium">{t("hubspotName")}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {hubspot.connected ? t("hubspotConnected", { account: hubspot.connected.hubDomain ?? hubspot.connected.hubId, date: hubspot.connected.since }) : t("hubspotBody")}
            </p>
          </div>
          {hubspot.connected ? (
            <Button type="button" variant="outline" className="w-full rounded-none sm:w-auto" disabled={pending} onClick={() => disconnect("hubspot", t("hubspotName"))}>
              {t("disconnect")}
            </Button>
          ) : (
            <Button type="button" className="w-full rounded-none sm:w-auto" onClick={() => connect("/api/integrations/hubspot/connect")}>
                {t("connect")}
              </Button>
          )}
        </motion.div>
      )}

      {salesforce.offered && (
        <motion.div {...enter} className={row}>
          <div className="min-w-0">
            <p className="font-medium">{t("salesforceName")}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {salesforce.connected
                ? t(salesforce.connected.sandbox ? "salesforceConnectedSandbox" : "salesforceConnected", { account: salesforce.connected.username ?? salesforce.connected.orgId, date: salesforce.connected.since })
                : t("salesforceBody")}
            </p>
            {salesforce.connected && salesforce.connected.failedJobs > 0 && (
              <p className="mt-1 text-sm text-destructive">{t("salesforceFailed", { count: salesforce.connected.failedJobs })}</p>
            )}
          </div>
          {salesforce.connected ? (
            <Button type="button" variant="outline" className="w-full rounded-none sm:w-auto" disabled={pending} onClick={() => disconnect("salesforce", t("salesforceName"))}>
              {t("disconnect")}
            </Button>
          ) : (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="button" className="w-full rounded-none sm:w-auto" onClick={() => connect("/api/integrations/salesforce/connect")}>
                {t("connect")}
              </Button>
              <Button type="button" variant="outline" className="w-full rounded-none sm:w-auto" onClick={() => connect("/api/integrations/salesforce/connect?sandbox=1")}>
                {t("connectSandbox")}
              </Button>
            </div>
          )}
        </motion.div>
      )}

      <div className="border bg-card">
        <div className="flex items-center gap-2 border-b p-4">
          <Cable className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <h3 className="text-sm font-semibold">{t("appsTitle")}</h3>
        </div>
        {apps.length === 0 ? (
          <p className="flex items-start gap-2 p-4 text-sm text-muted-foreground">
            <Plug className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {t("appsEmpty")}
          </p>
        ) : (
          <ul className="divide-y">
            <AnimatePresence initial={false}>
              {apps.map((app) => (
                <motion.li key={app.id} {...enter} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-medium">
                      <Cloud className="h-4 w-4 text-primary" aria-hidden="true" />
                      {app.name}
                    </p>
                    <p className="mt-0.5 break-words text-sm text-muted-foreground">{t("appScopes", { scopes: app.scopes.join(", ") })}</p>
                    <p className="text-xs text-muted-foreground">{app.lastUsed ? t("appUsed", { since: app.since, used: app.lastUsed }) : t("appSince", { since: app.since })}</p>
                  </div>
                  <Button type="button" variant="outline" className="w-full rounded-none sm:w-auto" disabled={pending} onClick={() => revoke(app)}>
                    {t("disconnect")}
                  </Button>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>
    </div>
  )
}
