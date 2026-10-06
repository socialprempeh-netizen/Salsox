import { ImageResponse } from "next/og"
import { siteConfig } from "@/config/site"
import { ogBrand } from "@/config/brand"

/**
 * The social card (1200x630 PNG) for a registry page, in the same look as
 * the blog's per-post cards: a label, the page's H1, and the site name. Each
 * dynamic SEO route has an `opengraph-image.tsx` that calls this, so a shared
 * link previews the page it points to instead of the generic site card.
 *
 * Generated at build for every static page, so it costs nothing per request.
 */
export const OG_SIZE = { width: 1200, height: 630 }

export function ogCard({ eyebrow, title }: { eyebrow: string; title: string }) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "80px",
          backgroundColor: "#0a0a0a",
          backgroundImage: `radial-gradient(circle at 80% 0%, ${ogBrand.glow}, transparent 55%)`,
          color: "#f8fafc",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 30, color: "#cbd5e1" }}>
          <div style={{ width: 18, height: 18, backgroundImage: ogBrand.bar }} />
          {eyebrow}
        </div>
        <div style={{ fontSize: title.length > 55 ? 60 : 72, fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1.1 }}>{title}</div>
        <div style={{ display: "flex", fontSize: 32, color: "#94a3b8" }}>{siteConfig.name}</div>
      </div>
    ),
    OG_SIZE
  )
}
