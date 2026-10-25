/**
 * Tests for recordAudit's webhook rule (audit.ts): an event recorded with the
 * app's own client is final and its webhook is queued at once; one recorded
 * inside a transaction is not, because it could roll back and the caller
 * queues it after the commit. Prisma 7's transaction client has a
 * `$transaction` method too, which is what once made a signature's
 * document.signed webhook go out twice.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const create = vi.fn()
const queueWebhookEvent = vi.fn()
const prisma = { $transaction: vi.fn(), auditEvent: { create: (...a: unknown[]) => create(...a) } }

vi.mock("next/headers", () => ({ headers: async () => new Headers() }))
vi.mock("@/lib/prisma", () => ({ prisma }))
vi.mock("@/lib/webhooks/store", () => ({ queueWebhookEvent: (...a: unknown[]) => queueWebhookEvent(...a) }))

const { AUDIT, recordAudit } = await import("./audit")
type Db = Parameters<typeof recordAudit>[0]

beforeEach(() => vi.clearAllMocks())

describe("recordAudit and webhooks", () => {
  it("queues the webhook for an event recorded with the app's client", async () => {
    await recordAudit(prisma as unknown as Db, { documentId: "d1", type: AUDIT.SENT })
    expect(create).toHaveBeenCalledOnce()
    expect(queueWebhookEvent).toHaveBeenCalledWith({ documentId: "d1", auditType: AUDIT.SENT, recipientId: undefined })
  })

  it("does not queue inside a transaction, even though the transaction client has $transaction", async () => {
    const tx = { $transaction: vi.fn(), auditEvent: { create: (...a: unknown[]) => create(...a) } }
    await recordAudit(tx as unknown as Db, { documentId: "d1", recipientId: "r1", type: AUDIT.RECIPIENT_SIGNED })
    expect(create).toHaveBeenCalledOnce()
    expect(queueWebhookEvent).not.toHaveBeenCalled()
  })

  it("queues nothing for an event that is not sent out", async () => {
    await recordAudit(prisma as unknown as Db, { documentId: "d1", type: AUDIT.FIELD_SIGNED })
    expect(queueWebhookEvent).not.toHaveBeenCalled()
  })
})
