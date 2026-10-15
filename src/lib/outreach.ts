/**
 * Rules for the founder's outreach tracker (/admin/outreach): what a valid
 * entry is, when a conversation is due a follow-up, and the counts the page
 * shows above the list.
 *
 * Kept free of Prisma and zod on purpose: the client component imports the
 * channel and status lists and `needsFollowUp` from here, and neither library
 * belongs in a browser bundle for that. The server action runs the same
 * `parseOutreachInput` the form does, so the two cannot disagree.
 *
 * Dates are days, not moments: "YYYY-MM-DD" strings in the UI, midnight UTC
 * in the database (a `@db.Date` column). Comparing days as strings sidesteps
 * time zones entirely.
 */

export const OUTREACH_CHANNELS = ["LINKEDIN", "EMAIL", "REDDIT"] as const
export const OUTREACH_STATUSES = ["NO_REPLY", "REPLIED", "CONVERTED"] as const

export type OutreachChannel = (typeof OUTREACH_CHANNELS)[number]
export type OutreachStatus = (typeof OUTREACH_STATUSES)[number]

/** A conversation with no reply this many days after contact is due a nudge. */
export const FOLLOW_UP_AFTER_DAYS = 7

export const OUTREACH_LIMITS = { name: 120, company: 120, notes: 2000 } as const

/** One row as the page handles it, with the day as "YYYY-MM-DD". */
export type OutreachRow = {
  id: string
  name: string
  company: string | null
  channel: OutreachChannel
  contactedAt: string
  status: OutreachStatus
  notes: string | null
}

export type OutreachInput = Omit<OutreachRow, "id">

/** Error keys, rendered from `admin.outreach.errors` in the message file. */
export type OutreachError = "nameRequired" | "tooLong" | "invalidChannel" | "invalidStatus" | "invalidDate" | "futureDate"

const DAY = /^\d{4}-\d{2}-\d{2}$/

/** The UTC day of `date` as "YYYY-MM-DD". */
export function toDay(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/** "YYYY-MM-DD" as midnight UTC, or null when it is not a real calendar day. */
export function fromDay(day: string): Date | null {
  if (!DAY.test(day)) return null
  const date = new Date(`${day}T00:00:00.000Z`)
  // Rejects days that roll over, like 2026-02-30.
  return Number.isNaN(date.getTime()) || toDay(date) !== day ? null : date
}

/** Whole days from `from` to `to`, both "YYYY-MM-DD". */
export function daysBetween(from: string, to: string): number {
  const a = fromDay(from)
  const b = fromDay(to)
  if (!a || !b) return 0
  return Math.round((b.getTime() - a.getTime()) / 86_400_000)
}

/**
 * Validates and normalises what the form sends. `today` is the latest day
 * allowed; the caller passes one day past the server's UTC date, so someone
 * a few time zones ahead can still log a conversation from their today.
 */
export function parseOutreachInput(
  raw: Record<string, unknown>,
  today: string
): { ok: true; data: OutreachInput } | { ok: false; error: OutreachError } {
  const text = (v: unknown) => (typeof v === "string" ? v.trim() : "")
  const name = text(raw.name)
  const company = text(raw.company)
  const notes = text(raw.notes)
  const contactedAt = text(raw.contactedAt)

  if (!name) return { ok: false, error: "nameRequired" }
  if (name.length > OUTREACH_LIMITS.name || company.length > OUTREACH_LIMITS.company || notes.length > OUTREACH_LIMITS.notes) {
    return { ok: false, error: "tooLong" }
  }
  if (!OUTREACH_CHANNELS.includes(raw.channel as OutreachChannel)) return { ok: false, error: "invalidChannel" }
  if (!OUTREACH_STATUSES.includes(raw.status as OutreachStatus)) return { ok: false, error: "invalidStatus" }
  if (!fromDay(contactedAt)) return { ok: false, error: "invalidDate" }
  if (contactedAt > today) return { ok: false, error: "futureDate" }

  return {
    ok: true,
    data: {
      name,
      company: company || null,
      channel: raw.channel as OutreachChannel,
      contactedAt,
      status: raw.status as OutreachStatus,
      notes: notes || null,
    },
  }
}

/** Still no reply, and contacted at least FOLLOW_UP_AFTER_DAYS ago. */
export function needsFollowUp(row: Pick<OutreachRow, "status" | "contactedAt">, today: string): boolean {
  return row.status === "NO_REPLY" && daysBetween(row.contactedAt, today) >= FOLLOW_UP_AFTER_DAYS
}

export type OutreachSummary = Record<OutreachStatus, number> & { total: number; followUp: number }

/** The counts on the filter bar: per status, overall, and due a follow-up. */
export function summarizeOutreach(rows: Pick<OutreachRow, "status" | "contactedAt">[], today: string): OutreachSummary {
  const summary: OutreachSummary = { total: rows.length, followUp: 0, NO_REPLY: 0, REPLIED: 0, CONVERTED: 0 }
  for (const row of rows) {
    summary[row.status]++
    if (needsFollowUp(row, today)) summary.followUp++
  }
  return summary
}

export type OutreachFilter = "all" | "followUp" | OutreachStatus

/** Rows for a filter and a search over name, company and notes, newest contact first. */
export function filterOutreach<T extends OutreachRow>(rows: T[], filter: OutreachFilter, query: string, today: string): T[] {
  const q = query.trim().toLowerCase()
  return rows
    .filter((r) => (filter === "all" ? true : filter === "followUp" ? needsFollowUp(r, today) : r.status === filter))
    .filter((r) => !q || [r.name, r.company, r.notes].some((v) => v?.toLowerCase().includes(q)))
    .sort((a, b) => (a.contactedAt === b.contactedAt ? a.name.localeCompare(b.name) : a.contactedAt < b.contactedAt ? 1 : -1))
}
