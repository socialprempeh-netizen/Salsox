/**
 * The original PDF for a signer to view: GET /sign/{token}/file.
 *
 * Authorised by the signing token. Served with `no-store` and `private` so a
 * shared device or proxy never keeps a copy of someone's contract.
 */
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getFile } from "@/lib/esign/storage"
import { isPlausibleToken } from "@/lib/esign/tokens"

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!isPlausibleToken(token)) return new NextResponse(null, { status: 404 })
  const recipient = await prisma.recipient.findUnique({
    where: { token },
    select: { document: { select: { originalKey: true, status: true } } },
  })
  // A draft has not been sent, so no signer should be able to read it.
  if (!recipient || recipient.document.status === "DRAFT") return new NextResponse(null, { status: 404 })

  const bytes = await getFile(recipient.document.originalKey)
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": "inline",
      "Cache-Control": "private, no-store",
    },
  })
}
