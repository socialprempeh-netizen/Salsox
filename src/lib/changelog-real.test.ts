import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"
import { getChangelog } from "@/lib/changelog"

/**
 * Salsox's own content/changelog.md, parsed.
 *
 * The other changelog tests run against fixtures, which is right for the
 * parser but leaves the real file unchecked: a release entry with a malformed
 * heading would ship and be found by a reader instead of by the build. This
 * asserts the file /changelog actually renders, and that it leads with the
 * version the app declares, which the footer badge links to.
 *
 * It used to check the starter kit's root CHANGELOG.md, under a stubbed
 * KIT_SITE. That file was removed when Salsox started its own release notes.
 */
describe("the Salsox changelog", () => {
  const changelog = getChangelog()

  it("parses, newest release first", () => {
    expect(changelog.releases.length).toBeGreaterThan(0)
    expect(changelog.releases[0].version).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it("leads with the version package.json declares", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"))
    expect(changelog.releases[0].version).toBe(pkg.version)
  })

  it("gives every release a date and a body", () => {
    for (const r of changelog.releases) {
      expect(r.date, `${r.version} has no date`).toBeTruthy()
      expect(r.body.trim().length, `${r.version} has an empty body`).toBeGreaterThan(0)
    }
  })
})
