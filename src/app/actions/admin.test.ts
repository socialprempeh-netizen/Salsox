import { describe, expect, it, vi, beforeEach } from "vitest"

const session = vi.fn()
const updateMany = vi.fn()
const sessionRow = vi.fn()

// The library moved: what used to be `auth()` is `auth.api.getSession()`.
// Only the shape of the mock changes. Every assertion below is the one the
// 1.7 suite made, because the boundary still returns the same five fields.
vi.mock("@/auth", () => ({ auth: { api: { getSession: () => session() } } }))
vi.mock("next/headers", () => ({ headers: async () => new Headers() }))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { updateMany: (...args: unknown[]) => updateMany(...args) },
    // The admin gate's read: the session's second-factor mark and the
    // account's enrollment (src/lib/auth, src/lib/two-factor-policy.ts).
    session: { findUnique: (...args: unknown[]) => sessionRow(...args) },
  },
}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

const { setUserRole } = await import("./admin")

// An admin who is enrolled and whose session passed the code: the only kind
// the admin actions accept since 2FA became mandatory for admins.
const adminRow = (enrolled: boolean, verified: boolean) => ({
  twoFactorVerifiedAt: verified ? new Date() : null,
  user: { role: "ADMIN", twoFactorEnabled: enrolled, twoFactor: enrolled ? [{ verified: true }] : [] },
})
const asAdmin = (enrolled = true, verified = true) => {
  session.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" }, session: { id: "s-1" } })
  sessionRow.mockResolvedValue(adminRow(enrolled, verified))
}

beforeEach(() => {
  session.mockReset()
  sessionRow.mockReset()
  updateMany.mockReset()
  updateMany.mockResolvedValue({ count: 1 })
})

describe("setUserRole", () => {
  it("refuses a caller who is not signed in", async () => {
    session.mockResolvedValue(null)
    await expect(setUserRole("u1", "ADMIN", "USER")).rejects.toThrow("Unauthorized")
    expect(updateMany).not.toHaveBeenCalled()
  })

  it("refuses a signed-in caller who is not an admin", async () => {
    session.mockResolvedValue({ user: { id: "u2", role: "USER" } })
    await expect(setUserRole("u1", "ADMIN", "USER")).rejects.toThrow("Unauthorized")
    expect(updateMany).not.toHaveBeenCalled()
  })

  it("refuses an admin who has not set up 2FA", async () => {
    asAdmin(false, false)
    await expect(setUserRole("u1", "ADMIN", "USER")).rejects.toThrow("Unauthorized")
    expect(updateMany).not.toHaveBeenCalled()
  })

  it("refuses an admin whose session never passed the code", async () => {
    asAdmin(true, false)
    await expect(setUserRole("u1", "ADMIN", "USER")).rejects.toThrow("Unauthorized")
    expect(updateMany).not.toHaveBeenCalled()
  })

  it("promotes when the row still holds the role the admin was looking at", async () => {
    asAdmin()
    await expect(setUserRole("u1", "ADMIN", "USER")).resolves.toEqual({ role: "ADMIN" })
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "u1", role: "USER" },
      data: { role: "ADMIN" },
    })
  })

  /**
   * The defect this replaced: the action used to read the current role and
   * flip it. A page rendered before someone else promoted the same user still
   * showed "Make Admin", and clicking it demoted them, with a toast that said
   * "User promoted to USER".
   */
  it("refuses instead of demoting when the role moved under a stale page", async () => {
    asAdmin()
    updateMany.mockResolvedValue({ count: 0 })
    await expect(setUserRole("u1", "ADMIN", "USER")).rejects.toThrow(/changed since/)
  })

  it("refuses a request that would not change anything", async () => {
    asAdmin()
    await expect(setUserRole("u1", "ADMIN", "ADMIN")).rejects.toThrow(/already set/)
    expect(updateMany).not.toHaveBeenCalled()
  })

  it("never writes a role the caller did not ask for", async () => {
    // The role written comes from the argument, never from what the row holds:
    // that is the whole difference from the toggle this replaced.
    asAdmin()
    await setUserRole("u1", "USER", "ADMIN")
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "u1", role: "ADMIN" },
      data: { role: "USER" },
    })
  })
})
