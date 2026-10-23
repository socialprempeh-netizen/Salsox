/**
 * The month grid behind the social studio's calendar
 * (src/components/admin/social-studio.tsx): which days a month view shows,
 * and the local-day key posts are grouped by. Pure, so the edge cases (a
 * month starting on a Sunday, February, the year boundary) are tested
 * (calendar.test.ts) rather than found on screen.
 *
 * Weeks start on Monday. The grid is whole weeks, from the Monday on or
 * before the 1st to the Sunday on or after the last day, so it is four to
 * six rows, never padded to a fixed six.
 */

export type CalendarDay = { key: string; date: Date; inMonth: boolean }

/** "YYYY-MM-DD" for a date's local calendar day. */
export function dayKey(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Every day the month view of `year`/`month` (0-11) shows, Monday first, in whole weeks. */
export function monthGrid(year: number, month: number): CalendarDay[] {
  const first = new Date(year, month, 1)
  const last = new Date(year, month + 1, 0)
  // getDay(): Sunday 0 … Saturday 6; Monday-first offset.
  const lead = (first.getDay() + 6) % 7
  const trail = 6 - ((last.getDay() + 6) % 7)
  const days: CalendarDay[] = []
  for (let offset = -lead; offset < last.getDate() + trail; offset++) {
    const date = new Date(year, month, 1 + offset)
    days.push({ key: dayKey(date), date, inMonth: date.getMonth() === month })
  }
  return days
}

/** The month after (+1) or before (-1) a year and month, across year boundaries. */
export function shiftMonth({ year, month }: { year: number; month: number }, by: number): { year: number; month: number } {
  const date = new Date(year, month + by, 1)
  return { year: date.getFullYear(), month: date.getMonth() }
}
