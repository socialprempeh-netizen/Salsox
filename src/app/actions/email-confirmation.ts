"use server"

/**
 * Asking for the confirmation email again.
 *
 * A sender must confirm their own address before any document goes out
 * (src/lib/esign/sending-limits.ts). The email is sent once at sign-up; this
 * action is the way back for someone who lost it, called from the notice on
 * the Documents pages.
 *
 * "sent" is returned only when the email provider accepted the message. The
 * auth library does not pass that answer back, so it is captured on the way
 * (src/lib/email-outcome.ts); a refusal, or no attempt at all, is "failed".
 *
 * It sends only to the signed-in user's own address, read from the database,
 * and never to an address the browser supplies: otherwise the button would be
 * a way to email strangers. The library has its own limit on this endpoint;
 * the one here is per user, so it also holds across instances once the shared
 * rate-limit store is configured.
 */
import { headers } from "next/headers"
import { auth } from "@/auth"
import { getCurrentUser } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { captureEmailOutcome } from "@/lib/email-outcome"
import { checkRateLimit } from "@/lib/rate-limit"

export type ResendConfirmationResult = "sent" | "alreadyConfirmed" | "rateLimited" | "failed"

/** Where the link in the email lands once the address is confirmed. */
const AFTER_CONFIRMATION = "/dashboard/documents"

export async function resendConfirmationEmail(): Promise<ResendConfirmationResult> {
  const current = await getCurrentUser()
  if (!current) return "failed"

  const user = await prisma.user.findUnique({ where: { id: current.id }, select: { email: true, emailVerified: true } })
  if (!user) return "failed"
  if (user.emailVerified) return "alreadyConfirmed"

  // Five, not three: a failed attempt offers "Try again", and a person who
  // takes that offer twice should not be told to wait for it.
  // if (!(await checkRateLimit(`confirm-email:${current.id}`, 3, 15 * 60 * 1000))) return "rateLimited"
  if (!(await checkRateLimit(`confirm-email:${current.id}`, 5, 15 * 60 * 1000))) return "rateLimited"

  try {
    const requestHeaders = await headers()
    const { outcome } = await captureEmailOutcome(() =>
      auth.api.sendVerificationEmail({
        body: { email: user.email, callbackURL: AFTER_CONFIRMATION },
        headers: requestHeaders,
      })
    )
    // Previously `return "sent"` whenever the call above did not throw, which
    // it does not when Resend refuses the message.
    // return "sent"
    if (outcome !== true) {
      console.error("[email-confirmation] provider did not accept the email", { attempted: outcome !== undefined })
      return "failed"
    }
    return "sent"
  } catch (error) {
    console.error("[email-confirmation] resend failed", error)
    return "failed"
  }
}
