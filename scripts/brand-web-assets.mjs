#!/usr/bin/env node
/**
 * Builds the web copies of the brand artwork in public/brand/ into
 * public/brand/web/:
 *
 *   node scripts/brand-web-assets.mjs
 *
 * Why it exists: the source files are 1024-1721px rasters of 250-460 KB each,
 * several with backgrounds baked in. Served as they are, the footer alone
 * would download about 3 MB for icons drawn at 26px, and the backgrounds
 * would show as boxes on the black footer. This crops each file to its
 * artwork, removes the background, and downscales (never upscales) to 3x the
 * size it is displayed at, so it stays crisp on high-density screens.
 *
 * The sources are left untouched; run this again whenever one is replaced.
 * Per file:
 *  - transparent icons (Facebook, LinkedIn, Reddit, TikTok) and the logo
 *    mark: trimmed to their visible pixels and centred on a square canvas;
 *    (Pinterest was here, and Instagram had its own step below, until both
 *    left the footer;)
 *  - YouTube: a JPEG on a navy vignette, cut to the red logo's rounded
 *    rectangle;
 *  - the Google Play badge: a JPEG on white, cut to its rounded rectangle.
 *    (The App Store badge is Apple's official SVG in public/badges/, used as
 *    is; the supplied 3D render is no longer processed.)
 */
import path from "node:path"
import fs from "node:fs"
import sharp from "sharp"

const root = path.resolve(import.meta.dirname, "..")
const src = (f) => path.join(root, "public", "brand", f)
const outDir = path.join(root, "public", "brand", "web")
fs.mkdirSync(outDir, { recursive: true })
const out = (f) => path.join(outDir, f)

/** Bounding box of the pixels `keep` accepts. */
async function bounds(file, keep) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  let minX = info.width, minY = info.height, maxX = -1, maxY = -1
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * 4
      if (keep(data[i], data[i + 1], data[i + 2], data[i + 3])) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
}

/**
 * The box of the longest run (short breaks bridged) of rows and of columns in which at
 * least `share` of the pixels pass `keep`: a solid panel's extent, which a
 * thin line of the same colour elsewhere (a shadow, an edge) cannot stretch
 * the way it stretches a plain bounding box.
 */
async function denseBounds(file, keep, share, rowGap = 24, colGap = Infinity) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const rows = new Array(info.height).fill(0)
  const cols = new Array(info.width).fill(0)
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * 4
      if (keep(data[i], data[i + 1], data[i + 2], data[i + 3])) {
        rows[y]++
        cols[x]++
      }
    }
  }
  // The longest run, bridging short breaks (rows of lettering across the
  // panel) but not long ones, so a separate dark band (the shadow under a
  // bevel, past 60-odd lighter rows) is not joined to the panel.
  // Columns bridge any gap by default: a mark on the panel (the Apple logo)
  // can be wider than a row of lettering is tall.
  const longestRun = (counts, limit, maxGap) => {
    let best = [0, -1], start = -1, last = -1
    counts.forEach((n, i) => {
      if (n < limit) return
      if (start < 0 || i - last > maxGap + 1) start = i
      last = i
      if (i - start > best[1] - best[0]) best = [start, i]
    })
    return best
  }
  const [top, bottom] = longestRun(rows, info.width * share, rowGap)
  const [left, right] = longestRun(cols, info.height * share, colGap)
  return { left, top, width: right - left + 1, height: bottom - top + 1 }
}

/** An alpha mask: a circle, or a rectangle with rounded corners. */
function mask(width, height, shape) {
  const body =
    shape.kind === "circle"
      ? `<circle cx="${width / 2}" cy="${height / 2}" r="${Math.min(width, height) / 2}" fill="#fff"/>`
      : `<rect x="0" y="0" width="${width}" height="${height}" rx="${shape.radius}" ry="${shape.radius}" fill="#fff"/>`
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${body}</svg>`)
}

/** Crops `box` out of `file`, masks it to `shape`, and returns a PNG buffer. */
async function cut(file, box, shape) {
  const cropped = await sharp(file).extract(box).ensureAlpha().png().toBuffer()
  return sharp(cropped).composite([{ input: mask(box.width, box.height, shape), blend: "dest-in" }]).png().toBuffer()
}

/** Centres an image on a transparent square, then sizes it to `size`. */
async function square(input, size) {
  const meta = await sharp(input).metadata()
  const side = Math.max(meta.width, meta.height)
  const padded = await sharp(input)
    .extend({
      top: Math.floor((side - meta.height) / 2),
      bottom: Math.ceil((side - meta.height) / 2),
      left: Math.floor((side - meta.width) / 2),
      right: Math.ceil((side - meta.width) / 2),
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer()
  return sharp(padded).resize(size, size, { kernel: "lanczos3" })
}

const visible = (r, g, b, a) => a > 8
const report = []

// Transparent sources: trim to visible pixels, square, 78px (26px tiles at 3x).
// Was ["facebook", "linkedin", "pinterest", "tiktok"]: Reddit replaced Pinterest.
for (const name of ["facebook", "linkedin", "reddit", "tiktok"]) {
  const file = src(`icon-${name}.png`)
  const trimmed = await sharp(file).extract(await bounds(file, visible)).png().toBuffer()
  await (await square(trimmed, 78)).png().toFile(out(`icon-${name}.png`))
  report.push(`icon-${name}.png`)
}

// The logo mark: 256px covers the header (36px at 3x) and the 180px home-screen icon.
{
  const file = src("logo-mark.png")
  const trimmed = await sharp(file).extract(await bounds(file, visible)).png().toBuffer()
  await (await square(trimmed, 256)).png().toFile(out("logo-mark.png"))
  report.push("logo-mark.png")
}

// Instagram left the footer, so its icon is no longer built. Was:
// // Instagram: everything that is not the magenta background, cut to a circle.
// {
//   const file = src("icon-instagram.png")
//   const notMagenta = (r, g, b) => !(r > 200 && g < 60 && b > 200)
//   const box = await bounds(file, notMagenta)
//   const side = Math.min(box.width, box.height)
//   const squareBox = { left: box.left + Math.floor((box.width - side) / 2), top: box.top + Math.floor((box.height - side) / 2), width: side, height: side }
//   // One pixel inside the edge, so no magenta fringe survives the anti-aliasing.
//   const inset = { left: squareBox.left + 2, top: squareBox.top + 2, width: side - 4, height: side - 4 }
//   const circle = await cut(file, inset, { kind: "circle" })
//   await (await square(circle, 78)).png().toFile(out("icon-instagram.png"))
//   report.push("icon-instagram.png")
// }

// YouTube: the red rounded rectangle, off its navy background.
{
  const file = src("icon-youtube.jpg")
  const red = (r, g, b) => r > 150 && g < 100 && b < 100
  const box = await bounds(file, red)
  const logo = await cut(file, box, { kind: "rect", radius: Math.round(box.height * 0.24) })
  await (await square(logo, 78)).png().toFile(out("icon-youtube.png"))
  report.push("icon-youtube.png")
}

// Store badges, 108px tall (36px at 3x), off their backgrounds. The App
// Store entry is commented out: the footer uses Apple's official SVG
// (public/badges/app-store-badge.svg), which needs no processing, instead of
// the supplied 3D render. Its rules are kept for reference:
//  - App Store: the source is a 3D render on a grey gradient, with a bevel
//    and a metal base under the badge. At 36px those read as a grey lump, so
//    only the black face is kept: the longest run of rows and columns that
//    are largely (30% or more) near-black, bridging the lettering but not the
//    bevel, so the dark shadow under the base is left out.
//  - Google Play: a flat badge on white. Everything darker than the white
//    background is kept (under 215), which keeps its thin grey border.
// for (const [name, darkLimit, radiusRatio, dense] of [["badge-app-store", 40, 0.12, true], ["badge-google-play", 215, 0.09, false]]) {
for (const [name, darkLimit, radiusRatio, dense] of [["badge-google-play", 215, 0.09, false]]) {
  const file = src(`${name}.jpg`)
  const dark = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b < darkLimit
  const box = dense ? await denseBounds(file, dark, 0.3) : await bounds(file, dark)
  const face = await cut(file, box, { kind: "rect", radius: Math.round(box.height * radiusRatio) })
  const height = 108
  const width = Math.round((box.width / box.height) * height)
  await sharp(face).resize(width, height, { kernel: "lanczos3" }).png().toFile(out(`${name}.png`))
  report.push(`${name}.png ${width}x${height} (cut from ${box.width}x${box.height})`)
}

console.log(`wrote public/brand/web/: ${report.join(", ")}`)
