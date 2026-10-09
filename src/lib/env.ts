import { z } from "zod"
import { SENDER_PROBLEM_MESSAGES, senderAddressProblem } from "./email-sender"

/**
 * Environment validation, checked once when the server boots (see
 * `src/instrumentation.ts`).
 *
 * The point is not to make every variable mandatory: a fresh clone has to run
 * with nothing but a database. The point is to catch the configurations that
 * are **half done**, because those fail silently and late. A Stripe key with
 * no webhook secret takes payments and never records them; a Resend key with
 * no sender address throws on the first email, in production, at the worst
 * possible moment.
 *
 * Production is stricter. Three variables are optional on a laptop and not
 * on a live deployment, because each one missing fails without an error: file
 * storage (uploads land on a disk that is wiped), email (invitations are
 * logged instead of sent) and the cron secret (the scheduled jobs never run).
 * See the production block at the end of the schema.
 *
 * Set SKIP_ENV_VALIDATION="true" to bypass this (useful in CI steps that only
 * build or lint and have no secrets).
 */

/**
 * `.env.example` ships every unused variable as `VAR=""`, so an empty string
 * has to mean "not configured" and not "configured to nothing". Getting this
 * wrong would break the boot for anyone who copies that file, which is step
 * one of the setup guide.
 */
const blankAsUnset = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (v === "" ? undefined : v), schema)

const optional = blankAsUnset(z.string().min(1).optional())

/** "true"/"false" flags, unset meaning false. */
const flag = blankAsUnset(z.enum(["true", "false"]).optional())

const prefixed = (prefix: string, label: string) =>
  blankAsUnset(
    z
      .string()
      .min(1)
      .refine((v) => v.startsWith(prefix), { message: `${label} should start with "${prefix}"` })
      .optional(),
  )

export const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).optional(),

    // The only hard requirement: without it nothing can start.
    DATABASE_URL: z
      .string()
      .min(1, "DATABASE_URL is required")
      .refine((v) => /^postgres(ql)?:\/\//.test(v), {
        message: 'DATABASE_URL should be a postgres connection string (postgresql://...)',
      }),
    DIRECT_URL: optional,

    // Better Auth generates a development secret on the fly, but refuses to run
    // without one in production.
    AUTH_SECRET: optional,

    GOOGLE_CLIENT_ID: optional,
    GOOGLE_CLIENT_SECRET: optional,
    GITHUB_CLIENT_ID: optional,
    GITHUB_CLIENT_SECRET: optional,

    STRIPE_SECRET_KEY: prefixed("sk_", "STRIPE_SECRET_KEY"),
    STRIPE_WEBHOOK_SECRET: prefixed("whsec_", "STRIPE_WEBHOOK_SECRET"),
    STRIPE_PRO_PRICE_ID: prefixed("price_", "STRIPE_PRO_PRICE_ID"),
    STRIPE_PRO_YEARLY_PRICE_ID: prefixed("price_", "STRIPE_PRO_YEARLY_PRICE_ID"),
    STRIPE_STARTER_PRICE_ID: prefixed("price_", "STRIPE_STARTER_PRICE_ID"),
    STRIPE_STARTER_YEARLY_PRICE_ID: prefixed("price_", "STRIPE_STARTER_YEARLY_PRICE_ID"),
    STRIPE_METERED_PRICE_ID: prefixed("price_", "STRIPE_METERED_PRICE_ID"),
    STRIPE_LIFETIME_PRICE_ID: prefixed("price_", "STRIPE_LIFETIME_PRICE_ID"),
    // Named after the Checkout parameter it turns on. Off unless "true".
    STRIPE_ALLOW_PROMOTION_CODES: flag,
    // Stripe Tax at checkout (src/lib/stripe-tax.ts). Off unless "true".
    STRIPE_AUTOMATIC_TAX: flag,

    RESEND_API_KEY: prefixed("re_", "RESEND_API_KEY"),

    // E-signatures (docs/esign.md). All optional: the signing flow runs
    // locally with none of them.
    BLOB_READ_WRITE_TOKEN: optional,
    PAYSTACK_SECRET_KEY: prefixed("sk_", "PAYSTACK_SECRET_KEY"),
    PAYSTACK_COUNTRY: optional,
    SIGN_AND_PAY_FEE_BPS: blankAsUnset(z.string().regex(/^\d+$/, "SIGN_AND_PAY_FEE_BPS should be a whole number of basis points").optional()),
    SIGNING_P12_BASE64: optional,
    SIGNING_P12_PASSPHRASE: optional,
    RESEND_AUDIENCE_ID: optional,
    // SMS reminders (src/lib/esign/sms.ts). Deliberately not shape-checked
    // here: placeholder values must not stop the boot. The feature checks the
    // shapes itself and stays off until all of them look real.
    TWILIO_ACCOUNT_SID: optional,
    TWILIO_AUTH_TOKEN: optional,
    TWILIO_FROM_NUMBER: optional,
    TWILIO_MESSAGING_SERVICE_SID: optional,
    // Kill switch: "false" turns SMS off with the credentials still set.
    SMS_REMINDERS_ENABLED: flag,
    EMAIL_FROM: optional,

    KIT_SITE: flag,
    DEMO_MODE: flag,
    WAITLIST_ENABLED: flag,

    // Read by the e-sign cron route, which refuses to run without it. Required
    // in production (below), where that job is what expires links, sends
    // reminders and retries sealing. (It also guarded a demo reset route,
    // since removed: see src/lib/demo-seed.ts.)
    CRON_SECRET: optional,
    // IndexNow key (src/lib/indexnow.ts). Optional: without it the key is
    // derived from CRON_SECRET. When set it must follow the protocol's rule,
    // because a key the engines reject fails every submission silently.
    INDEXNOW_KEY: blankAsUnset(z.string().regex(/^[a-zA-Z0-9-]{8,128}$/, "8 to 128 letters, digits or dashes").optional()),

    NEXT_PUBLIC_APP_URL: optional,
    // Search and analytics (docs/seo.md). All optional: verification tokens
    // for Search Console and Bing Webmaster Tools (DNS verification needs
    // neither), and a GA4 measurement id, which also opens the CSP to Google.
    GOOGLE_SITE_VERIFICATION: optional,
    BING_SITE_VERIFICATION: optional,
    NEXT_PUBLIC_GA_MEASUREMENT_ID: blankAsUnset(z.string().regex(/^G-[A-Z0-9]{4,20}$/, "a GA4 measurement id starts with G-").optional()),
    NEXT_PUBLIC_DEMO_URL: optional,
    NEXT_PUBLIC_CONTACT_EMAIL: optional,
    // Error tracking (src/lib/sentry.ts). All optional: without the DSN
    // Sentry stays off. The other three are read at build time only, for the
    // source map upload (next.config.ts).
    NEXT_PUBLIC_SENTRY_DSN: blankAsUnset(z.string().regex(/^https:\/\/[A-Za-z0-9]+@[A-Za-z0-9.-]+(?::\d+)?\/\d+$/, "a Sentry DSN looks like https://<key>@<host>/<project id>").optional()),
    SENTRY_AUTH_TOKEN: optional,
    SENTRY_ORG: optional,
    SENTRY_PROJECT: optional,
  })
  // Pairs that are useless alone. Each of these has a failure mode that only
  // shows up in production, which is why they are worth failing the boot for.
  .superRefine((env, ctx) => {
    const requireTogether = (a: keyof typeof env, b: keyof typeof env, why: string) => {
      if (env[a] && !env[b]) {
        ctx.addIssue({ code: "custom", path: [b], message: `${b} is required when ${a} is set: ${why}` })
      }
    }

    requireTogether(
      "STRIPE_SECRET_KEY",
      "STRIPE_WEBHOOK_SECRET",
      "checkout would succeed but no payment would ever be recorded",
    )
    requireTogether("RESEND_API_KEY", "EMAIL_FROM", "every email would fail without a sender address")
    requireTogether("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "the Google sign-in button would break")
    requireTogether("GOOGLE_CLIENT_SECRET", "GOOGLE_CLIENT_ID", "the Google sign-in button would break")
    requireTogether("GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET", "the GitHub sign-in button would break")
    requireTogether("GITHUB_CLIENT_SECRET", "GITHUB_CLIENT_ID", "the GitHub sign-in button would break")

    // A sender that cannot reach real recipients (Resend's test sender, the
    // .env.example placeholder): Resend accepts each request, the app says
    // "Sent", and nobody but the Resend account owner receives anything.
    // Production only: in development the test sender is how you try email
    // on your own address.
    const senderProblem = senderAddressProblem(env.EMAIL_FROM)
    if (env.NODE_ENV === "production" && env.RESEND_API_KEY && senderProblem) {
      ctx.addIssue({ code: "custom", path: ["EMAIL_FROM"], message: SENDER_PROBLEM_MESSAGES[senderProblem] })
    }

    if (env.NODE_ENV === "production" && !env.AUTH_SECRET) {
      ctx.addIssue({
        code: "custom",
        path: ["AUTH_SECRET"],
        message: "AUTH_SECRET is required in production: Better Auth refuses to sign sessions without it",
      })
    }

    // What a live deployment cannot run without. Each of these is optional in
    // development, where its absence is handled on purpose (files on the local
    // disk, links in the console, no schedule). In production the same
    // fallbacks fail quietly and look like success, which is the worst way for
    // a product that holds people's contracts to fail, so the server does not
    // start instead.
    //
    // A public demo is exempt: it holds fake data in a database that is reset,
    // and sends nothing on purpose.
    if (env.NODE_ENV === "production" && env.DEMO_MODE !== "true") {
      const requireInProduction = (name: keyof typeof env, why: string) => {
        if (!env[name]) {
          ctx.addIssue({ code: "custom", path: [name], message: `${name} is required in production: ${why}` })
        }
      }
      requireInProduction(
        "BLOB_READ_WRITE_TOKEN",
        "without file storage, uploaded and signed documents are written to the server's temporary disk and lost",
      )
      requireInProduction(
        "RESEND_API_KEY",
        "without email, signing invitations are written to the log instead of being sent, and the app still reports them as sent",
      )
      requireInProduction(
        "CRON_SECRET",
        "without it the scheduled job refuses to run, so links never expire, reminders never go out and a failed seal is never retried",
      )
    }
  })

export type Env = z.infer<typeof envSchema>

/** Just what these functions need, so callers and tests can pass a plain object. */
type EnvSource = Record<string, string | undefined>

/**
 * Validates the given environment and returns it typed. Throws with every
 * problem listed at once, rather than one per restart.
 */
export function parseEnv(source: EnvSource = process.env): Env {
  const result = envSchema.safeParse(source)
  if (result.success) return result.data

  const lines = result.error.issues.map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
  throw new Error(`Invalid environment configuration:\n${lines.join("\n")}`)
}

/**
 * Called at boot. A no-op when SKIP_ENV_VALIDATION is set.
 *
 * A clone that has just been installed has no `DATABASE_URL` yet, and in
 * development that is exactly the state the page at `/` exists to explain.
 * Stopping the boot would replace that page with a stack trace at the second
 * command of the guide, so the missing database is reported and the server
 * starts.
 *
 * Everything else still stops the boot: a half-configured Stripe or Resend is
 * the failure this check is for. And in production a missing database stops
 * the boot as it always did, along with missing file storage, email or cron
 * secret.
 *
 * The problem is printed before it is thrown. The thrown error does stop the
 * server, but where it surfaces depends on the host, and on a serverless
 * platform it can be one line among many: the banner is what someone scanning
 * the boot log finds.
 */
export function validateEnv(source: EnvSource = process.env): void {
  if (source.SKIP_ENV_VALIDATION === "true") return

  if (source.NODE_ENV !== "production" && !source.DATABASE_URL) {
    // Checked with a placeholder in its place, so every other rule still runs.
    parseEnv({ ...source, DATABASE_URL: "postgresql://unset" })
    console.warn(
      "[env] DATABASE_URL is not set. Starting anyway: open the app and the page lists the steps left (docs/getting-started.md).",
    )
    return
  }

  // Was a bare `parseEnv(source)`: same outcome, now announced first.
  // parseEnv(source)
  try {
    parseEnv(source)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    console.error(`\n[env] REFUSING TO START. Fix the environment and redeploy.\n${detail}\n`)
    throw error
  }
}
