/**
 * Payouts for Sign & Pay: where money collected from signers is settled.
 * Stripe for cards worldwide, Paystack for cards and mobile money in Ghana,
 * Nigeria, Kenya and South Africa. A sender can connect either or both.
 */
import { getTranslations } from "next-intl/server"
import { CheckCircle2, Clock } from "lucide-react"
import { requireUser } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getProvider } from "@/lib/esign/payments"
import { listPaystackBanks } from "@/lib/esign/payments/paystack"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ConnectStripeButton, PaystackForm, RefreshPayoutsButton } from "@/components/esign/payout-forms"

const PAYSTACK_COUNTRY = process.env.PAYSTACK_COUNTRY ?? "ghana"

export default async function PayoutsPage() {
  const user = await requireUser()
  const t = await getTranslations("esign.payouts")
  const accounts = await prisma.payoutAccount.findMany({ where: { userId: user.id } })
  const stripe = accounts.find((a) => a.provider === "STRIPE")
  const paystack = accounts.find((a) => a.provider === "PAYSTACK")
  const stripeAvailable = getProvider("STRIPE").isConfigured()
  const paystackAvailable = getProvider("PAYSTACK").isConfigured()

  let banks: { name: string; code: string }[] = []
  if (paystackAvailable && !paystack?.ready) {
    banks = await listPaystackBanks(PAYSTACK_COUNTRY).catch(() => [])
  }

  const status = (ready?: boolean) =>
    ready ? (
      <Badge variant="success"><CheckCircle2 className="mr-1 h-3 w-3" />{t("ready")}</Badge>
    ) : (
      <Badge variant="secondary"><Clock className="mr-1 h-3 w-3" />{t("notReady")}</Badge>
    )

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="mt-1 text-muted-foreground">{t("subtitle")}</p>
        </div>
        {accounts.length > 0 && <RefreshPayoutsButton />}
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base">Stripe</CardTitle>
            {stripe && status(stripe.ready)}
          </div>
          <CardDescription>{t("stripeBody")}</CardDescription>
        </CardHeader>
        <CardContent>
          {stripeAvailable ? (
            stripe?.ready ? <p className="text-sm text-muted-foreground">{t("connectedAs", { id: stripe.externalAccountId })}</p> : <ConnectStripeButton connected={Boolean(stripe)} />
          ) : (
            <p className="text-sm text-muted-foreground">{t("providerOff")}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base">Paystack</CardTitle>
            {paystack && status(paystack.ready)}
          </div>
          <CardDescription>{t("paystackBody")}</CardDescription>
        </CardHeader>
        <CardContent>
          {paystackAvailable ? (
            paystack?.ready ? <p className="text-sm text-muted-foreground">{t("connectedAs", { id: paystack.externalAccountId })}</p> : <PaystackForm banks={banks} />
          ) : (
            <p className="text-sm text-muted-foreground">{t("providerOff")}</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
