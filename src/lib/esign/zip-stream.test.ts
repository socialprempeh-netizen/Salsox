import { describe, it, expect } from "vitest"
import JSZip from "jszip"

import { crc32, EXPORT_DOCUMENTS_PER_PART, exportPartCount, parseExportPart, zipStream } from "./zip-stream"

const text = (s: string) => new TextEncoder().encode(s)
const collect = async (stream: ReadableStream<Uint8Array>) => new Uint8Array(await new Response(stream).arrayBuffer())

describe("crc32", () => {
  it("matches the standard check value", () => {
    expect(crc32(text("123456789"))).toBe(0xcbf43926)
  })
})

describe("zipStream", () => {
  // Read back with an independent implementation: if JSZip accepts it, so
  // will the operating system's archive tool.
  it("writes an archive another reader opens, with every entry intact", async () => {
    const bytes = await collect(
      zipStream([
        { name: "index.csv", data: text("id,title\n1,Lease\n") },
        { name: "Lease (abc)/original.pdf", data: async () => text("%PDF-1.7 original") },
        { name: "Contrat – été (déf)/audit.json", data: text('{"ok":true}') },
      ])
    )
    const zip = await JSZip.loadAsync(bytes, { checkCRC32: true })
    expect(Object.keys(zip.files).sort()).toEqual(["Contrat – été (déf)/audit.json", "Lease (abc)/original.pdf", "index.csv"])
    expect(await zip.file("Lease (abc)/original.pdf")!.async("string")).toBe("%PDF-1.7 original")
    expect(await zip.file("Contrat – été (déf)/audit.json")!.async("string")).toBe('{"ok":true}')
  })

  it("loads each entry only when the reader gets to it", async () => {
    const loaded: string[] = []
    const stream = zipStream(
      (async function* () {
        for (const name of ["a", "b", "c"]) {
          yield { name, data: async () => (loaded.push(name), text(name)) }
        }
      })()
    )
    const reader = stream.getReader()
    await reader.read() // first header
    expect(loaded).toEqual(["a"])
    await reader.cancel()
    expect(loaded).toEqual(["a"])
  })

  it("is a valid empty archive with no entries", async () => {
    const zip = await JSZip.loadAsync(await collect(zipStream([])))
    expect(Object.keys(zip.files)).toEqual([])
  })

  it("fails the stream when an entry cannot be loaded", async () => {
    const stream = zipStream([{ name: "x", data: async () => Promise.reject(new Error("storage down")) }])
    await expect(collect(stream)).rejects.toThrow("storage down")
  })
})

describe("export parts", () => {
  it("splits into parts and always has at least one", () => {
    expect(exportPartCount(0)).toBe(1)
    expect(exportPartCount(EXPORT_DOCUMENTS_PER_PART)).toBe(1)
    expect(exportPartCount(EXPORT_DOCUMENTS_PER_PART + 1)).toBe(2)
  })

  it("reads the part asked for, defaulting to the first", () => {
    expect(parseExportPart(null, 3)).toBe(1)
    expect(parseExportPart("2", 3)).toBe(2)
    expect(parseExportPart("4", 3)).toBeNull()
    expect(parseExportPart("1e3", 3)).toBeNull()
  })
})
