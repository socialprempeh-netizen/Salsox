"use client"

/**
 * Payout connection controls: Stripe Connect (redirects to Stripe's hosted
 * onboarding) and Paystack (subaccount from bank details).
 */
import { useActionState, useEffect, useState, useTransition } from "react"
import { useTranslations } from "next-intl"
import { motion, useReducedMotion } from "framer-motion"
import { connectPaystackAction, connectStripeAction, refreshPayoutStatusAction, type PayoutState } from "@/app/actions/payouts"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "@/components/ui/sonner"

/**
 * Connect (or continue) Stripe. A first connection asks for the country of
 * the sender's business or bank account, since Stripe creates the account
 * for that country and it cannot be changed; continuing an account already
 * created does not ask again. The server re-checks the country
 * (connectStripeAction), so the picker only saves a round trip.
 */
export function ConnectStripeButton({
  connected,
  countries,
}: {
  connected: boolean
  /** Named and sorted on the server (stripeCountryOptions), so hydration matches. */
  countries: { code: string; name: string }[]
}) {
  const t = useTranslations("esign.payouts")
  const reduceMotion = useReducedMotion()
  const [pending, startTransition] = useTransition()
  const [country, setCountry] = useState("")

  const connect = () =>
    startTransition(async () => {
      // On success the action redirects to Stripe and never returns.
      const result = await connectStripeAction(connected ? undefined : country)
      if (result?.error) toast.error(result.error)
    })

  if (connected) {
    return (
      <Button loading={pending} variant="outline" onClick={connect}>
        {t("stripeContinue")}
      </Button>
    )
  }

  return (
    <motion.div
      className="space-y-3"
      initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
    >
      <div className="space-y-1">
        <Label htmlFor="stripeCountry">{t("stripeCountry")}</Label>
        <select
          id="stripeCountry"
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          aria-describedby="stripeCountryHint"
          className="h-11 w-full border bg-background px-3 text-sm"
        >
          <option value="">{t("stripeCountryPick")}</option>
          {countries.map((o) => (
            <option key={o.code} value={o.code}>{o.name}</option>
          ))}
        </select>
        <p id="stripeCountryHint" className="text-xs text-muted-foreground">{t("stripeCountryHint")}</p>
      </div>
      <Button loading={pending} disabled={!country} onClick={connect} className="w-full sm:w-auto">
        {t("stripeConnect")}
      </Button>
    </motion.div>
  )
}

export function RefreshPayoutsButton() {
  const t = useTranslations("esign.payouts")
  const [pending, startTransition] = useTransition()
  return (
    <Button
      variant="ghost"
      size="sm"
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await refreshPayoutStatusAction()
          if (result.error) toast.error(result.error)
          else toast.success(t("refreshed"))
        })
      }
    >
      {t("refresh")}
    </Button>
  )
}

export function PaystackForm({ banks }: { banks: { name: string; code: string }[] }) {
  const t = useTranslations("esign.payouts")
  const [state, action, pending] = useActionState<PayoutState, FormData>(connectPaystackAction, {})
  useEffect(() => {
    if (state.error) toast.error(state.error)
    if (state.ok) toast.success(t("paystackConnected"))
  }, [state, t])

  return (
    <form action={action} className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor="businessName">{t("businessName")}</Label>
        <Input id="businessName" name="businessName" required minLength={2} maxLength={100} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="bankCode">{t("bank")}</Label>
        {banks.length > 0 ? (
          <select id="bankCode" name="bankCode" required className="h-11 w-full border bg-background px-3 text-sm">
            <option value="">{t("bankPick")}</option>
            {banks.map((b) => (
              <option key={`${b.code}-${b.name}`} value={b.code}>{b.name}</option>
            ))}
          </select>
        ) : (
          <Input id="bankCode" name="bankCode" required placeholder={t("bankCodePlaceholder")} />
        )}
      </div>
      <div className="space-y-1">
        <Label htmlFor="accountNumber">{t("accountNumber")}</Label>
        <Input id="accountNumber" name="accountNumber" required inputMode="numeric" pattern="\d{6,20}" />
      </div>
      <Button type="submit" loading={pending} className="w-full sm:w-auto">{t("paystackConnect")}</Button>
    </form>
  )
}
