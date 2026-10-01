import { describe, it, expect } from "vitest"

import { DAILY_LIMITS } from "./sending-limits"
import { MODERATION, moderationSignals, rankFlagged, type SenderActivity } from "./moderation"

const now = new Date("2026-10-01T12:00:00Z")
const established = new Date("2026-06-01T00:00:00Z")
const quiet: SenderActivity = {
  accountCreatedAt: established,
  emailVerified: true,
  documentsLast24h: 1,
  documentsInWindow: 4,
  completedInWindow: 3,
  rejectedRecipients: 0,
  totalRecipients: 4,
  disputes: 0,
}
const kinds = (a: SenderActivity, confirm = true) => moderationSignals(a, now, confirm).map((s) => s.kind)

describe("moderationSignals", () => {
  it("flags nothing for an ordinary account", () => {
    expect(kinds(quiet)).toEqual([])
  })

  it("treats any dispute as high severity", () => {
    const [signal] = moderationSignals({ ...quiet, disputes: 1 }, now, true)
    expect(signal).toMatchObject({ kind: "disputes", severity: "high" })
  })

  it("flags a high rejection rate only once there are enough recipients", () => {
    expect(kinds({ ...quiet, rejectedRecipients: 2, totalRecipients: 4 })).not.toContain("highRejection")
    expect(kinds({ ...quiet, rejectedRecipients: 3, totalRecipients: 10 })).toContain("highRejection")
  })

  it("flags an account near its daily ceiling", () => {
    const ceiling = DAILY_LIMITS.ESTABLISHED.documents
    expect(kinds({ ...quiet, documentsLast24h: Math.ceil(ceiling * MODERATION.nearCeilingShare) })).toContain("nearDailyCeiling")
  })

  it("flags a burst from an account in its first week", () => {
    const fresh = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000)
    expect(kinds({ ...quiet, accountCreatedAt: fresh, documentsInWindow: MODERATION.newAccountDocuments })).toContain("newAccountBurst")
  })

  it("flags many documents that almost nobody completes", () => {
    expect(kinds({ ...quiet, documentsInWindow: 20, completedInWindow: 1 })).toContain("lowCompletion")
  })

  it("flags an unconfirmed sender only where confirmation is enforced", () => {
    expect(kinds({ ...quiet, emailVerified: false })).toContain("unconfirmedSender")
    expect(kinds({ ...quiet, emailVerified: false }, false)).not.toContain("unconfirmedSender")
  })
})

describe("rankFlagged", () => {
  it("drops clean accounts and puts high severity first", () => {
    const medium = { id: "m", signals: moderationSignals({ ...quiet, documentsInWindow: 20, completedInWindow: 0 }, now, true) }
    const high = { id: "h", signals: moderationSignals({ ...quiet, disputes: 2 }, now, true) }
    const clean = { id: "c", signals: [] }
    expect(rankFlagged([medium, clean, high]).map((a) => a.id)).toEqual(["h", "m"])
  })
})
