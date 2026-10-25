/**
 * The sign-in policy (src/lib/security-policy.ts), enforced inside Better Auth
 * so that no page, action or direct API call can go around it.
 *
 * Before:
 *   - setting up the authenticator app (/two-factor/enable) or a passkey
 *     (/passkey/generate-register-options) is refused when the policy does
 *     not allow that method for this person (canEnroll);
 *   - signing in with a passkey (/passkey/generate-authenticate-options) is
 *     refused while passkeys are turned off.
 *
 * After:
 *   - a passkey sign-in, or adding a passkey, marks the session as having
 *     passed the second factor (Session.twoFactorVerifiedAt). A passkey is a
 *     device the person holds plus a fingerprint, face or PIN: it is a second
 *     factor on its own, and the admin area accepts it as one.
 *
 * Separate from src/auth.ts so the rules read in one place; registered there.
 */
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api"
import type { BetterAuthPlugin } from "better-auth"
import { prisma } from "@/lib/prisma"
import { canEnroll, type AuthMethod } from "@/lib/security-policy"
import { getSecurityPolicy } from "@/lib/security-settings"

const ENROLL_PATHS: Record<string, AuthMethod> = {
  "/two-factor/enable": "totp",
  "/passkey/generate-register-options": "passkey",
}

async function markSession(sessionId: string | undefined) {
  if (!sessionId) return
  try {
    await prisma.session.update({ where: { id: sessionId }, data: { twoFactorVerifiedAt: new Date() } })
  } catch (error) {
    // The sign-in has succeeded; an unsaved mark costs an admin one code later.
    console.warn("[security] could not record the passkey on the session", error)
  }
}

export const securityGate = () =>
  ({
    id: "security-gate",
    hooks: {
      before: [
        {
          matcher: (ctx) => (ctx.path ?? "") in ENROLL_PATHS || ctx.path === "/passkey/generate-authenticate-options",
          handler: createAuthMiddleware(async (ctx) => {
            const policy = await getSecurityPolicy()
            if (ctx.path === "/passkey/generate-authenticate-options") {
              if (!policy.passkeyEnabled) throw new APIError("FORBIDDEN", { message: "Passkeys are turned off", code: "METHOD_DISABLED" })
              return
            }
            const session = await getSessionFromCtx(ctx)
            const role = (session?.user as { role?: string } | undefined)?.role ?? "USER"
            if (!canEnroll(policy, ENROLL_PATHS[ctx.path], role)) {
              throw new APIError("FORBIDDEN", { message: "This sign-in method is turned off", code: "METHOD_DISABLED" })
            }
          }),
        },
      ],
      after: [
        {
          matcher: (ctx) => ctx.path === "/passkey/verify-authentication" || ctx.path === "/passkey/verify-registration",
          handler: createAuthMiddleware(async (ctx) => {
            const returned = ctx.context.returned
            if (!returned || returned instanceof Error) return
            if (ctx.path === "/passkey/verify-authentication") {
              await markSession(ctx.context.newSession?.session.id)
            } else {
              const session = await getSessionFromCtx(ctx)
              await markSession(session?.session.id)
            }
          }),
        },
      ],
    },
  }) satisfies BetterAuthPlugin
