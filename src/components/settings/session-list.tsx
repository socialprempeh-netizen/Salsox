"use client"

/**
 * The device list on /dashboard/settings/sessions: every signed-in session,
 * with a sign-out per device and one for every device but this one.
 *
 * Rows arrive from the page already described (device, address, dates) and
 * carry the session **id**, never its token: the server actions look the
 * token up themselves, scoped to the caller (src/app/actions/sessions.ts).
 *
 * Both sign-outs ask first, because the device being signed out may be the
 * one the person is holding in their other hand. The row then leaves with a
 * short framer-motion exit, and the list re-renders from the server once the
 * action redirects back with its result. Square corners throughout, per the
 * design rules; no movement under prefers-reduced-motion.
 */
import { useState, useTransition } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { useTranslations } from "next-intl"
import { HelpCircle, LogOut, Monitor, Smartphone, Tablet } from "lucide-react"
import { revokeOtherSessions, revokeSession } from "@/app/actions/sessions"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import type { DeviceKind } from "@/lib/user-agent"
import { cn } from "@/lib/utils"

export type SessionRow = {
  id: string
  device: string | null
  kind: DeviceKind | null
  ip: string | null
  signedIn: string
  lastActive: string
  current: boolean
}

const ICONS = { phone: Smartphone, tablet: Tablet, desktop: Monitor } as const
const RETURN_TO = "/dashboard/settings/sessions"

function form(fields: Record<string, string>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) data.set(key, value)
  return data
}

export function SessionList({ sessions }: { sessions: SessionRow[] }) {
  const t = useTranslations("dashboard.settings.devices")
  const reduceMotion = useReducedMotion()
  const [leaving, setLeaving] = useState<Set<string>>(new Set())
  const [pending, startTransition] = useTransition()
  const others = sessions.filter((s) => !s.current)

  function end(ids: string[], run: () => Promise<void>) {
    setLeaving((prev) => new Set([...prev, ...ids]))
    startTransition(async () => {
      try {
        await run()
      } catch (error) {
        // The action answers with a redirect, which arrives here as a thrown
        // navigation signal and must be let through. Anything else puts the
        // rows back so the person can try again.
        if (error && typeof error === "object" && "digest" in error && String((error as { digest: unknown }).digest).startsWith("NEXT_REDIRECT")) throw error
        setLeaving((prev) => new Set([...prev].filter((id) => !ids.includes(id))))
      }
    })
  }

  const visible = sessions.filter((s) => !leaving.has(s.id))

  return (
    <div className="space-y-5">
      <ul className="divide-y divide-border border border-border">
        <AnimatePresence initial={false}>
          {visible.map((session, i) => {
            const Icon = session.kind ? ICONS[session.kind] : HelpCircle
            return (
              <motion.li
                key={session.id}
                layout={!reduceMotion}
                initial={{ opacity: 0, y: reduceMotion ? 0 : 6 }}
                animate={{ opacity: 1, y: 0, transition: { duration: 0.25, delay: reduceMotion ? 0 : Math.min(i, 6) * 0.04 } }}
                exit={{ opacity: 0, x: reduceMotion ? 0 : 24, transition: { duration: 0.2 } }}
                className={cn("flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between", session.current && "bg-primary/5")}
              >
                <div className="flex min-w-0 gap-3">
                  <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center border", session.current ? "border-primary/40 text-primary" : "border-border text-muted-foreground")}>
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-medium">{session.device ?? t("unknownDevice")}</p>
                      {session.current && (
                        <span className="border border-primary/40 bg-primary/10 px-1.5 py-px text-[11px] font-semibold text-primary">{t("thisDevice")}</span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {session.current ? t("activeNow") : t("lastActive", { when: session.lastActive })}
                      {session.ip && ` · ${session.ip}`}
                    </p>
                    <p className="text-xs text-muted-foreground">{t("signedIn", { when: session.signedIn })}</p>
                  </div>
                </div>

                {!session.current && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm" className="w-full rounded-none sm:w-auto" disabled={pending}>
                        <LogOut className="h-3.5 w-3.5" /> {t("signOut")}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="rounded-none">
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t("signOutTitle")}</AlertDialogTitle>
                        <AlertDialogDescription>
                          {t("signOutBody", { device: session.device ?? t("unknownDevice") })}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel className="rounded-none">{t("cancel")}</AlertDialogCancel>
                        <AlertDialogAction
                          className="rounded-none"
                          onClick={() => end([session.id], () => revokeSession(form({ sessionId: session.id, returnTo: RETURN_TO })))}
                        >
                          {t("signOut")}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </motion.li>
            )
          })}
        </AnimatePresence>
      </ul>

      {others.length > 0 && (
        <div className="flex flex-col gap-3 border border-destructive/30 bg-destructive/5 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold">{t("signOutOthersTitle")}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{t("signOutOthersBody")}</p>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" className="w-full rounded-none sm:w-auto" loading={pending}>
                {t("signOutOthers", { count: others.length })}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="rounded-none">
              <AlertDialogHeader>
                <AlertDialogTitle>{t("signOutOthersConfirmTitle", { count: others.length })}</AlertDialogTitle>
                <AlertDialogDescription>{t("signOutOthersConfirmBody")}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="rounded-none">{t("cancel")}</AlertDialogCancel>
                <AlertDialogAction
                  className="rounded-none"
                  onClick={() => end(others.map((s) => s.id), () => revokeOtherSessions(form({ returnTo: RETURN_TO })))}
                >
                  {t("signOutOthers", { count: others.length })}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </div>
  )
}
