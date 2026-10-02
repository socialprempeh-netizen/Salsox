/**
 * Whether NEXT_PUBLIC_REMOVE_BRANDING asks to hide the "Built with" badge
 * (components/powered-by.tsx).
 *
 * The badge used to compare the raw value with "true" and nothing else, so
 * "TRUE", "1", or "true " with a stray space from a dashboard paste all left
 * it showing, with no error to say why. Those obvious spellings now count;
 * anything else, including empty, keeps the badge.
 */
export function brandingRemoved(value: string | undefined): boolean {
  return /^(true|1|yes|on)$/i.test((value ?? "").trim())
}
