/**
 * Finding the inked part of a signature image, so it can be cropped before
 * use.
 *
 * A signature drawn on a pad fills a small part of a large canvas. Placed on
 * a PDF as is, the empty space shrinks the visible ink to fit the box, and a
 * downloaded PNG arrives with a wide transparent margin. The free tools crop
 * to the ink first (src/components/tools).
 *
 * The bounds are computed from raw RGBA pixels, which is what a canvas gives
 * back, so this part is pure and tested; the canvas calls stay in
 * `trimDataUrl`, which only runs in a browser.
 */

export type Bounds = { x: number; y: number; width: number; height: number }

/**
 * The smallest box holding every pixel more opaque than `threshold`, grown by
 * `margin` pixels and clamped to the image. Null for an empty image.
 */
export function alphaBounds(rgba: Uint8ClampedArray, width: number, height: number, { threshold = 8, margin = 0 } = {}): Bounds | null {
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (rgba[(y * width + x) * 4 + 3] > threshold) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) return null
  const x = Math.max(0, minX - margin)
  const y = Math.max(0, minY - margin)
  return { x, y, width: Math.min(width, maxX + margin + 1) - x, height: Math.min(height, maxY + margin + 1) - y }
}

/** Crops a PNG data URL to its ink. Browser only. Returns the input if there is nothing to crop. */
export async function trimDataUrl(dataUrl: string, margin = 6): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image()
    el.onload = () => resolve(el)
    el.onerror = reject
    el.src = dataUrl
  })
  const canvas = document.createElement("canvas")
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext("2d")
  if (!ctx) return dataUrl
  ctx.drawImage(img, 0, 0)
  const bounds = alphaBounds(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height, { margin })
  if (!bounds) return dataUrl
  const out = document.createElement("canvas")
  out.width = bounds.width
  out.height = bounds.height
  out.getContext("2d")!.drawImage(canvas, bounds.x, bounds.y, bounds.width, bounds.height, 0, 0, bounds.width, bounds.height)
  return out.toDataURL("image/png")
}
