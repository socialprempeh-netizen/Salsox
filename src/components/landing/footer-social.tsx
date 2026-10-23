// Was: import { siFacebook, siInstagram, siTiktok, siX, siYoutube } from "simple-icons"
// The supplied brand images replaced the drawn marks; only X is still drawn.
import { siX } from "simple-icons"
// import { LinkedinIcon } from "@/components/icons/linkedin"
import { cn } from "@/lib/utils"

/**
 * The footer's social icons: YouTube, TikTok, Facebook, LinkedIn, Reddit
 * and X. (Instagram and Pinterest were removed: no profiles there.)
 *
 * Each is the brand's own artwork from public/brand/ (icon-*.png and
 * icon-youtube.jpg), served from the trimmed, background-free 78px copies in
 * public/brand/web/ that scripts/brand-web-assets.mjs makes, 3x the 26px they
 * are drawn at, so they stay crisp without shipping the 1600px sources.
 * These are full-colour badges with their own white glyphs, so they fill
 * their 26px tile edge to edge, the 1:1 icon-to-tile ratio measured on the
 * reference footer (signeasy.com), with no white backing.
 *
 * X has no supplied image, so it stays the X mark from the `simple-icons`
 * package, drawn white on a black disc to sit with the circular badges (the
 * TikTok badge is the same black disc).
 *
 * Every icon is always shown. One whose profile URL is configured
 * (src/config/site.ts, NEXT_PUBLIC_*_URL) is a link; one that is not yet set
 * stays visible but inert: not a link, not focusable, and announced as
 * coming soon, so it never sends anyone to a page that does not exist.
 *
 * Motion: a linked icon lifts slightly on hover with a CSS transition, the
 * public pages' documented exception to framer-motion (no animation library
 * on their first load); off under prefers-reduced-motion.
 */

export type SocialNetwork = "youtube" | "tiktok" | "facebook" | "linkedin" | "reddit" | "x"

// Was: brand-coloured simple-icons glyphs (24px) on a 26px white tile, the
// white needed behind the marks' cut-outs on a black footer:
// const GLYPHS = { youtube: siYoutube, instagram: siInstagram, tiktok: siTiktok, facebook: siFacebook, x: siX }
// const TILE = "flex h-[26px] w-[26px] items-center justify-center bg-white"
// with LinkedIn as <LinkedinIcon className="h-6 w-6 text-[#0A66C2]" />.
const IMAGES: Record<Exclude<SocialNetwork, "x">, string> = {
  youtube: "/brand/web/icon-youtube.png",
  tiktok: "/brand/web/icon-tiktok.png",
  facebook: "/brand/web/icon-facebook.png",
  linkedin: "/brand/web/icon-linkedin.png",
  reddit: "/brand/web/icon-reddit.png",
}

export const SOCIAL_ORDER: SocialNetwork[] = ["youtube", "tiktok", "facebook", "linkedin", "reddit", "x"]

// Was 26px (the reference footer's size): too small to read as the brands'
// icons at a glance, so the homepage redesign drew them at 36px. The 78px
// artwork still covers 2x screens.
// const TILE = "flex h-[26px] w-[26px] items-center justify-center"
// Then 32px, the reference build's icon size (docs/reference/
// salsox-homepage-live.html), 8px apart so all seven fit one row of the
// footer's brand column (the reference has five, 12px apart). Was h-9 w-9.
const TILE = "flex h-8 w-8 items-center justify-center"

function Mark({ network }: { network: SocialNetwork }) {
  if (network === "x") {
    return (
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black ring-1 ring-white/25">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="#ffffff" aria-hidden="true">
          <path d={siX.path} />
        </svg>
      </span>
    )
  }
  // eslint-disable-next-line @next/next/no-img-element -- small static brand artwork, already sized
  return <img src={IMAGES[network]} alt="" width={32} height={32} className="h-8 w-8" />
}

export function FooterSocial({
  links,
  labels,
  soonLabel,
}: {
  links: Record<SocialNetwork, string | null>
  /** The network names, for the accessible labels. */
  labels: Record<SocialNetwork, string>
  /** "{name}: coming soon", already translated, per network. */
  soonLabel: (name: string) => string
}) {
  return (
    <ul className="flex flex-wrap items-center gap-2">
      {SOCIAL_ORDER.map((network) => {
        const href = links[network]
        return (
          <li key={network}>
            {href ? (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={labels[network]}
                className={cn(
                  TILE,
                  "transition-transform duration-150 hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--footer-accent)] motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                )}
              >
                <Mark network={network} />
              </a>
            ) : (
              <span role="img" aria-label={soonLabel(labels[network])} title={soonLabel(labels[network])} className={TILE}>
                <Mark network={network} />
              </span>
            )}
          </li>
        )
      })}
    </ul>
  )
}
