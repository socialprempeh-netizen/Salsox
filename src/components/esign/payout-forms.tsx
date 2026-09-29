"use client"

/**
 * Payout connection controls: Stripe Connect (redirects to Stripe's hosted
 * onboarding) and Paystack (subaccount from bank details).
 */
import { useActionState, useEffect, useTransition } from "react"
import { useTranslations } from "next-intl"
import { connectPaystackAction, connectStripeAction, refreshPayoutStatusAction, type PayoutState } from "@/app/actions/payouts"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "@/components/ui/sonner"

export function ConnectStripeButton({ connected }: { connected: boolean }) {
  const t = useTranslations("esign.payouts")
  const [pending, startTransition] = useTransition()
  return (
    <Button
      loading={pending}
      variant={connected ? "outline" : "primary"}
      onClick={() =>
        startTransition(async () => {
          // On success the action redirects to Stripe and never returns.
          const result = await connectStripeAction()
          if (result?.error) toast.error(result.error)
        })
      }
    >
      {connected ? t("stripeContinue") : t("stripeConnect")}
    </Button>
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
          <select id="bankCode" name="bankCode" required className="h-11 w-full rounded-xl border bg-background px-3 text-sm">
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
