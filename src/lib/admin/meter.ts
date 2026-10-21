/**
 * How many squares of a segmented meter to fill for a rate, so the meter on
 * a stat tile, a funnel step and the SEO agent's publishing progress all
 * round the same way (src/components/admin/segment-meter.tsx draws them).
 *
 * Kept apart from the component so the rounding can be tested: a rate above
 * zero always lights at least one square, so "almost nothing" never reads as
 * "nothing", and a rate short of 1 never fills the last one, so "almost
 * done" never reads as "done".
 */

/** Squares to fill out of `total` for `value` (0 to 1; null or NaN is none). */
export function filledSegments(value: number | null | undefined, total: number): number {
  if (!Number.isFinite(total) || total <= 0) return 0
  const segments = Math.floor(total)
  if (value === null || value === undefined || !Number.isFinite(value) || value <= 0) return 0
  if (value >= 1) return segments
  const filled = Math.round(value * segments)
  return Math.min(segments - 1, Math.max(1, filled))
}
