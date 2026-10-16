import { siFacebook, siInstagram, siTiktok, siX, siYoutube } from "simple-icons"
import { LinkedinIcon } from "@/components/icons/linkedin"
import { cn } from "@/lib/utils"

/**
 * The footer's social icons: YouTube, Instagram, TikTok, Facebook, LinkedIn
 * and X, each in its brand colour on a white tile, so the black-glyph brands
 * (X, TikTok) stay visible on the footer's black background.
 *
 * The glyphs are the brands' own marks from the `simple-icons` package (its
 * path data and its listed brand hex), except LinkedIn: LinkedIn asked for
 * its mark to be removed from simple-icons, so LinkedIn uses the mark this
 * site already had (src/components/icons/linkedin.tsx), in LinkedIn's
 * published brand blue.
 *
 * Every icon is always shown. One whose profile URL is configured
 * (src/config/site.ts, NEXT_PUBLIC_*_URL) is a link; one that is not yet set
 * stays visible but inert: not a link, not focusable, and announced as
 * coming soon, so it never sends anyone to a page that does not exist.
 *
 * Motion: a linked tile lifts slightly on hover with a CSS transition, the
 * public pages' documented exception to framer-motion (no animation library
 * on their first load); off under prefers-reduced-motion.
 */

export type SocialNetwork = "youtube" | "instagram" | "tiktok" | "facebook" | "linkedin" | "x"

const GLYPHS: Record<Exclude<SocialNetwork, "linkedin">, { path: string; hex: string }> = {
  youtube: { path: siYoutube.path, hex: siYoutube.hex },
  instagram: { path: siInstagram.path, hex: siInstagram.hex },
  tiktok: { path: siTiktok.path, hex: siTiktok.hex },
  facebook: { path: siFacebook.path, hex: siFacebook.hex },
  x: { path: siX.path, hex: siX.hex },
}

export const SOCIAL_ORDER: SocialNetwork[] = ["youtube", "instagram", "tiktok", "facebook", "linkedin", "x"]

const TILE = "flex h-9 w-9 items-center justify-center bg-white"

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
        // LinkedIn in its published brand blue, #0A66C2.
        const glyph =
          network === "linkedin" ? (
            <LinkedinIcon className="h-[18px] w-[18px] text-[#0A66C2]" />
          ) : (
            <svg viewBox="0 0 24 24" width="18" height="18" fill={`#${GLYPHS[network].hex}`} aria-hidden="true">
              <path d={GLYPHS[network].path} />
            </svg>
          )
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
                {glyph}
              </a>
            ) : (
              <span role="img" aria-label={soonLabel(labels[network])} title={soonLabel(labels[network])} className={TILE}>
                {glyph}
              </span>
            )}
          </li>
        )
      })}
    </ul>
  )
}
