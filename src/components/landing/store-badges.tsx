import { cn } from "@/lib/utils"

/**
 * The official "Download on the App Store" and "Get it on Google Play"
 * badges in the footer.
 *
 * The artwork is Apple's and Google's own, unmodified, served from
 * public/badges: Apple's SVG from developer.apple.com's badge resources, and
 * Google's PNG from the Google Play badge generator.
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
  const badges = [
    // Apple's 119.66x40 SVG at 36px tall: 108x36.
    { key: "app-store", href: appStore, alt: labels.appStore, src: "/badges/app-store-badge.svg", width: 108, height: 36, box: "h-9 w-[108px]", className: "h-9 w-[108px]" },
    // Google's 646x250 PNG at 53.6px tall is 138.4 wide; minus 8.8px of
    // clear space each side it shows 121x36.
    { key: "google-play", href: playStore, alt: labels.playStore, src: "/badges/google-play-badge.png", width: 138, height: 54, box: "h-9 w-[121px]", className: "-m-[8.8px] h-[53.6px] w-[138.4px] max-w-none" },
  ]
  const anyInert = badges.some((b) => !b.href)

  return (
    // One unit: the label, then the badges, vertically centred on one line
    // (the label wraps above them on a narrow phone).
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      {anyInert && <p className="text-sm font-medium text-[var(--footer-muted)]">{labels.comingSoon}</p>}
      <ul className="flex items-center gap-2">
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
                // Inert: no link, and the alt text says it is not available yet.
                <span className="flex opacity-70">
                  {img}
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
