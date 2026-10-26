/**
 * GET /api/v1/documents/{id}: one document of the key's account, in the same
 * shape the list and the webhooks use. Integrations call it to check a
 * document's status after sending it, or to fetch the latest state of one a
 * webhook named. Another account's id is a 404, like an unknown one.
 */
import { NextResponse } from "next/server"
import { apiError, withScope } from "@/lib/api/v1"
import { getApiDocument } from "@/lib/api/documents-store"

export const dynamic = "force-dynamic"

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return withScope("documents:read", request, async (caller) => {
    const document = await getApiDocument(caller.userId, id)
    if (!document) return apiError(404, "not_found", "No document with that id on this account.")
    return NextResponse.json(document)
  })
}
