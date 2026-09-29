import { describe, expect, it } from "vitest"
import { contentDisposition, safeFileName } from "./files"

describe("contentDisposition", () => {
  it("keeps an ASCII fallback and a UTF-8 form", () => {
    expect(contentDisposition("Contrat signé.pdf")).toBe(
      `attachment; filename="Contrat sign_.pdf"; filename*=UTF-8''Contrat%20sign%C3%A9.pdf`
    )
  })
  it("strips header-breaking characters", () => {
    expect(contentDisposition('a"\r\nSet-Cookie: x.pdf')).not.toMatch(/[\r\n]/)
  })
})

describe("safeFileName", () => {
  it("removes path and reserved characters", () => {
    expect(safeFileName("../NDA: v2?*")).toBe("..NDA v2")
    expect(safeFileName("   ")).toBe("document")
  })
})
