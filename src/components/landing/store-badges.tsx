import { cn } from "@/lib/utils"

/**
 * The official "Download on the App Store" and "Get it on Google Play"
 * badges in the footer.
 *
 * App Store: Apple's official flat badge, the SVG downloaded from
 * developer.apple.com into public/badges/. A vector, so it is sharp at any
 * size and has no background to remove; it is drawn at 36px tall, 108x36.
 * The supplied public/brand/badge-app-store.jpg was a 3D render, not Apple's
 * badge, and is no longer used (the file is kept).
 *
 * Google Play: the supplied public/brand/badge-google-play.jpg, cut from its
 * white background by scripts/brand-web-assets.mjs to a 108px-tall copy (3x
 * the 36px it is drawn at), 120x36.
 *
 * Size and layout follow the reference footer (signeasy.com, measured with
 * Playwright): a short label, then the two badges on one line at 36px tall,
 * the App Store badge 108x36 and Google Play 121x36. Google's PNG is 646x250
 * with 41px of clear space on every side around 564x168 of artwork, so it is
 * drawn at 53.6px tall inside a 121x36 window that crops exactly that space,
 * and both badges share one box height and baseline.
 *
 * There is no app yet. Until a store URL is configured (src/config/site.ts,
 * NEXT_PUBLIC_APP_STORE_URL / NEXT_PUBLIC_PLAY_STORE_URL) a badge is an inert
 * placeholder: not a link, dimmed, and followed by a visible "coming soon"
 * note, so the footer never tells a visitor an app is available to download.
 * Once a URL is set, that badge becomes a normal link to its listing, which
 * is the only use Apple's and Google's badge guidelines allow.
 *
 * Motion: a linked badge brightens on hover with a CSS transition, the
 * public pages' documented exception to framer-motion; off under
 * prefers-reduced-motion.
 */
export function StoreBadges({
  appStore,
  playStore,
  labels,
}: {
  appStore: string | null
  playStore: string | null
  labels: { appStore: string; playStore: string; comingSoon: string }
}) {
  // Were 40px (Apple) and an estimated 58px PNG with -9px margins (Google),
  // listed above their "coming soon" note.
  // Were Apple's SVG (/badges/app-store-badge.svg, 108x36) and Google's PNG
  // (/badges/google-play-badge.png, drawn at 53.6px with its clear space
  // cropped to 121x36). Now the supplied badges in public/brand/, served as
  // the trimmed 108px-tall copies scripts/brand-web-assets.mjs makes (3x the
  // 36px they are drawn at): 127x36 and 120x36.
  // { key: "app-store", ..., src: "/badges/app-store-badge.svg", width: 108, height: 36, box: "h-9 w-[108px]", className: "h-9 w-[108px]" },
  // { key: "google-play", ..., src: "/badges/google-play-badge.png", width: 138, height: 54, box: "h-9 w-[121px]", className: "-m-[8.8px] h-[53.6px] w-[138.4px] max-w-none" },
  // App Store was the cut 3D render (/brand/web/badge-app-store.png, 127x36);
  // back to Apple's official SVG.
  // { key: "app-store", ..., src: "/brand/web/badge-app-store.png", width: 127, height: 36, box: "h-9 w-[127px]", className: "h-9 w-[127px]" },
  // 44px tall since the rebuild from docs/reference/salsox-homepage-live.html,
  // whose badge boxes are 148x44: 132x44 and 147x44 here (were 108x36 and
  // 120x36). Apple's is a vector; Google's PNG is 108px tall, 2.5x this.
  // { key: "app-store", ..., width: 108, height: 36, box: "h-9 w-[108px]", className: "h-9 w-[108px]" },
  // { key: "google-play", ..., width: 120, height: 36, box: "h-9 w-[120px]", className: "h-9 w-[120px]" },
  const badges = [
    { key: "app-store", href: appStore, alt: labels.appStore, src: "/badges/app-store-badge.svg", width: 132, height: 44, box: "h-11 w-[132px]", className: "h-11 w-[132px]" },
    { key: "google-play", href: playStore, alt: labels.playStore, src: "/brand/web/badge-google-play.png", width: 147, height: 44, box: "h-11 w-[147px]", className: "h-11 w-[147px]" },
  ]
  const anyInert = badges.some((b) => !b.href)

  return (
    // The badges stacked 12px apart as in the reference, then the "coming
    // soon" note under them (it was a label before them, on one line).
    <div>
      <ul className="flex flex-col items-start gap-3">
        {badges.map((b) => {
          // An inert badge says so in its alt text, not only in the note below.
          // eslint-disable-next-line @next/next/no-img-element -- static brand artwork, served as is
          const img = <img src={b.src} alt={b.href ? b.alt : `${b.alt} (${labels.comingSoon})`} width={b.width} height={b.height} className={b.className} />
          return (
            <li key={b.key} className={cn("flex overflow-hidden", b.box)}>
              {b.href ? (
                <a
                  href={b.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex transition-opacity hover:opacity-85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--footer-accent)] motion-reduce:transition-none"
                >
                  {img}
                </a>
              ) : (
                // Inert: no link, and the alt text says it is not available
                // yet. Full strength, solid black (was opacity-70): the note
                // under the badges already says they are not live.
                <span className="flex">
                  {img}
                </span>
              )}
            </li>
          )
        })}
      </ul>
      {anyInert && <p className="mt-3 text-[13px] text-[var(--footer-muted)]">{labels.comingSoon}</p>}
    </div>
  )
}
