#!/usr/bin/env node
/**
 * Makes the blog's cover images, one 1200x630 PNG per post, written to the
 * path in its frontmatter `cover:` (under public/):
 *
 *   node scripts/blog-images.mjs              every post with a cover
 *   node scripts/blog-images.mjs slug slug    only these posts
 *
 * Why it exists: each post needs a header image and a social card, and a
 * script keeps them consistent across batches without stock photos or a
 * design tool. The 1200x630 size is the share-card size and the ratio the
 * post page and the blog cards display (src/lib/blog.ts, `cover`).
 *
 * The look is the brand's: cream (#f8f5f3) and ink (#242424) from the site's
 * theme, black (#000000) as in the footer, teal (#087a68) from the logo mark
 * (public/brand/web/logo-mark.png, drawn in the corner), Inter (vendored in
 * scripts/fonts/ under its OFL licence, so this runs offline), square
 * corners. Left: the category and title. Right: a black panel with a
 * document and its teal signature line, tagged with a short `coverLabel`
 * from the frontmatter ("PDF", "$11", "@"), so each post is told apart at a
 * glance.
 *
 * Rendering is Next's own image renderer (Satori and resvg, the engine the
 * site's generated social cards use), so text is set exactly as on the site.
 */
import fs from "node:fs"
import path from "node:path"
import matter from "gray-matter"
import { ImageResponse } from "next/dist/compiled/@vercel/og/index.node.js"

const root = path.resolve(import.meta.dirname, "..")
const blogDir = path.join(root, "content", "blog")

const COLORS = { cream: "#f8f5f3", creamDeep: "#efe9e3", rule: "#e4ddd6", ink: "#242424", muted: "#6b6460", black: "#000000", teal: "#087a68", white: "#ffffff" }
const font = (weight) => ({ name: "Inter", data: fs.readFileSync(path.join(root, "scripts", "fonts", `Inter-${weight}.ttf`)), weight, style: "normal" })
const FONTS = [font(500), font(700), font(800)]
const LOGO = `data:image/png;base64,${fs.readFileSync(path.join(root, "public", "brand", "web", "logo-mark.png")).toString("base64")}`

/** A Satori node: the same shape React elements have, without JSX. */
const h = (type, style, children, props = {}) => ({ type, props: { style: { display: "flex", ...style }, children, ...props } })

/** Title size by length, so long titles still fit three lines. */
const titleSize = (title) => (title.length > 64 ? 52 : title.length > 46 ? 58 : 66)

function document(label) {
  const line = (width) => h("div", { width, height: 10, background: COLORS.rule })
  return h("div", { position: "relative", width: 230, height: 300, background: COLORS.white, flexDirection: "column", padding: "52px 28px 28px", gap: 14 }, [
    line(174),
    line(150),
    line(174),
    line(120),
    line(160),
    // The signature: a teal stroke on a line, the act the product is about.
    h("div", { marginTop: "auto", flexDirection: "column", gap: 8 }, [
      h("div", { width: 120, height: 6, background: COLORS.teal }),
      h("div", { width: 174, height: 2, background: COLORS.ink }),
    ]),
    // The post's tag, overlapping the sheet's corner.
    h("div", { position: "absolute", top: -22, left: -22, background: COLORS.teal, color: COLORS.white, padding: "10px 18px", fontSize: 30, fontWeight: 800, letterSpacing: "-0.02em" }, label),
  ])
}

function cover({ title, category, label }) {
  return h("div", { width: "100%", height: "100%", background: COLORS.cream, fontFamily: "Inter" }, [
    h("div", { flex: 1, flexDirection: "column", justifyContent: "space-between", padding: "64px 56px 56px 72px" }, [
      // Sentence case: a tracked-out uppercase label reads as template chrome.
      h("div", { alignItems: "center", gap: 14, fontSize: 24, fontWeight: 700, color: COLORS.muted }, [
        h("div", { width: 14, height: 14, background: COLORS.teal }),
        category,
      ]),
      h("div", { fontSize: titleSize(title), fontWeight: 800, color: COLORS.ink, letterSpacing: "-0.035em", lineHeight: 1.08, maxWidth: 700 }, title),
      h("div", { alignItems: "center", gap: 14 }, [
        h("img", { width: 44, height: 44 }, undefined, { src: LOGO, width: 44, height: 44 }),
        h("div", { fontSize: 30, fontWeight: 700, color: COLORS.ink, letterSpacing: "-0.02em" }, "Salsox"),
      ]),
    ]),
    h("div", { width: 380, height: "100%", background: COLORS.black, alignItems: "center", justifyContent: "center" }, [document(label)]),
  ])
}

const only = new Set(process.argv.slice(2))
const written = []
for (const file of fs.readdirSync(blogDir).filter((f) => /\.mdx?$/.test(f)).sort()) {
  const slug = file.replace(/\.mdx?$/, "")
  if (only.size && !only.has(slug)) continue
  const { data } = matter(fs.readFileSync(path.join(blogDir, file), "utf8"))
  if (!data.cover || data.draft) continue
  if (!String(data.cover).startsWith("/blog/covers/")) continue // a hand-made cover elsewhere is left alone
  const title = String(data.coverTitle ?? data.title).replaceAll("{site}", "Salsox")
  const res = new ImageResponse(cover({ title, category: String(data.category), label: String(data.coverLabel ?? "PDF") }), { width: 1200, height: 630, fonts: FONTS })
  const out = path.join(root, "public", String(data.cover).replace(/^\/+/, ""))
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, Buffer.from(await res.arrayBuffer()))
  written.push(path.relative(root, out))
}
console.log(written.length ? `wrote ${written.length}: ${written.join(", ")}` : "no posts with a /blog/covers/ cover")
