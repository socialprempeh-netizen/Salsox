/**
 * The database side of finding documents through the public API (GET
 * /api/v1/documents and /api/v1/documents/{id}): one account's documents,
 * filtered the way an integration's "find" step asks (status, recipient,
 * title, creation date), newest first, a page at a time.
 *
 * Answers in the webhook payload's shape (documentResource in
 * src/lib/webhooks/payload.ts), so an integration maps a document it found
 * and a document a webhook delivered with the same fields.
 */
import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { siteConfig } from "@/config/site"
import { documentResource } from "@/lib/webhooks/payload"
import type { ListQuery } from "./documents"

const SELECT = {
  id: true,
  title: true,
  status: true,
  createdAt: true,
  sentAt: true,
  completedAt: true,
  pageCount: true,
  signingOrder: true,
  recipients: { select: { id: true, name: true, email: true, role: true, order: true, signingStatus: true, viewedAt: true, signedAt: true, rejectionReason: true } },
} satisfies Prisma.DocumentSelect

type Row = Prisma.DocumentGetPayload<{ select: typeof SELECT }>

const resource = (row: Row) => {
  const { document, recipients } = documentResource(row, siteConfig.url)
  return { ...document, recipients }
}

export type ApiDocument = ReturnType<typeof resource>

export async function listApiDocuments(userId: string, q: ListQuery): Promise<{ data: ApiDocument[]; nextCursor: string | null }> {
  const where: Prisma.DocumentWhereInput = {
    userId,
    ...(q.statuses ? { status: { in: q.statuses } } : {}),
    ...(q.recipient ? { recipients: { some: { email: { equals: q.recipient, mode: "insensitive" } } } } : {}),
    ...(q.title ? { title: { contains: q.title, mode: "insensitive" } } : {}),
    ...(q.createdAfter || q.createdBefore ? { createdAt: { ...(q.createdAfter ? { gte: q.createdAfter } : {}), ...(q.createdBefore ? { lt: q.createdBefore } : {}) } } : {}),
  }
  // A cursor from another account, or from a deleted draft, starts again at
  // the top rather than failing: Prisma would otherwise answer nothing.
  const cursor = q.cursor ? await prisma.document.findFirst({ where: { id: q.cursor, userId }, select: { id: true } }) : null
  const rows = await prisma.document.findMany({
    where,
    select: SELECT,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: q.limit + 1,
    ...(cursor ? { cursor: { id: cursor.id }, skip: 1 } : {}),
  })
  const page = rows.slice(0, q.limit)
  return { data: page.map(resource), nextCursor: rows.length > q.limit ? page[page.length - 1].id : null }
}

export async function getApiDocument(userId: string, id: string): Promise<ApiDocument | null> {
  const row = await prisma.document.findFirst({ where: { id, userId }, select: SELECT })
  return row ? resource(row) : null
}
