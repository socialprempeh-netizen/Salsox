"use client"

/**
 * Redeeming an AppSumo license, shared by the public /redeem page (where
 * AppSumo sends a buyer after activation) and /dashboard/redeem.
 *
 * - With `code` (AppSumo's OAuth redirect), the key is read from AppSumo at
 *   once, with no typing.
 * - Otherwise a one-field form takes the key, checked as a UUID in the browser
 *   (react-hook-form with zod) and again by the server action.
 * - Signed out, the key is kept until sign-up or log-in, and the panel says
 *   so, with both ways in. Signed in, the plan is applied on the spot.
 *
 * Motion (framer-motion): the states cross-fade, and a redeemed license lands
 * as a sealed plan card, the one moment that moves on its own. Everything
 * snaps under prefers-reduced-motion.
 */
import { useEffect, useRef, useState, useTransition } from "react"
import Link from "next/link"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { useTranslations } from "next-intl"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { BadgeCheck, KeyRound, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { exchangeCodeAction, redeemLicenseAction, type RedeemActionState } from "@/app/actions/appsumo"

const KEY = /^\s*[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\s*$/

export function RedeemPanel({ code, signedIn, initialKey }: { code?: string; signedIn: boolean; initialKey?: string }) {
  const t = useTranslations("appsumo")
  const reduceMotion = useReducedMotion()
  const [state, setState] = useState<RedeemActionState | null>(null)
  const [exchanging, setExchanging] = useState(Boolean(code))
  const [pending, startTransition] = useTransition()
  const started = useRef(false)

  const schema = z.object({ licenseKey: z.string().regex(KEY, t("keyInvalid")) })
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { licenseKey: initialKey ?? "" } })

  // AppSumo's one-time code: exchanged once, even under React's double effects.
  useEffect(() => {
    if (!code || started.current) return
    started.current = true
    exchangeCodeAction(code).then((result) => {
      setState(result)
      setExchanging(false)
    })
  }, [code])

  const onSubmit = form.handleSubmit(({ licenseKey }) =>
    startTransition(async () => {
      const result = await redeemLicenseAction({ licenseKey })
      setState(result)
      if (result.status === "error") form.setError("licenseKey", { message: result.message })
      // No router.refresh() here: the page hides this form once a license is
      // active, which unmounted the success card the moment it appeared. The
      // action revalidates the dashboard, so the next page is fresh anyway.
    })
  )

  const fade = reduceMotion ? { initial: false, animate: { opacity: 1 }, exit: { opacity: 0 } } : { initial: { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -6 }, transition: { duration: 0.2 } }
  const next = encodeURIComponent("/dashboard/redeem")

  return (
    <AnimatePresence mode="wait" initial={false}>
      {exchanging ? (
        <motion.div key="exchanging" {...fade} role="status" className="flex items-center gap-3 border border-border bg-muted/40 p-4 text-sm">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden />
          {t("exchanging")}
        </motion.div>
      ) : state?.status === "redeemed" ? (
        <motion.div key="redeemed" {...fade} className="space-y-4">
          <motion.div
            initial={reduceMotion ? false : { scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={reduceMotion ? undefined : { type: "spring", stiffness: 260, damping: 20 }}
            className="relative border-2 border-primary bg-primary/5 p-5"
          >
            <motion.span
              initial={reduceMotion ? false : { rotate: -25, scale: 0 }}
              animate={{ rotate: 0, scale: 1 }}
              transition={reduceMotion ? undefined : { delay: 0.15, type: "spring", stiffness: 320, damping: 14 }}
              className="absolute -top-4 right-4 flex h-9 w-9 items-center justify-center bg-primary text-primary-foreground"
              aria-hidden
            >
              <BadgeCheck className="h-5 w-5" />
            </motion.span>
            <p className="text-sm text-muted-foreground">{t("redeemedEyebrow")}</p>
            <p className="mt-1 text-2xl font-bold tracking-tight">{t(`plan.${state.tier}`)}</p>
            <p className="mt-3 text-sm">{t("redeemedBody", { plan: t(`plan.${state.tier}`) })}</p>
          </motion.div>
          {state.stoppedSubscription && <p className="border border-border bg-muted/40 p-3 text-sm">{t("stoppedSubscription")}</p>}
          <Button asChild className="w-full sm:w-auto">
            <Link href="/dashboard">{t("startUsing")}</Link>
          </Button>
        </motion.div>
      ) : state?.status === "saved" ? (
        <motion.div key="saved" {...fade} className="space-y-4">
          <div className="border border-l-4 border-primary/30 border-l-primary bg-primary/5 p-4">
            <p className="font-semibold">{t("savedTitle")}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t("savedBody")}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Button asChild className="h-12">
              <Link href={`/signup?next=${next}`}>{t("createAccount")}</Link>
            </Button>
            <Button asChild variant="outline" className="h-12">
              <Link href="/login">{t("logIn")}</Link>
            </Button>
          </div>
        </motion.div>
      ) : (
        <motion.div key="form" {...fade} className="space-y-4">
          {state?.status === "error" && code && !form.formState.errors.licenseKey && (
            <p role="alert" className="border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{state.message}</p>
          )}
          <Form {...form}>
            <form onSubmit={onSubmit} className="space-y-4" noValidate>
              <FormField
                control={form.control}
                name="licenseKey"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("keyLabel")}</FormLabel>
                    {/* The icon sits outside FormControl: its Slot hands the
                        label's id and aria attributes to its direct child,
                        which must be the input itself. */}
                    <div className="relative">
                      <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                      <FormControl>
                        <Input
                          {...field}
                          autoComplete="off"
                          autoCapitalize="none"
                          spellCheck={false}
                          inputMode="text"
                          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                          className="h-12 rounded-none pl-9 font-mono text-[13px] sm:text-sm"
                        />
                      </FormControl>
                    </div>
                    <FormDescription>{t("keyHint")}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" disabled={pending} className="h-12 w-full rounded-none">
                {pending ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
                {pending ? t("submitting") : signedIn ? t("submit") : t("submitSignedOut")}
              </Button>
            </form>
          </Form>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
