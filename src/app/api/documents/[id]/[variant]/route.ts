/**
 * Owner access to a document's files:
 *   GET /api/documents/{id}/original  – the uploaded PDF (viewer and editor)
 *   GET /api/documents/{id}/signed    – the sealed PDF with its certificate
 *
 * Available on every plan and after cancellation: your documents are yours,
 * and downloading them is never a paid feature.
 */
import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getFile } from "@/lib/esign/storage"
import { contentDisposition } from "@/lib/esign/files"

export async function GET(req: Request, { params }: { params: Promise<{ id: string; variant: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id, variant } = await params
  if (variant !== "original" && variant !== "signed") return new NextResponse(null, { status: 404 })

  const document = await prisma.document.findFirst({
    where: { id, userId: user.id },
    select: { title: true, originalKey: true, sealedKey: true },
  })
  const key = variant === "signed" ? document?.sealedKey : document?.originalKey
  if (!document || !key) return new NextResponse(null, { status: 404 })

  const inline = new URL(req.url).searchParams.get("inline") === "1"
  const bytes = await getFile(key)
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": contentDisposition(
        variant === "signed" ? `${document.title} (signed).pdf` : `${document.title}.pdf`,
        inline ? "inline" : "attachment"
      ),
      "Cache-Control": "private, no-store",
    },
  })
}
