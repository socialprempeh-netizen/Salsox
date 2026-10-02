/**
 * A streaming ZIP writer for "Export everything".
 *
 * The export used to add every PDF to a JSZip object and only then start
 * sending, so an account's whole archive sat in memory at once; on a large
 * account the function ran out of memory or time and the download never
 * started. This writes the archive as the browser reads it: each entry is
 * loaded only when the stream is pulled for more (so a slow download slows
 * the reads instead of piling them up), written, and let go. Memory holds one
 * file plus a few dozen bytes per entry for the central directory.
 *
 * Entries are stored, not deflated: PDFs are compressed already, and the
 * JSON and CSV beside them are small. No ZIP64: the export is split into
 * parts that stay far below 4 GB (see EXPORT_DOCUMENTS_PER_PART), and the
 * writer refuses rather than produce a corrupt archive if one ever would not.
 *
 * No dependencies and no I/O of its own, so it is tested by writing an
 * archive and reading it back.
 */

export type ZipEntry = {
  /** Path inside the archive, with forward slashes. */
  name: string
  /** The bytes, or a function that loads them when the entry is reached. */
  data: Uint8Array | (() => Promise<Uint8Array>)
  modified?: Date
}

const LIMIT_32 = 0xffffffff
const encoder = new TextEncoder()

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

/** MS-DOS date and time, the only timestamp format a plain ZIP header holds. */
function dosDateTime(date: Date): { time: number; date: number } {
  const year = Math.max(1980, date.getFullYear())
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  }
}

type Written = { name: Uint8Array; crc: number; size: number; offset: number; time: number; date: number }

// General purpose flag bit 11: file names are UTF-8 (titles are not ASCII-only).
const UTF8 = 0x0800

function localHeader(e: Written): Uint8Array {
  const buf = new Uint8Array(30 + e.name.length)
  const v = new DataView(buf.buffer)
  v.setUint32(0, 0x04034b50, true)
  v.setUint16(4, 20, true) // version needed: 2.0
  v.setUint16(6, UTF8, true)
  v.setUint16(8, 0, true) // stored
  v.setUint16(10, e.time, true)
  v.setUint16(12, e.date, true)
  v.setUint32(14, e.crc, true)
  v.setUint32(18, e.size, true)
  v.setUint32(22, e.size, true)
  v.setUint16(26, e.name.length, true)
  v.setUint16(28, 0, true)
  buf.set(e.name, 30)
  return buf
}

function centralHeader(e: Written): Uint8Array {
  const buf = new Uint8Array(46 + e.name.length)
  const v = new DataView(buf.buffer)
  v.setUint32(0, 0x02014b50, true)
  v.setUint16(4, 20, true) // version made by
  v.setUint16(6, 20, true) // version needed
  v.setUint16(8, UTF8, true)
  v.setUint16(10, 0, true)
  v.setUint16(12, e.time, true)
  v.setUint16(14, e.date, true)
  v.setUint32(16, e.crc, true)
  v.setUint32(20, e.size, true)
  v.setUint32(24, e.size, true)
  v.setUint16(28, e.name.length, true)
  // extra length, comment length, disk number, internal and external attributes: all zero
  v.setUint32(42, e.offset, true)
  buf.set(e.name, 46)
  return buf
}

function endOfCentralDirectory(count: number, size: number, offset: number): Uint8Array {
  const buf = new Uint8Array(22)
  const v = new DataView(buf.buffer)
  v.setUint32(0, 0x06054b50, true)
  v.setUint16(8, count, true)
  v.setUint16(10, count, true)
  v.setUint32(12, size, true)
  v.setUint32(16, offset, true)
  return buf
}

/**
 * The archive as a byte stream, pulling `entries` one at a time. An error
 * loading an entry ends the stream with that error, so the download fails
 * visibly instead of producing a truncated file that looks complete.
 */
export function zipStream(entries: AsyncIterable<ZipEntry> | Iterable<ZipEntry>): ReadableStream<Uint8Array> {
  const iterator =
    Symbol.asyncIterator in entries
      ? (entries as AsyncIterable<ZipEntry>)[Symbol.asyncIterator]()
      : (entries as Iterable<ZipEntry>)[Symbol.iterator]()
  const written: Written[] = []
  let offset = 0
  let finished = false

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (finished) return
      const next = await iterator.next()
      if (next.done) {
        const central = written.map(centralHeader)
        const size = central.reduce((n, b) => n + b.length, 0)
        if (written.length > 0xffff || offset > LIMIT_32) {
          throw new Error("Export part too large for a plain ZIP; lower EXPORT_DOCUMENTS_PER_PART")
        }
        for (const b of central) controller.enqueue(b)
        controller.enqueue(endOfCentralDirectory(written.length, size, offset))
        finished = true
        controller.close()
        return
      }
      const entry = next.value
      const data = typeof entry.data === "function" ? await entry.data() : entry.data
      if (offset + data.length > LIMIT_32) throw new Error("Export part too large for a plain ZIP; lower EXPORT_DOCUMENTS_PER_PART")
      const { time, date } = dosDateTime(entry.modified ?? new Date())
      const record: Written = { name: encoder.encode(entry.name), crc: crc32(data), size: data.length, offset, time, date }
      const header = localHeader(record)
      controller.enqueue(header)
      controller.enqueue(data)
      offset += header.length + data.length
      written.push(record)
    },
    async cancel() {
      // The browser gave up: stop loading files nobody will receive.
      finished = true
      await (iterator as AsyncIterator<ZipEntry>).return?.()
    },
  })
}

/** Documents per export part: at most ~3 files each, every PDF capped near 4 MB. */
export const EXPORT_DOCUMENTS_PER_PART = 100

/** How many parts an export of `documents` documents comes in (at least one). */
export function exportPartCount(documents: number): number {
  return Math.max(1, Math.ceil(documents / EXPORT_DOCUMENTS_PER_PART))
}

/** The part number asked for, or null when it is not one of the parts. */
export function parseExportPart(value: string | null, parts: number): number | null {
  if (value === null || value === "") return 1
  if (!/^\d+$/.test(value)) return null
  const part = Number(value)
  return part >= 1 && part <= parts ? part : null
}
