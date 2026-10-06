/**
 * Tests for the per-area client message subsets (client-messages.ts): the
 * picking itself, and a scan of every client component against the area it
 * renders in, so a component reading a namespace its layout does not send
 * fails here instead of in a browser.
 */
import { describe, expect, it } from "vitest"
import fs from "node:fs"
import path from "node:path"
import { CLIENT_MESSAGES, covers, pickMessages, type ClientMessageArea } from "./client-messages"

const SRC = path.join(process.cwd(), "src")

function files(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return files(full)
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : []
  })
}

/** Every client component, with the namespaces it reads through useTranslations. */
const clientComponents = files(SRC)
  .map((file) => ({ file: path.relative(SRC, file).replace(/\\/g, "/"), src: fs.readFileSync(file, "utf8") }))
  .filter(({ src }) => /^\s*["']use client["']/m.test(src.split("\n").slice(0, 3).join("\n")))
  .map(({ file, src }) => ({ file, namespaces: [...src.matchAll(/useTranslations\(\s*"([^"]+)"\s*\)/g)].map((m) => m[1]) }))
  .filter(({ namespaces }) => namespaces.length > 0)

/**
 * Where a component renders, by where it lives. A component listed under
 * several areas must be covered by each.
 */
function areasOf(file: string): ClientMessageArea[] {
  // The signature pad and PDF viewer also render in the free tools.
  if (/^components\/esign\/(signature-pad|pdf-pages)\.tsx$/.test(file)) return ["sign", "app", "tools"]
  if (/^components\/esign\/signing-wizard\.tsx$/.test(file)) return ["sign", "app"]
  if (/^components\/tools\//.test(file)) return ["tools"]
  if (/^components\/(seo|analytics)\//.test(file)) return ["public"]
  if (/^components\/billing\/(plan-cards|upgrade-button)\.tsx$/.test(file)) return ["public", "app"]
  if (/^components\/landing\/contact-dialog(-content)?\.tsx$/.test(file)) return ["public", "app"]
  if (/^components\/(ui\/|theme-toggle|not-found-view|landing\/related-links)/.test(file)) return ["shell"]
  if (/^components\/(landing|blog|docs|verify)\//.test(file)) return ["public"]
  if (/^components\/(esign|dashboard|settings|admin|billing|auth)\//.test(file)) return ["app"]
  if (/^app\/\[locale\]\//.test(file)) return ["public"]
  if (/^app\/sign\//.test(file)) return ["sign"]
  return ["app"]
}

describe("pickMessages", () => {
  const messages = { a: { b: { c: "1", d: "2" }, e: "3" }, f: "4" }

  it("keeps the given paths with their parents, and nothing else", () => {
    expect(pickMessages(messages, ["a.b.c", "f"])).toEqual({ a: { b: { c: "1" } }, f: "4" })
  })

  it("merges paths that share a parent and skips paths that do not exist", () => {
    expect(pickMessages(messages, ["a.b", "a.e", "x.y"])).toEqual({ a: { b: { c: "1", d: "2" }, e: "3" } })
  })
})

describe("client message areas", () => {
  it("finds the client components it is meant to check", () => {
    expect(clientComponents.length).toBeGreaterThan(30)
    expect(clientComponents.map((c) => c.file)).toContain("components/theme-toggle.tsx")
  })

  // Nested providers replace their parent's messages, they do not add to
  // them, so every area has to carry what renders anywhere.
  it("every area carries the shell namespaces", () => {
    for (const area of Object.keys(CLIENT_MESSAGES) as ClientMessageArea[]) {
      for (const namespace of CLIENT_MESSAGES.shell) expect(covers(CLIENT_MESSAGES[area], namespace)).toBe(true)
    }
  })

  it("every client component's namespaces are sent to the area it renders in", () => {
    const missing = clientComponents.flatMap(({ file, namespaces }) =>
      areasOf(file).flatMap((area) =>
        namespaces.filter((ns) => !covers(CLIENT_MESSAGES[area], ns)).map((ns) => `${file} reads "${ns}", not sent to "${area}"`)
      )
    )
    expect(missing, missing.join("\n")).toEqual([])
  })
})
