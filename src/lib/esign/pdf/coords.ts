/**
 * Conversion between stored field positions and PDF user space.
 *
 * Fields are stored as percentages of the page measured from the TOP-LEFT
 * corner (what a browser overlay naturally produces). PDF user space starts at
 * the BOTTOM-LEFT, in points. Getting the y flip wrong puts every signature
 * mirrored vertically, so the arithmetic lives here, once, with tests.
 *
 * Page rotation is handled by the caller passing the page size as displayed
 * (pdf-lib reports the unrotated MediaBox); rotated pages are rare in signing
 * workflows and are normalised before upload is accepted.
 */

export type PercentRect = { x: number; y: number; width: number; height: number }
export type PointRect = { x: number; y: number; width: number; height: number }

export function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value))
}

/** Stored percentages → PDF points (origin bottom-left). */
export function percentToPdfRect(rect: PercentRect, pageWidth: number, pageHeight: number): PointRect {
  const width = (rect.width / 100) * pageWidth
  const height = (rect.height / 100) * pageHeight
  const x = (rect.x / 100) * pageWidth
  // Top edge at y% from the top → bottom edge at (100 - y - h)% from the bottom.
  const y = pageHeight - (rect.y / 100) * pageHeight - height
  return { x, y, width, height }
}

/**
 * A pointer position inside a rendered page element → stored percentages.
 * Used by the field editor when a field is dropped or dragged.
 */
export function clientToPercent(
  clientX: number,
  clientY: number,
  box: { left: number; top: number; width: number; height: number }
): { x: number; y: number } {
  return {
    x: clampPercent(((clientX - box.left) / box.width) * 100),
    y: clampPercent(((clientY - box.top) / box.height) * 100),
  }
}

/** Fits an image of (iw × ih) inside a box, preserving aspect ratio, centred. */
export function fitInside(
  iw: number,
  ih: number,
  box: PointRect
): PointRect {
  const scale = Math.min(box.width / iw, box.height / ih)
  const width = iw * scale
  const height = ih * scale
  return { x: box.x + (box.width - width) / 2, y: box.y + (box.height - height) / 2, width, height }
}
