#!/usr/bin/env node
/**
 * Packages the Orphan Page Scanner Chrome extension
 * (extensions/orphan-page-scanner) as a zip for the Chrome Web Store:
 *
 *   node scripts/package-orphan-scanner.mjs
 *
 * Writes dist/orphan-page-scanner-<version>.zip with the files the
 * extension needs at runtime and nothing else (no docs, no tests, no type
 * declarations). dist/ is git-ignored.
 */
import fs from "node:fs"
import path from "node:path"
import JSZip from "jszip"

const root = path.resolve(import.meta.dirname, "..")
const dir = path.join(root, "extensions", "orphan-page-scanner")
const manifest = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"))
const runtime = ["manifest.json", "background.js", "popup.html", "popup.css", "popup.js", "lib/scan.js", "icons/icon-16.png", "icons/icon-32.png", "icons/icon-48.png", "icons/icon-128.png"]

const zip = new JSZip()
for (const file of runtime) zip.file(file, fs.readFileSync(path.join(dir, file)))
const out = path.join(root, "dist", `orphan-page-scanner-${manifest.version}.zip`)
fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }))
console.log(`wrote ${path.relative(root, out)} (${runtime.length} files)`)
