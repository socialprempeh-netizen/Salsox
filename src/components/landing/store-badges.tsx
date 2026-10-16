/**
 * The official "Download on the App Store" and "Get it on Google Play"
 * badges in the footer.
 *
 * The artwork is Apple's and Google's own, unmodified, served from
 * public/badges: Apple's SVG from developer.apple.com's badge resources, and
 * Google's PNG from the Google Play badge generator (which ships with clear
 * space around the badge; the negative margin below trims it to the same
 * visual height as Apple's).
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
  const badges = [
    // Apple's badge is 120x40 at its native size.
    { key: "app-store", href: appStore, alt: labels.appStore, src: "/badges/app-store-badge.svg", width: 120, height: 40, className: "h-10 w-auto" },
    // Google's 646x250 artwork includes clear space; at 58px tall the badge
    // itself is about 40px, and the negative margin removes the space.
    { key: "google-play", href: playStore, alt: labels.playStore, src: "/badges/google-play-badge.png", width: 150, height: 58, className: "-my-[9px] -mx-[9px] h-[58px] w-auto" },
  ]
  const anyInert = badges.some((b) => !b.href)

  return (
    <div>
      <ul className="flex flex-wrap items-center gap-3">
        {badges.map((b) => {
          // An inert badge says so in its alt text, not only in the note below.
          // eslint-disable-next-line @next/next/no-img-element -- static brand artwork, served as is
          const img = <img src={b.src} alt={b.href ? b.alt : `${b.alt} (${labels.comingSoon})`} width={b.width} height={b.height} className={b.className} />
          return (
            <li key={b.key} className="flex">
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
                <span className="flex opacity-60">
                  {img}
                </span>
              )}
            </li>
          )
        })}
      </ul>
      {anyInert && <p className="mt-2 text-sm text-[var(--footer-muted)]">{labels.comingSoon}</p>}
    </div>
  )
}
