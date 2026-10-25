import { cache } from "react"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import type { Role } from "@prisma/client"

import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { adminAccess, isTwoFactorEnrolled, type AdminAccess } from "@/lib/two-factor-policy"

/**
 * The boundary between this application and whatever library handles
 * authentication.
 *
 * Everything outside `src/auth.ts`, the sign-in flow and the route handler asks
 * these functions rather than the library directly. The point is the release
 * after this one: 2.0 moves authentication to a different library, and a
 * codebase that reads the session in twenty pages has twenty places to change,
 * each with its own chance of being missed. With the boundary in place that
 * migration edits this file.
 *
 * It exists now, working on the current library, so the version that adopts the
 * new one changes as little as possible and the guide for it can be written and
 * tested before anyone needs it.
 *
 * The shape returned here is deliberately small: id, email, name, image, role.
 * Anything a specific library adds on top stays behind this line, or it becomes
 * a dependency that has to be reproduced later.
 */
export type CurrentUser = {
  id: string
  role: Role
  email?: string | null
  name?: string | null
  image?: string | null
}

/**
 * The signed-in user, or null. Never throws and never redirects.
 *
 * Read once per request: a dashboard render asks in its layout and again in
 * its page (and sometimes in a component), and once the session cookie cache
 * (60 seconds, src/auth.ts) has expired each ask was its own database round
 * trip. React's `cache` keeps the answer for the rest of that one server
 * render, and only for it; outside a render (route handlers, tests) it simply
 * calls through. Was the same function without the wrapper.
 */
// The library's session, read once per render; getCurrentUser and the admin
// gate below both start from it.
const readSession = cache(async () => auth.api.getSession({ headers: await headers() }))

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await readSession()
  if (!session?.user?.id) return null

  const { id, role, email, name, image } = session.user
  return { id, role: (role ?? "USER") as Role, email, name, image }
})

/**
 * The signed-in user, or a redirect to the sign-in page.
 *
 * For a page or an action that has no meaning without an account: reading the
 * session and redirecting on a miss was repeated at the top of nearly every one
 * of them, and repeated code is where a check eventually goes missing.
 */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser()
  if (!user) redirect("/login")
  return user
}

/** True when someone is signed in. For a branch that needs nothing else. */
export async function isSignedIn(): Promise<boolean> {
  return (await getCurrentUser()) !== null
}

/**
 * Whether the signed-in user may use the admin area right now: "ok",
 * "enroll" (an admin without 2FA), "verify" (an enrolled admin on a session
 * that never passed the code) or "not-admin" (including signed out). The
 * rules are in two-factor-policy.ts.
 *
 * Read from the database, not the session cookie: the cookie cache (60
 * seconds) would otherwise hide a verification made a moment ago and send
 * the admin straight back to the check they just passed.
 */
export const getAdminAccess = cache(async (): Promise<AdminAccess> => {
  const session = await readSession()
  if (!session?.session?.id) return "not-admin"
  const row = await prisma.session.findUnique({
    where: { id: session.session.id },
    select: { twoFactorVerifiedAt: true, user: { select: { role: true, twoFactorEnabled: true, twoFactor: { select: { verified: true } } } } },
  })
  if (!row) return "not-admin"
  return adminAccess({ role: row.user.role, enrolled: isTwoFactorEnrolled(row.user), sessionVerified: row.twoFactorVerifiedAt !== null })
})

/**
 * The signed-in admin, or null for anyone who may not use the admin area yet.
 * For server actions and API routes, which answer "unauthorized" rather than
 * redirect; the admin layout sends people to the step they are missing.
 */
export async function getAdminUser(): Promise<CurrentUser | null> {
  if ((await getAdminAccess()) !== "ok") return null
  return getCurrentUser()
}

/**
 * Records that the session with this token just passed a second factor.
 * Called with the token Better Auth returns from a successful verification.
 * Never throws: the sign-in itself has succeeded, and a mark that failed to
 * save costs an admin one extra code at the admin check, nothing more.
 */
export async function markSessionTwoFactorVerified(token: string | null | undefined): Promise<void> {
  if (!token) return
  try {
    await prisma.session.updateMany({ where: { token }, data: { twoFactorVerifiedAt: new Date() } })
  } catch (error) {
    console.warn("[auth] could not record the second factor on the session", error)
  }
}
