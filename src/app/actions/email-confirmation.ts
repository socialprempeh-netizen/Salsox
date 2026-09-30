"use server"

/**
 * Asking for the confirmation email again.
 *
 * A sender must confirm their own address before any document goes out
 * (src/lib/esign/sending-limits.ts). The email is sent once at sign-up; this
 * action is the way back for someone who lost it, called from the notice on
 * the Documents pages.
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

  if (!(await checkRateLimit(`confirm-email:${current.id}`, 3, 15 * 60 * 1000))) return "rateLimited"

  try {
    await auth.api.sendVerificationEmail({
      body: { email: user.email, callbackURL: AFTER_CONFIRMATION },
      headers: await headers(),
    })
    return "sent"
  } catch (error) {
    console.error("[email-confirmation] resend failed", error)
    return "failed"
  }
}
