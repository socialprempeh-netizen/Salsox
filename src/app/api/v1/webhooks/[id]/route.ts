/**
 * DELETE /api/v1/webhooks/{id}: an integration unsubscribing (a Zap turned
 * off). Only the key's own account's endpoints; anything else is a 404, so
 * the answer never says whether someone else's id exists.
 */
import { apiError, withScope } from "@/lib/api/v1"
import { deleteEndpoint } from "@/lib/webhooks/store"

export const dynamic = "force-dynamic"

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return withScope("webhooks:manage", request, async (caller) => {
    if (!(await deleteEndpoint(caller.userId, id))) return apiError(404, "not_found", "No webhook endpoint with that id on this account.")
    return new Response(null, { status: 204 })
  })
}
