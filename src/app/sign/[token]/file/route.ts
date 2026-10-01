/**
 * The original PDF for a signer to view: GET /sign/{token}/file.
 *
 * Authorised by the signing token, and only while the document is live or
 * finished (`canViewOriginal` in src/lib/esign/rules.ts): a cancelled,
 * declined or expired document, or a link that has run out, returns 404 like
 * a token that never existed. Served with `no-store` and `private` so a
 * shared device or proxy never keeps a copy of someone's contract.
 */
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getFile } from "@/lib/esign/storage"
import { isPlausibleToken } from "@/lib/esign/tokens"
import { canViewOriginal } from "@/lib/esign/rules"

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!isPlausibleToken(token)) return new NextResponse(null, { status: 404 })
  const recipient = await prisma.recipient.findUnique({
    where: { token },
    select: { expiresAt: true, document: { select: { originalKey: true, status: true } } },
  })
  // Replaced: `recipient.document.status === "DRAFT"` was the only refusal, so
  // a cancelled, declined or expired document stayed readable through every
  // link that had been sent. The rule now lists what may be served instead.
  // if (!recipient || recipient.document.status === "DRAFT") return new NextResponse(null, { status: 404 })
  if (!recipient || !canViewOriginal(recipient.document.status, recipient, new Date())) {
    return new NextResponse(null, { status: 404 })
  }

  const bytes = await getFile(recipient.document.originalKey)
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": "inline",
      "Cache-Control": "private, no-store",
    },
  })
}
