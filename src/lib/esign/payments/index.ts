/**
 * Provider registry for Sign & Pay. The signing flow asks for a provider by
 * the enum stored on the document and never imports an adapter directly.
 */
import type { PaymentProvider } from "@prisma/client"
import { stripeSignAndPay } from "./stripe"
import { paystackSignAndPay } from "./paystack"
import type { SignAndPayProvider } from "./types"

const providers: Record<PaymentProvider, SignAndPayProvider> = {
  STRIPE: stripeSignAndPay,
  PAYSTACK: paystackSignAndPay,
}

export function getProvider(provider: PaymentProvider): SignAndPayProvider {
  return providers[provider]
}

export function configuredProviders(): PaymentProvider[] {
  return (Object.keys(providers) as PaymentProvider[]).filter((p) => providers[p].isConfigured())
}
