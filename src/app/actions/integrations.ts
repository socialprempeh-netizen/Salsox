"use server"

/**
 * "Disconnect" for HubSpot and Salesforce on the Developers page: the
 * refresh token is revoked at the provider, then the connection is
 * forgotten (src/lib/integrations). Connecting is a link, not an action:
 * /api/integrations/{provider}/connect.
 */
import { revalidatePath } from "next/cache"
import { getCurrentUser } from "@/lib/auth"
import { disconnectHubSpot } from "@/lib/integrations/hubspot-store"
import { disconnectSalesforce } from "@/lib/integrations/salesforce-store"

export async function disconnectIntegrationAction(provider: unknown): Promise<{ ok: boolean }> {
  const user = await getCurrentUser()
  if (!user) return { ok: false }
  const ok = provider === "hubspot" ? await disconnectHubSpot(user.id) : provider === "salesforce" ? await disconnectSalesforce(user.id) : false
  revalidatePath("/dashboard/developers")
  return { ok }
}
