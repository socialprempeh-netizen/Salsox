"use client"

/**
 * The switches on /admin/security: two-factor authentication as a feature,
 * its two methods (authenticator app, passkey), enforcing it on every user,
 * and signing people out after a period without activity.
 *
 * Each switch saves on its own through updateSecuritySettings
 * (src/app/actions/security-settings.ts), which re-checks the policy rules on
 * the server. The switch moves at once and moves back, with the reason, if the
 * server refuses. Enforcing 2FA asks first, with the number of people it will
 * stop at the setup screen. The rules themselves (the last method stays on,
 * no enforcing with 2FA off) are in src/lib/security-policy.ts; the page only
 * mirrors them so the controls never offer what the server would refuse.
 *
 * Phone-first: rows stack their control under the text below `sm`, the
 * "On this page" list appears beside the content from `lg`. Square corners.
 * Sections enter once with framer-motion; the method list dims and the
 * timeout choices slide in and out with the switches; reduced motion turns
 * all of it into plain changes.
 */
import { useState, useTransition } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { useTranslations } from "next-intl"
import { Fingerprint, Info, ShieldCheck, ShieldAlert, Smartphone, TimerReset, UsersRound } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { toast } from "@/components/ui/sonner"
import { MotionSwitch } from "@/components/ui/motion-switch"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { updateSecuritySettings } from "@/app/actions/security-settings"
import { lockedMethod, SESSION_TIMEOUT_CHOICES, type SecurityPatch, type SecurityPolicy } from "@/lib/security-policy"
import { cn } from "@/lib/utils"

type Counts = { totpUsers: number; passkeyUsers: number; usersWithout: number }

export function SecurityConsole({ initial, counts }: { initial: SecurityPolicy; counts: Counts }) {
  const t = useTranslations("admin.security")
  const reduceMotion = useReducedMotion()
  const [policy, setPolicy] = useState(initial)
  const [pending, startTransition] = useTransition()
  const [confirmEnforce, setConfirmEnforce] = useState(false)
  const locked = lockedMethod(policy)

  function save(patch: SecurityPatch) {
    const before = policy
    // Mirrors applySecurityPatch for the instant answer; the server decides.
    setPolicy((p) => ({ ...p, ...patch, ...(patch.twoFactorEnabled === false ? { enforceTwoFactor: false } : {}) }))
    startTransition(async () => {
      const result = await updateSecuritySettings(patch)
      if (result.ok) {
        setPolicy(result.policy)
        toast.success(t("saved"))
      } else {
        setPolicy(before)
        toast.error(t(`errors.${result.error}`))
      }
    })
  }

  const enter = (i: number) => ({
    initial: { opacity: 0, y: reduceMotion ? 0 : 8 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.3, delay: reduceMotion ? 0 : i * 0.06 },
  })

  const timeoutLabel = (m: number) => (m < 60 ? t("minutes", { count: m }) : t("hours", { count: m / 60 }))

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_13rem]">
      <div className="min-w-0 space-y-6">
        {/* ── Two-factor authentication ─────────────────────────────────── */}
        <motion.section {...enter(0)} id="two-factor" aria-labelledby="two-factor-title" className="scroll-mt-24 border bg-card">
          <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div className="flex min-w-0 items-start gap-3">
              <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center bg-primary text-primary-foreground" aria-hidden="true">
                <ShieldCheck className="h-5 w-5" strokeWidth={1.75} />
              </span>
              <div className="min-w-0">
                <h2 id="two-factor-title" className="text-lg font-semibold tracking-tight">{t("twoFactorTitle")}</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">{t("twoFactorBody")}</p>
              </div>
            </div>
            <MotionSwitch size="lg" checked={policy.twoFactorEnabled} disabled={pending} onCheckedChange={(on) => save({ twoFactorEnabled: on })} aria-label={t("twoFactorTitle")} />
          </div>

          <div className="flex items-start gap-2 border-t bg-muted/40 px-4 py-3 text-xs text-muted-foreground sm:px-6">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <p>{policy.twoFactorEnabled ? t("adminsAlways") : t("offNote")}</p>
          </div>

          {/* Methods apply to admins too, so they stay usable with 2FA off for users. */}
          <div className="border-t p-4 sm:p-6">
            <h3 className="text-sm font-semibold">{t("methodsTitle")}</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">{t("methodsBody")}</p>
            <ul className="mt-4 space-y-2">
              <MethodRow
                icon={Smartphone}
                title={t("totpTitle")}
                body={t("totpBody")}
                usage={t("usage", { count: counts.totpUsers })}
                checked={policy.totpEnabled}
                locked={locked === "totp"}
                lockedHint={t("lockedHint")}
                disabled={pending}
                onChange={(on) => save({ totpEnabled: on })}
              />
              <MethodRow
                icon={Fingerprint}
                title={t("passkeyTitle")}
                body={t("passkeyBody")}
                usage={t("usage", { count: counts.passkeyUsers })}
                checked={policy.passkeyEnabled}
                locked={locked === "passkey"}
                lockedHint={t("lockedHint")}
                disabled={pending}
                onChange={(on) => save({ passkeyEnabled: on })}
              />
            </ul>
          </div>

          <div className={cn("flex flex-col gap-3 border-t p-4 transition-opacity sm:flex-row sm:items-start sm:justify-between sm:p-6", !policy.twoFactorEnabled && "opacity-60")}>
            <div className="flex min-w-0 items-start gap-3">
              <UsersRound className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0">
                <h3 id="enforce-title" className="text-sm font-semibold">{t("enforceTitle")}</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">{t("enforceBody")}</p>
                <AnimatePresence initial={false}>
                  {policy.enforceTwoFactor && (
                    <motion.p
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: reduceMotion ? 0 : 0.2 }}
                      className="mt-2 inline-flex items-center gap-1.5 border border-primary/30 bg-primary/10 px-2 py-1 text-xs font-medium text-primary"
                    >
                      <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
                      {t("enforceActive", { count: counts.usersWithout })}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>
            </div>
            <MotionSwitch
              checked={policy.enforceTwoFactor}
              disabled={pending || !policy.twoFactorEnabled}
              onCheckedChange={(on) => (on ? setConfirmEnforce(true) : save({ enforceTwoFactor: false }))}
              aria-labelledby="enforce-title"
              className="self-start sm:self-auto"
            />
          </div>
        </motion.section>

        {/* ── Session timeout ──────────────────────────────────────────── */}
        <motion.section {...enter(1)} id="session-timeout" aria-labelledby="timeout-title" className="scroll-mt-24 border bg-card">
          <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div className="flex min-w-0 items-start gap-3">
              <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center border bg-muted text-foreground" aria-hidden="true">
                <TimerReset className="h-5 w-5" strokeWidth={1.75} />
              </span>
              <div className="min-w-0">
                <h2 id="timeout-title" className="text-lg font-semibold tracking-tight">{t("timeoutTitle")}</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">{t("timeoutBody")}</p>
              </div>
            </div>
            <MotionSwitch
              checked={policy.sessionTimeoutMinutes !== null}
              disabled={pending}
              onCheckedChange={(on) => save({ sessionTimeoutMinutes: on ? 30 : null })}
              aria-labelledby="timeout-title"
            />
          </div>
          <AnimatePresence initial={false}>
            {policy.sessionTimeoutMinutes !== null && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: reduceMotion ? 0 : 0.22 }}
                className="overflow-hidden border-t"
              >
                <div className="p-4 sm:p-6">
                  <p className="mb-3 text-xs text-muted-foreground" aria-hidden="true">{t("timeoutLegend")}</p>
                  <div role="radiogroup" aria-label={t("timeoutLegend")} className="grid grid-cols-3 gap-px border bg-border sm:grid-cols-5 [&>*:last-child]:col-span-2 sm:[&>*:last-child]:col-span-1">
                    {SESSION_TIMEOUT_CHOICES.map((m) => {
                      const active = policy.sessionTimeoutMinutes === m
                      return (
                        <button
                          key={m}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          disabled={pending}
                          onClick={() => !active && save({ sessionTimeoutMinutes: m })}
                          className={cn(
                            "relative h-11 bg-card text-sm font-medium outline-none transition-colors focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring",
                            active ? "text-primary-foreground" : "text-foreground hover:bg-muted"
                          )}
                        >
                          {active && (
                            <motion.span
                              layoutId="timeout-active"
                              transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 480, damping: 36 }}
                              className="absolute inset-0 bg-primary"
                              aria-hidden="true"
                            />
                          )}
                          <span className="relative">{timeoutLabel(m)}</span>
                        </button>
                      )
                    })}
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">{t("timeoutWarning")}</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.section>
      </div>

      {/* The page's own map, beside it on wide screens. */}
      <nav aria-label={t("onThisPage")} className="hidden lg:block">
        <div className="sticky top-24 border-l pl-4 text-sm">
          <p className="text-xs font-medium text-muted-foreground">{t("onThisPage")}</p>
          <ul className="mt-2 space-y-1.5">
            {[
              ["#two-factor", t("twoFactorTitle")],
              ["#session-timeout", t("timeoutTitle")],
              ["#your-sign-in", t("yourSignIn")],
              ["#admins", t("adminsTitle")],
              ["#sign-ins", t("signInsTitle")],
            ].map(([href, label]) => (
              <li key={href}>
                <a href={href} className="text-muted-foreground hover:text-foreground">{label}</a>
              </li>
            ))}
          </ul>
        </div>
      </nav>

      <AlertDialog open={confirmEnforce} onOpenChange={setConfirmEnforce}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("enforceConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("enforceConfirmBody", { count: counts.usersWithout })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => save({ enforceTwoFactor: true })}>{t("enforceConfirm")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/** One sign-in method: what it is, how many people use it, and its switch. */
function MethodRow(props: {
  icon: LucideIcon
  title: string
  body: string
  usage: string
  checked: boolean
  locked: boolean
  lockedHint: string
  disabled: boolean
  onChange: (on: boolean) => void
}) {
  const Icon = props.icon
  const id = `method-${props.title.replace(/\W+/g, "-").toLowerCase()}`
  return (
    <li className="flex flex-col gap-3 border bg-muted/40 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
      <div className="flex min-w-0 items-start gap-3">
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center border bg-card" aria-hidden="true">
          <Icon className="h-4 w-4" strokeWidth={1.75} />
        </span>
        <div className="min-w-0">
          <p id={id} className="text-sm font-medium">{props.title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{props.body}</p>
          <p className="mt-1 text-xs text-muted-foreground">{props.locked ? props.lockedHint : props.usage}</p>
        </div>
      </div>
      <MotionSwitch checked={props.checked} locked={props.locked} disabled={props.disabled} onCheckedChange={props.onChange} aria-labelledby={id} className="self-start sm:self-auto" />
    </li>
  )
}
