/**
 * Tests for the admin's "Mark paid" (recordAffiliatePayoutAction): only an
 * admin who passed the second factor may record a payout (getAdminUser is
 * the gate), and what arrives is re-parsed before the ledger is touched.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const getAdminUser = vi.fn()
const recordAffiliatePayout = vi.fn()

vi.mock("@/lib/auth", () => ({ getAdminUser: () => getAdminUser(), getCurrentUser: async () => null }))
vi.mock("@/lib/affiliates-store", () => ({
  joinAffiliateProgram: vi.fn(),
  recordAffiliatePayout: (...a: unknown[]) => recordAffiliatePayout(...a),
}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

const { recordAffiliatePayoutAction } = await import("./affiliates")

beforeEach(() => {
  vi.clearAllMocks()
  recordAffiliatePayout.mockResolvedValue({ rows: 3, amount: 7_500 })
})

describe("recordAffiliatePayoutAction", () => {
  it("records nothing without an admin who passed 2FA", async () => {
    getAdminUser.mockResolvedValue(null)
    expect(await recordAffiliatePayoutAction("a1", "usd")).toEqual({ ok: false })
    getAdminUser.mockResolvedValue({ id: "u1", role: "USER" })
    expect(await recordAffiliatePayoutAction("a1", "usd")).toEqual({ ok: false })
    expect(recordAffiliatePayout).not.toHaveBeenCalled()
  })

  it("refuses input that is not an id and a currency code", async () => {
    getAdminUser.mockResolvedValue({ id: "u1", role: "ADMIN" })
    expect(await recordAffiliatePayoutAction("", "usd")).toEqual({ ok: false })
    expect(await recordAffiliatePayoutAction("a1", "USD; drop")).toEqual({ ok: false })
    expect(await recordAffiliatePayoutAction({ id: "a1" }, "usd")).toEqual({ ok: false })
    expect(recordAffiliatePayout).not.toHaveBeenCalled()
  })

  it("records the payout and reports what was marked", async () => {
    getAdminUser.mockResolvedValue({ id: "u1", role: "ADMIN" })
    expect(await recordAffiliatePayoutAction("a1", "usd")).toEqual({ ok: true, rows: 3, amount: 7_500 })
    expect(recordAffiliatePayout).toHaveBeenCalledWith("a1", "usd")
  })
})
