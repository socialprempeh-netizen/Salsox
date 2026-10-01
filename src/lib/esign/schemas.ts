/**
 * Input shapes for the e-signature actions, shared by the browser (to check
 * before the round trip) and the server (which re-parses every time; it is the
 * authority, per AGENTS.md).
 *
 * Errors are returned as the zod issue path, and the actions map them to
 * translated messages, so nothing here is user-facing text.
 */
import { z } from "zod"
import { MAX_RECIPIENTS_PER_DOCUMENT } from "./sending-limits"
import { isSignAndPayCurrency } from "./payments/select"

export const TITLE_MAX = 140
// Was 25, which with the old send limit let one account email thousands of
// addresses in minutes. The number now lives with the other sending rules.
// export const MAX_RECIPIENTS = 25
export const MAX_RECIPIENTS = MAX_RECIPIENTS_PER_DOCUMENT
export const MAX_EXPIRY_DAYS = 365

const percent = z.number().min(0).max(100)

export const recipientInputSchema = z.object({
  // Client-side id so fields can reference recipients that are not saved yet.
  key: z.string().min(1).max(64),
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().pipe(z.email()),
  phone: z
    .string()
    .trim()
    .max(32)
    .regex(/^\+?[\d\s-]*$/)
    .optional()
    .transform((v) => v || undefined),
  role: z.enum(["SIGNER", "APPROVER", "VIEWER", "CC"]).default("SIGNER"),
  order: z.number().int().min(0).max(100).default(0),
})

export const fieldInputSchema = z
  .object({
    recipientKey: z.string().min(1),
    type: z.enum(["SIGNATURE", "INITIALS", "NAME", "EMAIL", "DATE", "TEXT", "CHECKBOX"]),
    page: z.number().int().min(1),
    x: percent,
    y: percent,
    width: z.number().min(1).max(100),
    height: z.number().min(1).max(100),
    required: z.boolean().default(true),
    label: z.string().max(80).optional(),
  })
  .refine((f) => f.x + f.width <= 100.5 && f.y + f.height <= 100.5, { message: "outOfPage" })

export const paymentInputSchema = z.object({
  amount: z.string().trim().min(1),
  // Replaced: any three letters passed, so a crafted request could set a
  // zero-decimal currency and charge a hundred times the amount shown.
  // currency: z.string().trim().length(3).toUpperCase(),
  currency: z.string().trim().toUpperCase().refine((code): boolean => isSignAndPayCurrency(code), { message: "invalidCurrency" }),
  recipientKey: z.string().min(1),
  provider: z.enum(["STRIPE", "PAYSTACK"]).optional(),
})

export const documentSetupSchema = z.object({
  title: z.string().trim().min(1).max(TITLE_MAX),
  signingOrder: z.enum(["PARALLEL", "SEQUENTIAL"]).default("PARALLEL"),
  subject: z.string().trim().max(200).optional(),
  message: z.string().trim().max(2000).optional(),
  expiresInDays: z.number().int().min(1).max(MAX_EXPIRY_DAYS).nullable().default(30),
  recipients: z.array(recipientInputSchema).min(1).max(MAX_RECIPIENTS),
  fields: z.array(fieldInputSchema).max(500),
  payment: paymentInputSchema.nullable().default(null),
})

export type RecipientInput = z.infer<typeof recipientInputSchema>
export type FieldInput = z.infer<typeof fieldInputSchema>
export type DocumentSetup = z.infer<typeof documentSetupSchema>

/**
 * Splits what a person pastes into the Quick Send box ("a@x.com, b@y.com",
 * one per line, or "Ama <ama@x.com>") into unique, lower-cased addresses.
 * Returns the invalid fragments separately so the form can point at them.
 */
export function parseEmailList(input: string): { emails: { email: string; name?: string }[]; invalid: string[] } {
  const seen = new Set<string>()
  const emails: { email: string; name?: string }[] = []
  const invalid: string[] = []
  for (const raw of input.split(/[,;\n]+/)) {
    const part = raw.trim()
    if (!part) continue
    const angle = /^(.*)<([^>]+)>$/.exec(part)
    const email = (angle ? angle[2] : part).trim().toLowerCase()
    const name = angle?.[1].trim().replace(/^"|"$/g, "") || undefined
    if (!z.email().safeParse(email).success) {
      invalid.push(part)
      continue
    }
    if (seen.has(email)) continue
    seen.add(email)
    emails.push(name ? { email, name } : { email })
  }
  return { emails, invalid }
}

/** A readable fallback name from an address: "ama.mensah@x.com" → "Ama Mensah". */
export function nameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? email
  return (
    local
      .split(/[._-]+/)
      .filter(Boolean)
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join(" ") || email
  )
}
