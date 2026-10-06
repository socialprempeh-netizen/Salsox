/**
 * SMS reminders for pending signatures: the second channel beside the email
 * reminders in documents.ts, opted into per document by the sender.
 *
 * The provider is Twilio's REST API, called with `fetch` (one POST, no client
 * library). Configuration is three environment variables, and the feature is
 * off unless all of them hold real-looking credentials:
 *
 *   TWILIO_ACCOUNT_SID   AC followed by 32 hex characters
 *   TWILIO_AUTH_TOKEN    32 hex characters
 *   TWILIO_FROM_NUMBER   an E.164 number (+15551234567), or instead
 *   TWILIO_MESSAGING_SERVICE_SID   MG followed by 32 hex characters
 *
 * plus SMS_REMINDERS_ENABLED="false" as a kill switch that turns it off with
 * the credentials still in place. The shape checks are what make the feature
 * degrade gracefully: the placeholders in .env.example ("ACxxxx...") fail
 * them, so a deployment that has not added real keys has no SMS option in
 * the editor, sends nothing, and loses nothing else.
 *
 * Like email (emails.ts), an SMS that fails never fails the action that
 * triggered it: the outcome is reported and the caller decides what to say.
 */
import { getTranslations } from "next-intl/server"
import { routing } from "@/i18n/routing"
import { toE164 } from "./phone"

export type SmsConfig = {
  accountSid: string
  authToken: string
  /** Exactly one of these is set: a sender number, or a messaging service. */
  from: string | null
  messagingServiceSid: string | null
}

type EnvSource = Record<string, string | undefined>

/** The SMS configuration, or null when this deployment cannot send SMS. */
export function smsConfig(env: EnvSource = process.env): SmsConfig | null {
  if (env.SMS_REMINDERS_ENABLED?.trim().toLowerCase() === "false") return null
  const accountSid = env.TWILIO_ACCOUNT_SID?.trim() ?? ""
  const authToken = env.TWILIO_AUTH_TOKEN?.trim() ?? ""
  const from = toE164(env.TWILIO_FROM_NUMBER ?? "")
  const messagingServiceSid = env.TWILIO_MESSAGING_SERVICE_SID?.trim() ?? ""
  if (!/^AC[0-9a-f]{32}$/i.test(accountSid) || !/^[0-9a-f]{32}$/i.test(authToken)) return null
  if (/^MG[0-9a-f]{32}$/i.test(messagingServiceSid)) return { accountSid, authToken, from: null, messagingServiceSid }
  if (from) return { accountSid, authToken, from, messagingServiceSid: null }
  return null
}

/** Whether SMS reminders can be offered at all on this deployment. */
export function smsConfigured(env: EnvSource = process.env): boolean {
  return smsConfig(env) !== null
}

// toE164 moved to ./phone (the editor needs it in the browser, and this file
// reads server-only translations); re-exported for the callers here.
export { toE164 }

/**
 * Keeps a reminder to one or two SMS segments: the title is the only part of
 * unbounded length, so it is the part that gets shortened.
 */
export function shortTitle(title: string, max = 40): string {
  const clean = title.replace(/\s+/g, " ").trim()
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`
}

export type SmsOutcome = "sent" | "notConfigured" | "failed"

/** Sends one SMS. Never throws. */
export async function sendSms(
  to: string,
  body: string,
  config: SmsConfig | null = smsConfig(),
  fetchImpl: typeof fetch = fetch,
): Promise<SmsOutcome> {
  if (!config) return "notConfigured"
  const number = toE164(to)
  if (!number) return "failed"

  const form = new URLSearchParams({ To: number, Body: body })
  if (config.messagingServiceSid) form.set("MessagingServiceSid", config.messagingServiceSid)
  else form.set("From", config.from!)

  try {
    const response = await fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`, {
      method: "POST",
      headers: {
        authorization: `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64")}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: form,
      // A provider that hangs must not hold up the reminder sweep.
      signal: AbortSignal.timeout(10_000),
    })
    if (response.ok) return "sent"
    console.error("[esign sms] provider refused", response.status, (await response.text().catch(() => "")).slice(0, 300))
    return "failed"
  } catch (error) {
    console.error("[esign sms] send failed", error)
    return "failed"
  }
}

/** The reminder text, in the default locale like the emails. */
export async function sendSigningReminderSms(args: { to: string; senderName: string; title: string; url: string }): Promise<SmsOutcome> {
  const t = await getTranslations({ locale: routing.defaultLocale, namespace: "esignSms" })
  const body = t("reminder", { sender: shortTitle(args.senderName, 30), title: shortTitle(args.title), url: args.url })
  return sendSms(args.to, body)
}
