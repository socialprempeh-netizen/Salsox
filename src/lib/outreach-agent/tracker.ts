/**
 * The note an "Add to Customers" row carries in a contact tracker: where the
 * lead came from, what they complained about, how to reach them and what
 * they replied, in one paragraph that fits the tracker's note limit. Pure, so
 * any host's adapter can use it and the trimming is tested.
 */
import type { TrackerEntry } from "./agent"
import { sourceName } from "./prompt"

export function trackerNote(entry: TrackerEntry, maxLength: number): string {
  const parts = [
    `From the outreach agent: a ${entry.competitor} complaint on ${sourceName(entry.source)}.`,
    entry.email ? `Email: ${entry.email}.` : null,
    entry.replySummary ? `Their reply: ${entry.replySummary}` : null,
  ].filter(Boolean) as string[]
  const fixed = parts.join(" ")
  // The quote fills whatever room is left, shortened with an ellipsis if it must be.
  const room = maxLength - fixed.length - ' They wrote: "".'.length - 1
  if (room < 20) return fixed.slice(0, maxLength)
  const quote = entry.quote.length > room ? `${entry.quote.slice(0, room - 1).trimEnd()}…` : entry.quote
  return `${parts[0]} They wrote: "${quote}". ${parts.slice(1).join(" ")}`.trim()
}
