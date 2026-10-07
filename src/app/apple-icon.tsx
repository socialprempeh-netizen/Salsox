import { ImageResponse } from "next/og"
import { brand, neutralMarkPath } from "@/config/brand"
import { isKitSite } from "@/config/kit"
import { markImageSrc } from "@/lib/brand-mark"

/**
 * The home-screen icon (apple-touch-icon), 180px, for a phone that saves the
 * site to its home screen. It is the deployment's mark (NEXT_PUBLIC_BRAND_MARK)
 * on a white square, since iOS fills transparency with black and rounds the
 * corners itself. Without a mark it is the favicon's tile, scaled up, so the
 * neutral kit still gets an icon that matches its tab.
 */
export const size = { width: 180, height: 180 }
export const contentType = "image/png"

export default function AppleIcon() {
  const mark = isKitSite ? null : markImageSrc(brand.mark)
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#ffffff" }}>
        {mark ? (
          // eslint-disable-next-line @next/next/no-img-element -- Satori renders a plain img
          <img src={mark} alt="" width={148} height={148} />
        ) : (
          <div style={{ width: 148, height: 148, display: "flex", alignItems: "center", justifyContent: "center", background: brand.primary ?? (isKitSite ? "#2563eb" : "#242424") }}>
            <svg width="84" height="84" viewBox="0 0 24 24">
              <path d={neutralMarkPath} fill="#ffffff" fillRule="evenodd" />
            </svg>
          </div>
        )}
      </div>
    ),
    size
  )
}
