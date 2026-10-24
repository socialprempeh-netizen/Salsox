#!/usr/bin/env node
/**
 * Packages the Orphan Page Scanner Claude skill
 * (claude-skills/orphan-page-scanner/skills/orphan-page-scanner) as a zip
 * for upload to claude.ai (Settings > Capabilities > Skills):
 *
 *   node scripts/package-orphan-scanner-skill.mjs
 *
 * The zip holds the skill folder with SKILL.md at its root and the bundled
 * script, plus the licence. dist/ is git-ignored.
 */
import fs from "node:fs"
import path from "node:path"
import JSZip from "jszip"

const root = path.resolve(import.meta.dirname, "..")
const plugin = path.join(root, "claude-skills", "orphan-page-scanner")
const skill = path.join(plugin, "skills", "orphan-page-scanner")
const files = ["SKILL.md", "scripts/find-orphans.mjs", "scripts/scan.js", "scripts/package.json"]

const zip = new JSZip()
const folder = zip.folder("orphan-page-scanner")
for (const file of files) folder.file(file, fs.readFileSync(path.join(skill, file)))
folder.file("LICENSE", fs.readFileSync(path.join(plugin, "LICENSE")))
const out = path.join(root, "dist", "orphan-page-scanner-skill.zip")
fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }))
console.log(`wrote ${path.relative(root, out)} (${files.length + 1} files)`)
