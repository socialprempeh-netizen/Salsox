/**
 * Affiliate payouts against a real database (affiliates-store.ts): the queue
 * lists only cleared, unpaid, unreversed commission, marked due or under the
 * minimum; recording a payout marks exactly those rows, and two presses at
 * once record it once. The dashboard splits the same rows into pending,
 * cleared and paid out.
 *
 * Only when asked: `ESIGN_DB_TESTS=1 npx vitest run src/lib/affiliates-payouts.db.test.ts`.
 * Every row hangs off one user, deleted at the end.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { randomUUID } from "node:crypto"
import { config } from "dotenv"

const enabled = process.env.ESIGN_DB_TESTS === "1"

describe.skipIf(!enabled)("affiliate payouts (database)", () => {
  let prisma: typeof import("@/lib/prisma").prisma
  let store: typeof import("./affiliates-store")
  let userId: string
  let affiliateId: string
  const now = new Date("2026-11-20T12:00:00Z")
  const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000)

  beforeAll(async () => {
    config({ path: ".env.local" })
    config({ path: ".env" })
    prisma = (await import("@/lib/prisma")).prisma
    store = await import("./affiliates-store")
    const user = await prisma.user.create({ data: { name: "Aff Test", email: `aff-${randomUUID()}@example.com` } })
    userId = user.id
    const affiliate = await prisma.affiliate.create({ data: { userId, code: `t-${randomUUID().slice(0, 8)}` } })
    affiliateId = affiliate.id
    const row = (n: number, commission: number, paidAt: Date, extra: object = {}) => ({ affiliateId, sourceId: `src-${randomUUID()}-${n}`, amount: commission * 4, commission, currency: "usd", percent: 25, paidAt, ...extra })
    await prisma.affiliateCommission.createMany({
      data: [
        row(1, 3_000, daysAgo(45)), // cleared
        row(2, 2_500, daysAgo(31)), // cleared
        row(3, 1_000, daysAgo(10)), // pending: inside the hold
        row(4, 9_000, daysAgo(60), { reversedAt: daysAgo(50) }), // refunded: never owed
        row(5, 4_000, daysAgo(90), { paidOutAt: daysAgo(70) }), // paid already
      ],
    })
  })

  afterAll(async () => {
    await prisma.user.delete({ where: { id: userId } })
  })

  it("queues only cleared, unpaid commission, and splits the dashboard by the hold", async () => {
    const queue = (await store.affiliatePayoutQueue(now)).filter((r) => r.affiliateId === affiliateId)
    expect(queue).toEqual([expect.objectContaining({ currency: "usd", cleared: 5_500, rows: 2, due: true })])
    const dashboard = await store.affiliateDashboard(userId, now)
    expect(dashboard?.earnings).toEqual([{ currency: "usd", earned: 10_500, pending: 1_000, cleared: 5_500, paidOut: 4_000, due: true }])
  })

  it("records a payout of exactly the cleared rows, once, however often it is pressed", async () => {
    const results = await Promise.all([1, 2].map(() => store.recordAffiliatePayout(affiliateId, "usd", now)))
    const recorded = results.filter((r) => r.rows > 0)
    expect(recorded).toEqual([{ rows: 2, amount: 5_500 }])
    expect((await store.affiliatePayoutQueue(now)).filter((r) => r.affiliateId === affiliateId)).toEqual([])
    const dashboard = await store.affiliateDashboard(userId, now)
    expect(dashboard?.earnings[0]).toMatchObject({ pending: 1_000, cleared: 0, paidOut: 9_500, due: false })
  })
})
