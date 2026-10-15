/**
 * Renders a free template (src/lib/templates.ts) as a plain A4 PDF for the
 * "Download PDF" button: the document someone can fill in and then upload to
 * be signed.
 *
 * Deliberately simple typesetting with pdf-lib's built-in Helvetica: a title,
 * headings in bold, wrapped paragraphs, signature lines, and a footer on
 * every page saying where the template came from and that it is a template,
 * not legal advice. No embedded fonts, so the file stays a few kilobytes.
 *
 * The built-in fonts only encode Windows-1252 (WinAnsi), and pdf-lib throws on
 * anything else, so text passes through `toWinAnsi` first. The templates are
 * English, so that only ever replaces the odd symbol.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib"
import { templatePlainText } from "@/lib/templates"

const PAGE = { width: 595.28, height: 841.89 } // A4 in points
const MARGIN = { x: 64, top: 72, bottom: 72 }
const SIZE = { title: 18, heading: 12, body: 10.5, footer: 8 }
const LEADING = 1.45
const INK = rgb(0.14, 0.14, 0.14)
const MUTED = rgb(0.37, 0.36, 0.35)

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

export async function renderTemplatePdf(args: { title: string; markdown: string; footer: string }): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.setTitle(toWinAnsi(args.title))
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const width = PAGE.width - MARGIN.x * 2

  let page = pdf.addPage([PAGE.width, PAGE.height])
  let y = PAGE.height - MARGIN.top
  const newPage = () => {
    page = pdf.addPage([PAGE.width, PAGE.height])
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

  // The document's own "# Title" is its title; a body without one gets `title`.
  if (!/^#\s/.test(args.markdown.trim())) write(args.title, bold, SIZE.title, INK, 14)

  // Headings come from the Markdown, so read the source for them and the
  // plain text for everything else, block by block.
  const blocks = args.markdown.split(/\n\s*\n/)
  for (const block of blocks) {
    if (/^#\s/.test(block.trim())) {
      write(templatePlainText(block.trim().slice(2)), bold, SIZE.title, INK, 14)
      continue
    }
    const heading = /^#{2,6}\s+(.*)$/.exec(block.trim())
    if (heading) {
      if (y - SIZE.heading * 3 < MARGIN.bottom) newPage()
      y -= 6
      write(templatePlainText(heading[1]), bold, SIZE.heading, INK, 4)
      continue
    }
    for (const line of templatePlainText(block).split("\n")) write(line, regular, SIZE.body)
    y -= SIZE.body * 0.6
  }

  const pages = pdf.getPages()
  pages.forEach((p, i) => {
    const text = toWinAnsi(`${args.footer}   ${i + 1}/${pages.length}`)
    p.drawText(text, { x: MARGIN.x, y: MARGIN.bottom / 2, size: SIZE.footer, font: regular, color: MUTED, maxWidth: width })
  })

  return pdf.save()
}
