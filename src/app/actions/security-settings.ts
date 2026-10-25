"use server"

/**
 * Saves one change to the organisation's sign-in policy, from the switches on
 * /admin/security. Admins only, through the same gate as the rest of the admin
 * area (2FA set up and passed on this session). The change is re-parsed here
 * whatever the page checked, then held to the policy's rules
 * (applySecurityPatch in src/lib/security-policy.ts), so the last method on
 * cannot be turned off, nor enforcement switched on with 2FA off.
 */
import { revalidatePath } from "next/cache"
import { getAdminUser } from "@/lib/auth"
import { applySecurityPatch, securityPatchSchema, type PatchError, type SecurityPolicy } from "@/lib/security-policy"
import { countPasskeyOnlyAdmins, getSecurityPolicy, saveSecurityPolicy } from "@/lib/security-settings"

export type SecuritySaveResult = { ok: true; policy: SecurityPolicy } | { ok: false; error: PatchError | "invalid" | "unauthorized" | "admins-passkey-only" }

export async function updateSecuritySettings(patch: unknown): Promise<SecuritySaveResult> {
  const admin = await getAdminUser()
  if (!admin) return { ok: false, error: "unauthorized" }
  const parsed = securityPatchSchema.safeParse(patch)
  if (!parsed.success || Object.keys(parsed.data).length === 0) return { ok: false, error: "invalid" }

  const result = applySecurityPatch(await getSecurityPolicy(), parsed.data)
  if (!result.ok) return result
  // Passkeys off stops passkey sign-in, so an admin whose only method is a
  // passkey would be shut out of the admin area, possibly the one clicking.
  // Refused until they add the authenticator app. (Turning the app off has no
  // such risk: codes already set up keep working at sign-in.)
  if (parsed.data.passkeyEnabled === false && (await countPasskeyOnlyAdmins()) > 0) return { ok: false, error: "admins-passkey-only" }
  await saveSecurityPolicy(result.policy, admin.email ?? admin.id)
  revalidatePath("/admin/security")
  return { ok: true, policy: result.policy }
}
