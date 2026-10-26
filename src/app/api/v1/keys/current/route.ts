/**
 * DELETE /api/v1/keys/current: revokes the key the request is made with.
 * "Disconnect" in the Salsox Signing extension calls it, so signing out of
 * the extension also ends the key it was given, instead of leaving it live
 * on the Developers page. Only ever the caller's own key: there is nothing
 * to name, so nothing else can be reached through it. Called with an OAuth
 * access token instead, it ends that token's connection (its grant).
 */
import { withApiKey } from "@/lib/api/v1"
import { revokeApiKey } from "@/lib/api-keys-store"
import { revokeGrant } from "@/lib/oauth-server/store"

export const dynamic = "force-dynamic"

export async function DELETE(request: Request) {
  return withApiKey(request, async (caller) => {
    if (caller.grantId) await revokeGrant(caller.userId, caller.grantId)
    else await revokeApiKey(caller.userId, caller.keyId)
    return new Response(null, { status: 204 })
  })
}
