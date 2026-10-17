/**
 * Field-placement diagnostics: what happened to a click or tap made while a
 * field type was armed in the editor.
 *
 * Why this exists: a sender reported, twice, that choosing a field type and
 * tapping the page placed nothing ("… has no fields yet" on send), in a
 * private window too. It never reproduced locally: dev and production
 * builds, mouse and touch, zoom from 50% to 150%, sealed and generated PDFs,
 * reopened drafts. So the editor now records each armed click in production
 * and reports the ones that should have placed a field and did not, with
 * where the pointer actually landed (components/esign/placement-diagnostics.tsx).
 *
 * This file is the pure part: given the facts about one click, which case
 * it is. The cases name the possible root causes, so a report says which one.
 */

export type PlacementFacts = {
  /** The pointer landed inside a rendered PDF page's rectangle. */
  insidePage: boolean
  /** The element that received the event is (inside) a page's field overlay. */
  onOverlay: boolean
  /** The event was on an existing field (which starts a drag, not a placement). */
  onField: boolean
  /** The editor's placement handler ran for this event. */
  handlerRan: boolean
  /** A field was added within the check window after the event. */
  placed: boolean
}

export type PlacementOutcome =
  /** Worked. */
  | "placed"
  /** Not aimed at a page at all (the toolbar, the sidebar): nothing to report. */
  | "outside-page"
  /** On a field already placed: moving it, by design. */
  | "on-existing-field"
  /** Inside a page, but another element was on top and took the event. */
  | "covered"
  /** The overlay got the event but the handler never ran (stale or missing listener). */
  | "handler-not-called"
  /** The handler ran but no field appeared (it returned early, or the state update was lost). */
  | "handler-no-field"

export function classifyPlacement(f: PlacementFacts): PlacementOutcome {
  if (f.placed) return "placed"
  if (f.onField) return "on-existing-field"
  if (!f.insidePage) return "outside-page"
  if (!f.onOverlay) return "covered"
  if (!f.handlerRan) return "handler-not-called"
  return "handler-no-field"
}

/** The outcomes worth a report: the click was meant to place a field and did not. */
export const isPlacementMiss = (o: PlacementOutcome) => o === "covered" || o === "handler-not-called" || o === "handler-no-field"

export type Rect = { left: number; top: number; right: number; bottom: number }

/** Whether a point lies inside any of the rectangles (edges included). */
export function pointInRects(x: number, y: number, rects: Rect[]): boolean {
  return rects.some((r) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom)
}

/**
 * A short, PII-free description of an element for a report: tag, id, role,
 * data-page and the first few classes, e.g. `div.sticky.top-16.z-10`.
 */
export function describeElement(el: { tagName: string; id?: string; className?: unknown; getAttribute?: (name: string) => string | null } | null): string {
  if (!el) return "none"
  const classes = typeof el.className === "string" ? el.className.split(/\s+/).filter(Boolean).slice(0, 5) : []
  const role = el.getAttribute?.("role")
  const page = el.getAttribute?.("data-page")
  return [
    el.tagName.toLowerCase(),
    el.id ? `#${el.id}` : "",
    role ? `[role=${role}]` : "",
    page ? `[data-page=${page}]` : "",
    classes.length ? `.${classes.join(".")}` : "",
  ].join("")
}
