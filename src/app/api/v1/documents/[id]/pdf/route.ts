/**
 * GET /api/v1/documents/{id}/pdf: a document's PDF, for integrations that
 * file it elsewhere (Zapier's "save to Google Drive", HubSpot and Salesforce
 * attaching the signed copy to a record).
 *
 * The signed PDF (with its certificate) once the document is completed, the
 * original until then; `?version=signed` or `?version=original` to insist
 * (pickPdfVersion, src/lib/api/documents.ts). Which one was served is in the
 * `X-Document-Version` header. Scoped to the key's account: another
 * account's id is a 404, like an unknown one. Downloading is never a paid
 * feature, as on the dashboard (src/app/api/documents/[id]/[variant]).
 */
import { NextResponse } from "next/server"
import { apiError, withScope } from "@/lib/api/v1"
import { pickPdfVersion } from "@/lib/api/documents"
import { prisma } from "@/lib/prisma"
import { getFile } from "@/lib/esign/storage"
import { contentDisposition } from "@/lib/esign/files"

export const dynamic = "force-dynamic"

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return withScope("documents:read", request, async (caller) => {
    const document = await prisma.document.findFirst({
      where: { id, userId: caller.userId },
      select: { title: true, originalKey: true, sealedKey: true },
    })
    if (!document) return apiError(404, "not_found", "No document with that id on this account.")

    const picked = pickPdfVersion(new URL(request.url).searchParams.get("version"), document)
    if (!picked.ok) return apiError(picked.status, picked.problem.code, picked.problem.message)

    const bytes = await getFile(picked.key)
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": contentDisposition(picked.version === "signed" ? `${document.title} (signed).pdf` : `${document.title}.pdf`, "attachment"),
        "X-Document-Version": picked.version,
        "Cache-Control": "private, no-store",
      },
    })
  })
}
