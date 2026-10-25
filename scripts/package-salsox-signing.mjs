#!/usr/bin/env node
/**
 * Packages the Salsox Signing Chrome extension (extensions/salsox-signing)
 * as a zip for the Chrome Web Store:
 *
 *   node scripts/package-salsox-signing.mjs
 *
 * Writes dist/salsox-signing-<version>.zip with the files the extension
 * needs at runtime and nothing else (no docs, no store drafts). Refuses to
 * package a config.js that does not point at https://salsox.com, so a copy
 * edited for local testing cannot be uploaded by mistake. dist/ is
 * git-ignored.
 */
import fs from "node:fs"
import path from "node:path"
import JSZip from "jszip"

const root = path.resolve(import.meta.dirname, "..")
const dir = path.join(root, "extensions", "salsox-signing")
const manifest = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"))
const runtime = [
  "manifest.json",
  "background.js",
  "config.js",
  "popup.html",
  "popup.css",
  "popup.js",
  "lib/fields.js",
  "vendor/pdfjs/pdf.min.mjs",
  "vendor/pdfjs/pdf.worker.min.mjs",
  "vendor/pdfjs/LICENSE",
  "icons/icon-16.png",
  "icons/icon-32.png",
  "icons/icon-48.png",
  "icons/icon-128.png",
]

const config = fs.readFileSync(path.join(dir, "config.js"), "utf8")
if (!config.includes('export const SERVER = "https://salsox.com"') || JSON.stringify(manifest.host_permissions) !== '["https://salsox.com/*"]') {
  console.error("config.js or manifest.json does not point at https://salsox.com; refusing to package a test build.")
  process.exit(1)
}

const zip = new JSZip()
for (const file of runtime) zip.file(file, fs.readFileSync(path.join(dir, file)))
const out = path.join(root, "dist", `salsox-signing-${manifest.version}.zip`)
fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }))
console.log(`wrote ${path.relative(root, out)} (${runtime.length} files)`)
