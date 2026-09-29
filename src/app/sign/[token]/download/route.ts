/**
 * The sealed (fully signed) PDF for a recipient: GET /sign/{token}/download.
 *
 * Every recipient keeps access to their signed copy through their own link:
 * they never need an account, or to ask the sender, to get it again.
 */
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getFile } from "@/lib/esign/storage"
import { isPlausibleToken } from "@/lib/esign/tokens"
import { contentDisposition } from "@/lib/esign/files"

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!isPlausibleToken(token)) return new NextResponse(null, { status: 404 })
  const recipient = await prisma.recipient.findUnique({
    where: { token },
    select: { document: { select: { title: true, status: true, sealedKey: true } } },
  })
  const document = recipient?.document
  if (!document || document.status !== "COMPLETED" || !document.sealedKey) return new NextResponse(null, { status: 404 })

  const bytes = await getFile(document.sealedKey)
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": contentDisposition(`${document.title} (signed).pdf`),
      "Cache-Control": "private, no-store",
    },
  })
}
