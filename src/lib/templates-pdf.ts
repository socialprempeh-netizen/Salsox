/**
 * Renders a template (src/lib/templates.ts) as a plain A4 PDF, and says where
 * its signing fields landed.
 *
 * Two callers: the public "Download PDF" button, which wants the document
 * with signature lines to sign on paper, and "Use this template", which wants
 * the same document plus the position of every [[signature:role]],
 * [[initials:role]], [[date:role]] and [[name:role]] token, so the signing
 * engine can place real fields there (src/lib/esign/templates.ts). One
 * renderer for both, so the PDF someone downloads and the one they send look
 * the same.
 *
 * Deliberately simple typesetting with pdf-lib's built-in Helvetica: a title,
 * bold headings, wrapped paragraphs, tables as rows of cells, and a footer on
 * every page. A line holding field tokens is laid out without wrapping: text
 * runs up to each token, the token becomes a box of fixed size with a rule
 * under it, and its rectangle is recorded in the editor's coordinates
 * (percent of the page from the top left, pages from 1).
 *
 * The built-in fonts only encode Windows-1252 (WinAnsi), and pdf-lib throws on
 * anything else, so text passes through `toWinAnsi` first.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib"
import { FIELD_TOKEN, templatePlainText, type FieldKind } from "@/lib/templates"

const PAGE = { width: 595.28, height: 841.89 } // A4 in points
const MARGIN = { x: 64, top: 72, bottom: 72 }
const SIZE = { title: 18, heading: 12, body: 10.5, footer: 8, label: 7 }
const LEADING = 1.45
const INK = rgb(0.14, 0.14, 0.14)
const MUTED = rgb(0.37, 0.36, 0.35)
const RULE = rgb(0.55, 0.54, 0.52)

/** The size of each kind of signing spot, in points. */
export const FIELD_BOX: Record<FieldKind, { width: number; height: number }> = {
  signature: { width: 170, height: 34 },
  initials: { width: 56, height: 26 },
  date: { width: 100, height: 22 },
  name: { width: 160, height: 22 },
  text: { width: 300, height: 22 },
}

/** A field's rectangle in the editor's coordinates: percent of the page from the top left, page from 1. */
export type PlacedField = { kind: FieldKind; role: string; page: number; x: number; y: number; width: number; height: number }

// Characters above U+00FF that Windows-1252 still encodes.
const WIN_ANSI_EXTRA = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ")

/** Text the built-in fonts can encode: anything else becomes its nearest ASCII, or "?". */
export function toWinAnsi(text: string): string {
  return [...text]
    .map((ch) => {
      const code = ch.codePointAt(0)!
      if (code === 0x0a || (code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || WIN_ANSI_EXTRA.has(ch)) return ch
      if (ch === "\t") return " "
      if (ch === "→") return "->"
      if (ch === "≥") return ">="
      if (ch === "≤") return "<="
      return "?"
    })
    .join("")
}

/** Splits `text` into lines no wider than `width` at `size`. */
export function wrapText(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = []
  let line = ""
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word
    if (font.widthOfTextAtSize(candidate, size) <= width || !line) line = candidate
    else {
      lines.push(line)
      line = word
    }
  }
  if (line) lines.push(line)
  return lines
}

const round = (n: number) => Math.round(n * 100) / 100

export async function renderTemplatePdf(args: { title: string; markdown: string; footer: string }): Promise<{ bytes: Uint8Array; fields: PlacedField[] }> {
  const pdf = await PDFDocument.create()
  pdf.setTitle(toWinAnsi(args.title))
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const width = PAGE.width - MARGIN.x * 2
  const fields: PlacedField[] = []

  let page: PDFPage = pdf.addPage([PAGE.width, PAGE.height])
  let pageNumber = 1
  let y = PAGE.height - MARGIN.top
  const newPage = () => {
    page = pdf.addPage([PAGE.width, PAGE.height])
    pageNumber++
    y = PAGE.height - MARGIN.top
  }
  const write = (text: string, font: PDFFont, size: number, color = INK, gapAfter = 0) => {
    for (const line of wrapText(toWinAnsi(text), font, size, width)) {
      if (y - size < MARGIN.bottom) newPage()
      y -= size
      page.drawText(line, { x: MARGIN.x, y, size, font, color })
      y -= size * (LEADING - 1)
    }
    y -= gapAfter
  }

  /** One line holding field tokens: text and boxes left to right, boxes recorded as fields. */
  const writeFieldLine = (line: string) => {
    const parts = line.split(new RegExp(FIELD_TOKEN.source))
    // split() with two capture groups yields text, kind, role, text, kind, role, text…
    const segments: ({ text: string } | { kind: FieldKind; role: string })[] = []
    for (let i = 0; i < parts.length; i += 3) {
      const text = templatePlainText(parts[i] ?? "").replace(/\s+/g, " ")
      if (text.trim()) segments.push({ text })
      if (i + 2 < parts.length) segments.push({ kind: parts[i + 1] as FieldKind, role: parts[i + 2] })
    }
    const tallest = Math.max(SIZE.body, ...segments.map((s) => ("kind" in s ? FIELD_BOX[s.kind].height : 0)))
    const lineHeight = tallest + 10
    if (y - lineHeight < MARGIN.bottom) newPage()
    let baseline = y - tallest
    let x = MARGIN.x
    // Starts a new row below this one when the next piece would cross the margin.
    const nextRow = () => {
      y -= lineHeight + SIZE.label
      if (y - lineHeight < MARGIN.bottom) newPage()
      baseline = y - tallest
      x = MARGIN.x
    }
    segments.forEach((segment, index) => {
      if ("text" in segment) {
        let text = toWinAnsi(segment.text)
        // Text longer than the line: all but its last line are set as a
        // paragraph above, and the last line continues with the field.
        if (regular.widthOfTextAtSize(text, SIZE.body) > width) {
          if (x > MARGIN.x) nextRow()
          const wrapped = wrapText(text, regular, SIZE.body, width)
          text = wrapped.pop() ?? ""
          for (const line of wrapped) write(line, regular, SIZE.body)
          baseline = y - tallest
        }
        const textWidth = regular.widthOfTextAtSize(text, SIZE.body)
        // A label moves with the field after it ("Date:" stays beside its box).
        const next = segments[index + 1]
        const withField = next && "kind" in next ? FIELD_BOX[next.kind].width : 0
        if (x > MARGIN.x && x + textWidth + withField > PAGE.width - MARGIN.x) nextRow()
        page.drawText(text, { x, y: baseline, size: SIZE.body, font: regular, color: INK })
        x += textWidth + 4
        return
      }
      const box = FIELD_BOX[segment.kind]
      if (x + box.width > PAGE.width - MARGIN.x) nextRow()
      page.drawLine({ start: { x, y: baseline - 2 }, end: { x: x + box.width, y: baseline - 2 }, thickness: 0.6, color: RULE })
      page.drawText(toWinAnsi(segment.kind), { x, y: baseline - 2 - SIZE.label - 1, size: SIZE.label, font: regular, color: MUTED })
      const top = baseline - 2 + box.height
      fields.push({
        kind: segment.kind,
        role: segment.role,
        page: pageNumber,
        x: round((x / PAGE.width) * 100),
        y: round(((PAGE.height - top) / PAGE.height) * 100),
        width: round((box.width / PAGE.width) * 100),
        height: round((box.height / PAGE.height) * 100),
      })
      x += box.width + 10
    })
    y -= lineHeight + SIZE.label
  }

  /** A Markdown table: columns sized to their content, header in bold, cells wrapped. */
  const writeTable = (lines: string[]) => {
    const rows = lines
      .filter((l) => !/^\s*\|?\s*:?-{3,}/.test(l))
      .map((l) => l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => toWinAnsi(templatePlainText(c.trim()))))
    if (rows.length === 0) return
    const columns = Math.max(...rows.map((r) => r.length))
    const gap = 8
    const available = width - gap * (columns - 1)
    const longest = Array.from({ length: columns }, (_, c) => Math.max(4, ...rows.map((r) => (r[c] ?? "").length)))
    const raw = longest.map((l) => Math.max(40, (available * l) / longest.reduce((a, b) => a + b, 0)))
    const colWidths = raw.map((w) => (w * available) / raw.reduce((a, b) => a + b, 0))
    rows.forEach((row, r) => {
      const font = r === 0 ? bold : regular
      const cells = colWidths.map((w, c) => wrapText(row[c] ?? "", font, SIZE.body, w))
      const height = Math.max(1, ...cells.map((c) => c.length)) * SIZE.body * LEADING
      if (y - height - 4 < MARGIN.bottom) newPage()
      let x = MARGIN.x
      cells.forEach((cellLines, c) => {
        cellLines.forEach((line, i) => page.drawText(line, { x, y: y - SIZE.body - i * SIZE.body * LEADING, size: SIZE.body, font, color: INK }))
        x += colWidths[c] + gap
      })
      y -= height + 2
      page.drawLine({ start: { x: MARGIN.x, y }, end: { x: MARGIN.x + width, y }, thickness: r === 0 ? 0.8 : 0.3, color: RULE })
      y -= 4
    })
  }

  // The document's own "# Title" is its title; a body without one gets `title`.
  if (!/^#\s/.test(args.markdown.trim())) write(args.title, bold, SIZE.title, INK, 14)

  // Headings come from the Markdown, so read the source for them and the
  // plain text for everything else, block by block.
  const tokenTest = new RegExp(FIELD_TOKEN.source)
  for (const block of args.markdown.split(/\n\s*\n/)) {
    const trimmed = block.trim()
    if (/^#\s/.test(trimmed)) {
      write(templatePlainText(trimmed.slice(2)), bold, SIZE.title, INK, 14)
      continue
    }
    const heading = /^#{2,6}\s+(.*)$/.exec(trimmed)
    if (heading) {
      if (y - SIZE.heading * 3 < MARGIN.bottom) newPage()
      y -= 6
      write(templatePlainText(heading[1]), bold, SIZE.heading, INK, 4)
      continue
    }
    const lines = block.split("\n")
    // A signature block stays on one page: a party's name is never left at
    // the foot of one page with their signature line on the next.
    if (tokenTest.test(block)) {
      const needed = lines.reduce((h, l) => h + (tokenTest.test(l) ? FIELD_BOX.signature.height + 10 + SIZE.label : SIZE.body * LEADING), 0)
      if (y - needed < MARGIN.bottom && needed < PAGE.height - MARGIN.top - MARGIN.bottom) newPage()
    }
    for (let i = 0; i < lines.length; i++) {
      if (/^\s*\|/.test(lines[i])) {
        // A run of table lines is laid out together.
        let end = i
        while (end < lines.length && /^\s*\|/.test(lines[end])) end++
        writeTable(lines.slice(i, end))
        i = end - 1
      } else if (tokenTest.test(lines[i])) writeFieldLine(lines[i])
      else for (const line of templatePlainText(lines[i]).split("\n")) if (line.trim()) write(line, regular, SIZE.body)
    }
    y -= SIZE.body * 0.6
  }

  const pages = pdf.getPages()
  pages.forEach((p, i) => {
    const text = toWinAnsi(`${args.footer}   ${i + 1}/${pages.length}`)
    p.drawText(text, { x: MARGIN.x, y: MARGIN.bottom / 2, size: SIZE.footer, font: regular, color: MUTED, maxWidth: width })
  })

  return { bytes: await pdf.save(), fields }
}
