/**
 * Paystack adapter for Sign & Pay (cards and mobile money in Ghana, Nigeria,
 * Kenya, South Africa and more).
 *
 * Talks to the REST API directly with fetch: the surface we need is four
 * endpoints, which does not justify an SDK. The sender is paid through a
 * Paystack subaccount; the platform keeps `platformFee()` via
 * `transaction_charge`.
 */
import { createHmac, timingSafeEqual } from "node:crypto"
import { platformFee, type CheckoutRequest, type SignAndPayProvider } from "./types"

const API = "https://api.paystack.co"

function secretKey(): string {
  const key = process.env.PAYSTACK_SECRET_KEY
  if (!key) throw new Error("PAYSTACK_SECRET_KEY is not set")
  return key
}

async function paystack<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${secretKey()}`, "Content-Type": "application/json", ...init.headers },
    cache: "no-store",
  })
  const body = (await res.json().catch(() => null)) as { status?: boolean; message?: string; data?: T } | null
  if (!res.ok || !body?.status) throw new Error(`Paystack ${path} failed: ${body?.message ?? res.status}`)
  return body.data as T
}

export const paystackSignAndPay: SignAndPayProvider = {
  isConfigured() {
    return Boolean(process.env.PAYSTACK_SECRET_KEY)
  },

  async createCheckout(req: CheckoutRequest) {
    const fee = platformFee(req.amount)
    const data = await paystack<{ authorization_url: string; reference: string }>("/transaction/initialize", {
      method: "POST",
      body: JSON.stringify({
        email: req.payerEmail,
        amount: req.amount,
        currency: req.currency,
        reference: req.reference,
        callback_url: req.successUrl,
        subaccount: req.payoutAccountId,
        // Subaccount bears Paystack's fees; the platform's cut is explicit.
        bearer: "subaccount",
        ...(fee > 0 ? { transaction_charge: fee } : {}),
        metadata: { salsoxPaymentId: req.paymentId, salsoxDocumentId: req.documentId, cancel_action: req.cancelUrl },
      }),
    })
    return { url: data.authorization_url, providerRef: data.reference }
  },

  async verify(providerRef: string) {
    const data = await paystack<{ status: string; amount: number; currency: string }>(
      `/transaction/verify/${encodeURIComponent(providerRef)}`
    )
    const status = data.status === "success" ? "PAID" : data.status === "failed" || data.status === "abandoned" ? "FAILED" : "PENDING"
    return { status, amount: data.amount, currency: data.currency?.toUpperCase() }
  },

  async isPayoutReady(externalAccountId: string) {
    const data = await paystack<{ active?: boolean; is_verified?: boolean }>(
      `/subaccount/${encodeURIComponent(externalAccountId)}`
    )
    return data.active !== false
  },

  // Paystack has no call to void an initialized transaction. An abandoned one
  // simply never succeeds; one that does after its document closed is
  // refunded by reconciliation.
  async cancelCheckout() {
    return false
  },

  async refund({ providerRef }) {
    try {
      const data = await paystack<{ id?: number | string }>("/refund", {
        method: "POST",
        body: JSON.stringify({ transaction: providerRef }),
      })
      return { refundId: String(data?.id ?? `paystack:${providerRef}`) }
    } catch (error) {
      // Refunded already: Paystack reports the transaction as reversed.
      if (/reversed|already been refunded|fully refunded/i.test(String((error as Error).message))) {
        return { refundId: `already:${providerRef}` }
      }
      throw error
    }
  },
}

/** Creates the sender's settlement subaccount. Bank codes come from `listPaystackBanks`. */
export async function createPaystackSubaccount(args: {
  businessName: string
  bankCode: string
  accountNumber: string
}): Promise<string> {
  const data = await paystack<{ subaccount_code: string }>("/subaccount", {
    method: "POST",
    body: JSON.stringify({
      business_name: args.businessName,
      settlement_bank: args.bankCode,
      account_number: args.accountNumber,
      // Required by the API; the actual platform cut is set per transaction.
      percentage_charge: 0,
    }),
  })
  return data.subaccount_code
}

export async function listPaystackBanks(country: string): Promise<{ name: string; code: string }[]> {
  const data = await paystack<{ name: string; code: string }[]>(`/bank?country=${encodeURIComponent(country)}&perPage=200`)
  return data.map(({ name, code }) => ({ name, code }))
}

/** Paystack signs webhooks with HMAC-SHA512 of the raw body, keyed by the secret key. */
export function verifyPaystackSignature(rawBody: string, signature: string | null, key = process.env.PAYSTACK_SECRET_KEY): boolean {
  if (!signature || !key) return false
  const expected = createHmac("sha512", key).update(rawBody).digest("hex")
  const a = Buffer.from(expected, "utf8")
  const b = Buffer.from(signature, "utf8")
  return a.length === b.length && timingSafeEqual(a, b)
}
