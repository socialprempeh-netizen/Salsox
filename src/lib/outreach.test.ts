/**
 * Tests for the outreach tracker rules (outreach.ts): what the form may save,
 * when a silent conversation is due a follow-up, and how the list is counted,
 * filtered and ordered.
 */
import { describe, expect, it } from "vitest"
import {
  daysBetween,
  filterOutreach,
  fromDay,
  needsFollowUp,
  parseOutreachInput,
  summarizeOutreach,
  type OutreachRow,
} from "./outreach"

const TODAY = "2026-10-15"

const valid = { name: "Ama Mensah", company: "Mensah Realty", channel: "LINKEDIN", contactedAt: "2026-10-01", status: "NO_REPLY", notes: "" }

const row = (over: Partial<OutreachRow>): OutreachRow => ({
  id: Math.random().toString(36),
  name: "Someone",
  company: null,
  channel: "EMAIL",
  contactedAt: "2026-10-10",
  status: "NO_REPLY",
  notes: null,
  ...over,
})

describe("fromDay", () => {
  it("reads a calendar day as midnight UTC", () => {
    expect(fromDay("2026-10-15")?.toISOString()).toBe("2026-10-15T00:00:00.000Z")
  })

  it("rejects days that do not exist and other shapes", () => {
    expect(fromDay("2026-02-30")).toBeNull()
    expect(fromDay("15/10/2026")).toBeNull()
    expect(fromDay("")).toBeNull()
  })
})

describe("parseOutreachInput", () => {
  it("trims, and stores empty optional fields as null", () => {
    const result = parseOutreachInput({ ...valid, name: "  Ama Mensah ", company: " ", notes: "  " }, TODAY)
    expect(result).toEqual({ ok: true, data: { ...valid, company: null, notes: null } })
  })

  it("requires a name", () => {
    expect(parseOutreachInput({ ...valid, name: "   " }, TODAY)).toEqual({ ok: false, error: "nameRequired" })
  })

  it("only accepts the known channels and statuses", () => {
    expect(parseOutreachInput({ ...valid, channel: "TWITTER" }, TODAY)).toEqual({ ok: false, error: "invalidChannel" })
    expect(parseOutreachInput({ ...valid, status: "MAYBE" }, TODAY)).toEqual({ ok: false, error: "invalidStatus" })
  })

  it("rejects a malformed or future contact day, and accepts today", () => {
    expect(parseOutreachInput({ ...valid, contactedAt: "yesterday" }, TODAY)).toEqual({ ok: false, error: "invalidDate" })
    expect(parseOutreachInput({ ...valid, contactedAt: "2026-10-16" }, TODAY)).toEqual({ ok: false, error: "futureDate" })
    expect(parseOutreachInput({ ...valid, contactedAt: TODAY }, TODAY).ok).toBe(true)
  })

  it("caps the length of every text field", () => {
    expect(parseOutreachInput({ ...valid, notes: "x".repeat(2001) }, TODAY)).toEqual({ ok: false, error: "tooLong" })
  })
})

describe("follow-ups", () => {
  it("counts whole days between two days", () => {
    expect(daysBetween("2026-10-08", TODAY)).toBe(7)
  })

  it("flags a conversation with no reply after seven days, and nothing else", () => {
    expect(needsFollowUp({ status: "NO_REPLY", contactedAt: "2026-10-08" }, TODAY)).toBe(true)
    expect(needsFollowUp({ status: "NO_REPLY", contactedAt: "2026-10-09" }, TODAY)).toBe(false)
    expect(needsFollowUp({ status: "REPLIED", contactedAt: "2026-09-01" }, TODAY)).toBe(false)
  })

  it("summarizes per status, overall and due a follow-up", () => {
    const rows = [
      row({ status: "NO_REPLY", contactedAt: "2026-09-30" }),
      row({ status: "NO_REPLY", contactedAt: "2026-10-14" }),
      row({ status: "REPLIED" }),
      row({ status: "CONVERTED" }),
    ]
    expect(summarizeOutreach(rows, TODAY)).toEqual({ total: 4, followUp: 1, NO_REPLY: 2, REPLIED: 1, CONVERTED: 1 })
  })
})

describe("filterOutreach", () => {
  const rows = [
    row({ name: "Kofi", company: "Accra Clinics", contactedAt: "2026-09-30" }),
    row({ name: "Efua", notes: "asked about WhatsApp sending", status: "REPLIED", contactedAt: "2026-10-12" }),
    row({ name: "Yaw", status: "CONVERTED", contactedAt: "2026-10-14" }),
  ]

  it("sorts newest contact first", () => {
    expect(filterOutreach(rows, "all", "", TODAY).map((r) => r.name)).toEqual(["Yaw", "Efua", "Kofi"])
  })

  it("filters by status and by follow-up due", () => {
    expect(filterOutreach(rows, "REPLIED", "", TODAY).map((r) => r.name)).toEqual(["Efua"])
    expect(filterOutreach(rows, "followUp", "", TODAY).map((r) => r.name)).toEqual(["Kofi"])
  })

  it("searches name, company and notes, ignoring case", () => {
    expect(filterOutreach(rows, "all", "clinics", TODAY).map((r) => r.name)).toEqual(["Kofi"])
    expect(filterOutreach(rows, "all", "WHATSAPP", TODAY).map((r) => r.name)).toEqual(["Efua"])
  })
})
