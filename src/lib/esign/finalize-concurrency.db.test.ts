/**
 * Races the signing engine against a real database.
 *
 * The unit tests mock Prisma, which can say what the code decides but not
 * what two requests do to the same rows at the same moment. These run the
 * real functions concurrently against PostgreSQL and check what ends up
 * stored:
 *
 * - two simultaneous finalizations of one document commit one COMPLETED
 *   event and one sealed copy, and the stored file is the one whose
 *   fingerprint is recorded;
 * - a document left PENDING with every signer done (a failure
 *   mid-finalization) is found and finished by the recovery sweep;
 * - two signers of the same sequential group completing together send the
 *   next signer one "your turn" email, not two.
 *
 * They need a migrated database and write rows to it, so they only run when
 * asked: `ESIGN_DB_TESTS=1 npx vitest run src/lib/esign/finalize-concurrency.db.test.ts`
 * against the local database (see README). Every row they create is deleted
 * at the end, with the user it hangs off.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { randomUUID } from "node:crypto"
import { config } from "dotenv"
import { PDFDocument } from "pdf-lib"

const enabled = process.env.ESIGN_DB_TESTS === "1"

// The two sends are replaced: they read translations through next-intl,
// which only works inside Next, and counting them is the point. The invite
// answers "sent" after a pause, which widens the race the claim has to win.
// Everything else is the real module.
const invites = vi.hoisted(() => ({ sent: [] as string[], completed: [] as string[] }))
vi.mock("./emails", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./emails")>()),
  sendSigningInvite: async (args: { to: string }) => {
    await new Promise((resolve) => setTimeout(resolve, 150))
    invites.sent.push(args.to)
    return "sent" as const
  },
  sendDocumentCompleted: async (args: { to: string }) => {
    invites.completed.push(args.to)
    return "sent" as const
  },
}))

describe.skipIf(!enabled)("signing engine under concurrency (database)", () => {
  type Modules = {
    prisma: typeof import("@/lib/prisma").prisma
    documents: typeof import("./documents")
    signing: typeof import("./signing")
    storage: typeof import("./storage")
  }
  let m: Modules
  let userId: string
  let ownerEmail: string

  beforeAll(async () => {
    config({ path: ".env.local" })
    config({ path: ".env" })
    delete process.env.BLOB_READ_WRITE_TOKEN // files go to the local disk driver
    m = {
      prisma: (await import("@/lib/prisma")).prisma,
      documents: await import("./documents"),
      signing: await import("./signing"),
      storage: await import("./storage"),
    }
    const user = await m.prisma.user.create({
      data: { name: "Race Test", email: `race-${randomUUID()}@example.com`, emailVerified: true },
    })
    userId = user.id
    ownerEmail = user.email
  })

  afterAll(async () => {
    if (!m) return
    await m.prisma.document.deleteMany({ where: { userId } })
    await m.prisma.user.delete({ where: { id: userId } })
    await m.storage.deleteFolder(m.storage.userFolder(userId)).catch(() => {})
    await m.prisma.$disconnect()
  })

  /** A pending document with its original stored, and the given recipients. */
  async function pendingDocument(
    recipients: { email: string; order?: number; signed?: boolean; signedAgoMs?: number }[],
    signingOrder: "PARALLEL" | "SEQUENTIAL" = "PARALLEL"
  ) {
    const pdf = await PDFDocument.create()
    pdf.addPage([595, 842])
    const bytes = await pdf.save()
    const folder = randomUUID()
    const originalKey = m.storage.documentKey(userId, folder, "original")
    await m.storage.putFile(originalKey, bytes)
    const now = Date.now()
    return m.prisma.document.create({
      data: {
        userId,
        title: "Race",
        status: "PENDING",
        signingOrder,
        originalKey,
        originalSha256: m.storage.sha256(bytes),
        pageCount: 1,
        sentAt: new Date(now),
        recipients: {
          create: recipients.map((r) => ({
            email: r.email,
            name: r.email,
            order: r.order ?? 0,
            token: randomUUID().replace(/-/g, ""),
            signingStatus: r.signed ? "SIGNED" : "NOT_SIGNED",
            signedAt: r.signed ? new Date(now - (r.signedAgoMs ?? 0)) : null,
            sentAt: r.order ? null : new Date(now),
          })),
        },
        auditEvents: { create: [{ type: "DOCUMENT_SENT" }] },
      },
      include: { recipients: true },
    })
  }

  it("commits one seal, one COMPLETED event and a matching fingerprint when two finalizations race", async () => {
    const doc = await pendingDocument([{ email: "a@example.com", signed: true }, { email: "b@example.com", signed: true }])
    invites.completed.length = 0

    await Promise.all([m.documents.finalizeDocument(doc.id), m.documents.finalizeDocument(doc.id)])

    const after = await m.prisma.document.findUniqueOrThrow({ where: { id: doc.id }, include: { auditEvents: true } })
    expect(after.status).toBe("COMPLETED")
    expect(after.auditEvents.filter((e) => e.type === "DOCUMENT_COMPLETED")).toHaveLength(1)
    expect(after.sealedKey).toBeTruthy()
    const stored = await m.storage.getFile(after.sealedKey!)
    expect(m.storage.sha256(stored)).toBe(after.sealedSha256)
    // The loser's upload was removed: only the original and one seal remain.
    const folder = m.storage.documentKey(userId, doc.originalKey.split("/")[2], "original").replace(/original\.pdf$/, "")
    const { readdir } = await import("node:fs/promises")
    const path = await import("node:path")
    const files = await readdir(path.join(process.cwd(), ".data", "storage", folder))
    expect(files.filter((f) => f.startsWith("sealed-"))).toHaveLength(1)
    // Only the run that committed sends the signed copy: owner and both signers, once each.
    expect([...invites.completed].sort()).toEqual(["a@example.com", "b@example.com", ownerEmail].sort())
  })

  it("finishes a document left pending after a failure mid-finalization", async () => {
    // Every signer done, nothing committed, long enough ago to count as stuck.
    const doc = await pendingDocument([{ email: "c@example.com", signed: true, signedAgoMs: 60 * 60 * 1000 }])
    const fresh = await pendingDocument([{ email: "d@example.com", signed: true, signedAgoMs: 1000 }])

    await m.documents.recoverStuckFinalizations()

    const stuck = await m.prisma.document.findUniqueOrThrow({ where: { id: doc.id } })
    expect(stuck.status).toBe("COMPLETED")
    expect(stuck.sealedKey).toBeTruthy()
    // One still inside the grace period may be mid-finalization: left alone.
    const live = await m.prisma.document.findUniqueOrThrow({ where: { id: fresh.id } })
    expect(live.status).toBe("PENDING")
  })

  it("emails the next sequential signer once when two of the group before finish together", async () => {
    const doc = await pendingDocument(
      [
        { email: "first-a@example.com", order: 0 },
        { email: "first-b@example.com", order: 0 },
        { email: "next@example.com", order: 1 },
      ],
      "SEQUENTIAL"
    )
    const token = (email: string) => doc.recipients.find((r) => r.email === email)!.token
    invites.sent.length = 0

    // Both signatures land before either request reads the group, which is
    // the interleaving that used to email "next" twice.
    const [a, b] = await Promise.all([
      m.signing.completeSigning(token("first-a@example.com")),
      m.signing.completeSigning(token("first-b@example.com")),
    ])

    expect(a.ok && b.ok).toBe(true)
    expect(invites.sent.filter((to) => to === "next@example.com")).toHaveLength(1)
    const next = await m.prisma.recipient.findFirstOrThrow({ where: { documentId: doc.id, email: "next@example.com" } })
    expect(next.sentAt).not.toBeNull()
  })
})
