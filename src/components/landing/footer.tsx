import Link from "next/link"
import { GithubIcon } from "@/components/icons/github"
// LinkedIn's mark is drawn by FooterSocial now, with the other networks.
// import { LinkedinIcon } from "@/components/icons/linkedin"
import { FooterSocial } from "@/components/landing/footer-social"
import { StoreBadges } from "@/components/landing/store-badges"
import { PoweredBy } from "@/components/powered-by"
import { ContactDialog } from "@/components/landing/contact-dialog"
import { ConsentSettingsButton } from "@/components/analytics/consent-banner"
import { gaMeasurementId } from "@/components/analytics/google-analytics"
import { Logo } from "@/components/logo"
import { LogoLink } from "@/components/landing/logo-link"
import { siteConfig } from "@/config/site"
// The footer awaits the navigation data now, so it reads messages the async way.
// import { useTranslations } from "next-intl"
import { getTranslations } from "next-intl/server"
import { isKitSite } from "@/config/kit"
import { landingPalette } from "@/config/brand"
// Both moved into getSiteNav(), which the navbar shares.
// import { hasPosts } from "@/lib/blog"
// The "Try it free" link left with the rebuild from the reference (no
// Product-column CTA there); the old footer, commented below, still names it.
// import { footerTryLink } from "@/lib/landing-cta"
// import { getPages } from "@/lib/seo/pages"
import { getSiteNav } from "@/components/landing/site-nav-data"
import { cn } from "@/lib/utils"

// Replaced by the X mark from simple-icons, in FooterSocial (footer-social.tsx).
// function XIcon() {
//   return (
//     <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
//       <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
//     </svg>
//   )
// }

/**
 * The footer's colours, read from the reference footer's computed CSS (the
 * SignEasy footer, inspected with Playwright at 1440px): background #000000,
 * column headings #b2b2b2, link text #ffffff, bottom bar #00aaf9. The footer
 * is dark in both themes, like the reference, so these do not switch with
 * the theme. The bar's text is black, not the reference's white: white on
 * #00aaf9 is about 2.6:1, below the 4.5:1 small text needs.
 *
 * Spacing is deliberately tighter than the reference (60px top padding,
 * 40px column and row gaps, 19px under headings, 12px between links, a
 * 139px bar): 40px, 20px and 28px, 12px, 8px and a 64px bar here.
 */
// Replaced on the product's site by the palette audit (landingPalette in
// src/config/brand.ts): black #0F0F19 behind, white links, headings and
// notes in a 65% white (grey #6B7280 is under 4:1 on the black), bright teal
// for hover and focus, and the bottom bar deep purple with white text. The
// bar has its own variable now, since the purple is far too dark to be the
// hover colour as the cyan was. The kit's site keeps the values above.
const KIT_FOOTER_COLORS = {
  "--footer-bg": "#000000",
  "--footer-heading": "#b2b2b2",
  "--footer-link": "#ffffff",
  "--footer-muted": "#b2b2b2",
  "--footer-accent": "#00aaf9",
  "--footer-bar": "#00aaf9",
  "--footer-bar-text": "#000000",
  "--footer-link-hover": "#00aaf9",
  "--footer-bar-border": "transparent",
} as React.CSSProperties
// Then from the reference build (docs/reference/salsox-homepage-live.html),
// read from its CSS: background #0F0F1A, links and notes in 60% white and
// white on hover, the bottom bar #4C1D95 with 60% white text under a 10%
// white rule. One departure: its headings are 40% white, about 3.8:1 on
// that black, under the 4.5:1 small text needs (e2e/accessibility.spec.ts
// fails it), so they are 50% white here (5.3:1). Was, from the palette audit:
//   "--footer-bg": landingPalette.ink,
//   "--footer-heading" and "--footer-muted": 65% white mixed into the ink,
//   "--footer-link": white, "--footer-accent": landingPalette.teal,
//   "--footer-bar": landingPalette.purple, "--footer-bar-text": white.
const FOOTER_COLORS = (landingPalette
  ? {
      "--footer-bg": "#0F0F1A",
      "--footer-heading": "rgb(255 255 255 / 0.5)",
      "--footer-link": "rgb(255 255 255 / 0.6)",
      "--footer-link-hover": "#FFFFFF",
      "--footer-muted": "rgb(255 255 255 / 0.6)",
      "--footer-accent": landingPalette.teal,
      "--footer-bar": landingPalette.purple,
      "--footer-bar-text": "rgb(255 255 255 / 0.6)",
      "--footer-bar-border": "rgb(255 255 255 / 0.1)",
    }
  : KIT_FOOTER_COLORS) as React.CSSProperties

// Type scale raised (was text-sm headings and links, space-y-2) to the size
// the established e-signature sites use in their footers: the footer is a
// map of the site, and at 14px it read as fine print.
// Then the reference build's: an 11px bold heading with 0.1em tracking, the
// list 16px under it, rows 24px tall and 10px apart. Was mb-3, tracking-wider,
// space-y-2 and 13px on the list.
function FooterColumn({ heading, children, className }: { heading: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <h4 className="text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--footer-heading)]">{heading}</h4>
      <ul className="mt-4 space-y-2.5">{children}</ul>
    </div>
  )
}

/** A footer link: 13px, 60% white, white on hover (the reference's values). */
const FOOTER_LINK = "text-[13px] text-[var(--footer-link)] transition-colors hover:text-[var(--footer-link-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--footer-accent)]"

// Unused since the rebuild from the reference (Footer below): the "Why"
// group is one Product column now. Was:
// /**
//  * The "Why" group in two side-by-side lists under one heading, each with its
//  * own subheading: what the product does (the solution pages) and who it is
//  * for (the industry, team and audience pages). As one column it ran to more
//  * than thirty links.
//  *
//  * "Who it's for" has twenty pages, so from sm up it is itself two balanced
//  * columns (CSS columns, alphabetical order kept, 11 and 10 with the hub
//  * link) under its one subheading; as one list it towered over every other
//  * column. The group spans three grid tracks from sm (what you can do, then
//  * who it's for over two). On a phone it spans the full two-track row and
//  * "Who it's for" is a single list beside "What you can do": three lists in
//  * 312px would leave each too narrow to read.
//  */
// function SplitFooterColumn({ heading, parts, footer }: { heading: string; parts: { heading: string; links: { href: string; label: string }[] }[]; footer: { href: string; label: string } }) {
//   return (
//     // Was col-span-2 at every width, its two lists in grid-cols-2.
//     <div className="col-span-2 min-w-0 sm:col-span-3">
//       <h4 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-[var(--footer-heading)]">{heading}</h4>
//       <div className="grid grid-cols-2 gap-x-5 gap-y-7 sm:grid-cols-3">
//         {parts.map((part, i) => (
//           <div key={part.heading} className={cn("min-w-0", i === parts.length - 1 && "sm:col-span-2")}>
//             <h5 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-[var(--footer-heading)]">{part.heading}</h5>
//             <ul className={cn("space-y-2 text-[13px] text-[var(--footer-link)]", i === parts.length - 1 && "sm:columns-2 sm:gap-x-5")}>
//               {part.links.map((link) => (
//                 <FooterLink key={link.href} href={link.href}>{link.label}</FooterLink>
//               ))}
//               {/* The hub link closes the second list, as it closes every group. */}
//               {i === parts.length - 1 && <FooterLink href={footer.href}>{footer.label}</FooterLink>}
//             </ul>
//           </div>
//         ))}
//       </div>
//     </div>
//   )
// }

function FooterLink({ href, external, children }: { href: string; external?: boolean; children: React.ReactNode }) {
  // Was hover:text-foreground, then the bar's accent on hover; now
  // FOOTER_LINK, and a 24px row as in the reference.
  const className = FOOTER_LINK
  return (
    <li className="break-inside-avoid leading-6">
      {external ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className={className}>{children}</a>
      ) : (
        <Link href={href} className={className}>{children}</Link>
      )}
    </li>
  )
}

/**
 * The footer, rebuilt from the reference build (docs/reference/
 * salsox-homepage-live.html), every value read from that file's own CSS at
 * 1440px:
 *
 * - one row of five tracks from lg, `1.2fr 0.8fr 0.8fr 0.8fr 1fr`, 40px gaps:
 *   the brand column, then Product, Why us, Free tools, and Resources and
 *   company; two columns on a phone, the brand spanning both;
 * - 80px top and bottom padding from lg (64px below), 1280px wide with 32px
 *   sides (24px on a phone);
 * - headings 11px bold capitals, 0.1em tracking; links 13px in 60% white,
 *   white on hover, 10px apart on 24px rows, 16px under the heading;
 * - in the brand column: the logo, a 13px line in 60% white (max 260px), the
 *   store badges stacked 12px apart, then the social icons 32px below;
 * - the bottom bar in the brand purple under a 10% white rule, 16px padding,
 *   12px text in 60% white.
 *
 * Each column lists six links and closes with its hub, about the reference's
 * seven rows, so the footer keeps its compact height; the hubs list the rest
 * (every industry page is one click away under "All use cases").
 *
 * Square corners, per the site-wide rule, where the reference rounds them.
 */
const LINKS_PER_COLUMN = 6

export async function Footer() {
  const [t, nav] = await Promise.all([getTranslations("footer"), getSiteNav()])
  const social = {
    youtube: t("social.youtube"),
    tiktok: t("social.tiktok"),
    facebook: t("social.facebook"),
    reddit: t("social.reddit"),
    linkedin: t("linkedin"),
    x: t("social.x"),
  }
  const orgUrl = siteConfig.links.githubOrg ?? siteConfig.links.github
  const group = (id: string) => nav.groups.find((g) => g.id === id)
  const links = (id: string, column?: number) => {
    const g = group(id)
    const all = column === undefined ? (g?.columns.flatMap((c) => c.links) ?? []) : (g?.columns[column]?.links ?? [])
    // Home-page anchors (/#features, /#faq) are not pages to list here.
    return all.filter((link) => !link.href.startsWith("/#")).slice(0, LINKS_PER_COLUMN)
  }
  const why = group("why")
  const tools = group("tools")
  const compare = group("compare")
  const resources = group("resources")

  return (
    <footer style={FOOTER_COLORS} className="bg-[var(--footer-bg)] text-[var(--footer-link)]">
      <div className="mx-auto max-w-[1280px] px-6 py-16 lg:px-8 lg:py-20">
        <div className="grid grid-cols-2 gap-10 lg:grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr_1fr]">
          <div className="col-span-2 lg:col-span-1">
            <LogoLink className="flex items-center gap-2">
              <Logo markClassName="h-8 w-8" wordmarkClassName="text-[22px] font-bold text-white" />
            </LogoLink>
            <p className="mt-4 max-w-[260px] text-[13px] leading-relaxed text-[var(--footer-muted)]">
              {isKitSite ? t("blurb", { tagline: siteConfig.tagline }) : siteConfig.description}
            </p>
            {/* The badges stacked, then "coming soon" under them (it was
                above), then the social icons. */}
            <div className="mt-6">
              <StoreBadges
                appStore={siteConfig.links.appStore}
                playStore={siteConfig.links.playStore}
                labels={{ appStore: t("appStoreBadge"), playStore: t("playStoreBadge"), comingSoon: t("appsComingSoon") }}
              />
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              {/* The kit's own site keeps its GitHub link, beside the icons. */}
              {isKitSite && orgUrl && (
                <a
                  href={orgUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={t("github")}
                  className="flex h-8 w-8 items-center justify-center bg-white/10 text-white transition-colors hover:bg-white/15"
                >
                  <GithubIcon />
                </a>
              )}
              <FooterSocial
                links={{
                  youtube: siteConfig.links.youtube,
                  tiktok: siteConfig.links.tiktok,
                  facebook: siteConfig.links.facebook,
                  linkedin: siteConfig.links.linkedin,
                  reddit: siteConfig.links.reddit,
                  x: siteConfig.links.x,
                }}
                labels={social}
                soonLabel={(name) => t("socialSoon", { name })}
              />
            </div>
          </div>

          {/* What the product does: the solution pages, then the use-case
              hub, which lists the industry and team pages. */}
          <FooterColumn heading={t("product")}>
            {links("why", 0).map((link) => <FooterLink key={link.href} href={link.href}>{link.label}</FooterLink>)}
            {why && <FooterLink href={why.footer.href}>{why.footer.label}</FooterLink>}
          </FooterColumn>

          {/* Why choose it: the comparisons, then pricing and their hub. */}
          <FooterColumn heading={why?.label ?? t("compare")}>
            {links("compare").slice(0, LINKS_PER_COLUMN - 1).map((link) => <FooterLink key={link.href} href={link.href}>{link.label}</FooterLink>)}
            <FooterLink href={nav.pricing.href}>{t("pricing")}</FooterLink>
            {compare && <FooterLink href={compare.footer.href}>{compare.footer.label}</FooterLink>}
          </FooterColumn>

          <FooterColumn heading={tools?.label ?? t("freeTools")}>
            {links("tools").map((link) => <FooterLink key={link.href} href={link.href}>{link.label}</FooterLink>)}
            {tools && <FooterLink href={tools.footer.href}>{tools.footer.label}</FooterLink>}
          </FooterColumn>

          {/* Resources, then the company pages, the legal pages sharing one
              row as in the reference. */}
          <FooterColumn heading={t("resourcesCompany")}>
            {(resources?.columns.flatMap((c) => c.links) ?? []).filter((link) => !link.href.startsWith("/#")).map((link) => (
              <FooterLink key={link.href} href={link.href}>{link.label}</FooterLink>
            ))}
            <FooterLink href="/about">{t("aboutLink")}</FooterLink>
            {/* The kit's own site has the copyable-email dialog instead of
                the contact form (see the earlier footer below). */}
            {isKitSite ? (
              <li className="leading-6">
                <ContactDialog
                  trigger={
                    <button type="button" className={FOOTER_LINK}>
                      {t("contact")}
                    </button>
                  }
                />
              </li>
            ) : (
              <FooterLink href="/contact">{t("contact")}</FooterLink>
            )}
            <li className="leading-6">
              {/* Short names, so the three share one row like the
                  reference's "Privacy • Terms"; the full names wrapped. */}
              <Link href="/privacy" className={FOOTER_LINK}>{t("privacyShort")}</Link>
              {!isKitSite && (
                <>
                  <span aria-hidden="true" className="text-[13px] text-[var(--footer-link)]"> · </span>
                  <Link href="/terms" className={FOOTER_LINK}>{t("termsShort")}</Link>
                </>
              )}
              <span aria-hidden="true" className="text-[13px] text-[var(--footer-link)]"> · </span>
              <Link href={isKitSite ? "/privacy#cookies" : "/cookies"} className={FOOTER_LINK}>{t("cookiesShort")}</Link>
            </li>
            {/* Where a visitor changes their analytics choice; only on a
                deployment that runs GA, the one thing that asks. */}
            {gaMeasurementId() && (
              <li className="leading-6">
                <ConsentSettingsButton className={FOOTER_LINK} />
              </li>
            )}
          </FooterColumn>
        </div>
      </div>

      <div className="border-t border-[var(--footer-bar-border)] bg-[var(--footer-bar)]">
        <div className="mx-auto flex max-w-[1280px] flex-col items-center justify-between gap-2 px-6 py-4 text-[12px] text-[var(--footer-bar-text)] sm:flex-row lg:px-8">
          <p>{t("copyright", { year: new Date().getFullYear(), site: siteConfig.name })}</p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <PoweredBy />
            <Link href="/changelog" className="underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
              v{siteConfig.version}
            </Link>
            {isKitSite && (
              <>
                <span aria-hidden="true" className="h-3 w-px bg-white/20" />
                <span>{t("license")}</span>
              </>
            )}
          </div>
        </div>
      </div>
    </footer>
  )
}

// The columns before the regrouping (see the comment where they were):
//         {/* Two columns of links on a phone instead of one long stack (was
//             flex-col), now that the footer also lists the free tools and the
//             comparisons; one row from md, wrapping when it runs out of room. */}
//         <div className="grid grid-cols-2 gap-x-6 gap-y-10 md:flex md:flex-wrap md:justify-between md:gap-8">
//           <div className="col-span-2 md:col-span-1">
//             <LogoLink className="flex items-center gap-2">
//               <Logo wordmarkClassName="text-base font-bold" />
//             </LogoLink>
//             <p className="mt-3 max-w-xs text-sm text-muted-foreground">
//               {isKitSite ? t("blurb", { tagline: siteConfig.tagline }) : siteConfig.description}
//             </p>
//             <div className="mt-4 flex items-center gap-2">
//               {orgUrl && (
//                 <a
//                   href={orgUrl}
//                   target="_blank"
//                   rel="noopener noreferrer"
//                   aria-label={t("github")}
//                   className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
//                 >
//                   <GithubIcon />
//                 </a>
//               )}
//               {siteConfig.links.x && (
//                 <a
//                   href={siteConfig.links.x}
//                   target="_blank"
//                   rel="noopener noreferrer"
//                   aria-label="X / Twitter"
//                   className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
//                 >
//                   <XIcon />
//                 </a>
//               )}
//             </div>
//           </div>
//
//           <div>
//             <h4 className="mb-4 text-sm font-semibold text-foreground">{t("product")}</h4>
//             <ul className="space-y-2 text-sm text-muted-foreground">
//               {/* `/#` instead of bare `#`: the footer renders on every public
//                   page, but the sections only exist on the home page. */}
//               <li><Link href="/#features" className="transition-colors hover:text-foreground">{t("features")}</Link></li>
//               <li><Link href="/#pricing" className="transition-colors hover:text-foreground">{t("pricing")}</Link></li>
//               <li><Link href="/docs" className="transition-colors hover:text-foreground">{t("docs")}</Link></li>
//               {/* Hidden while the blog has no posts: see hasPosts(). */}
//               {hasPosts() && (
//                 <li><Link href="/blog" className="transition-colors hover:text-foreground">{t("blog")}</Link></li>
//               )}
//               <li><Link href="/changelog" className="transition-colors hover:text-foreground">{t("changelog")}</Link></li>
//               {/* Public check that a signed PDF is genuine: see /verify. */}
//               <li><Link href="/verify" className="transition-colors hover:text-foreground">{t("verify")}</Link></li>
//               {/* Was a literal "Demo" → /login when no demo deployment was
//                   set; see footerTryLink. */}
//               <li>
//                 <Link href={tryLink.href} className="transition-colors hover:text-foreground">
//                   {t(tryLink.label === "demo" ? "demo" : "tryFree")}
//                 </Link>
//               </li>
//             </ul>
//           </div>
//
//           <div>
//             <h4 className="mb-4 text-sm font-semibold text-foreground">{t("about")}</h4>
//             <ul className="space-y-2 text-sm text-muted-foreground">
//               <li><Link href="/about" className="transition-colors hover:text-foreground">{t("aboutLink")}</Link></li>
//               <li><Link href="/#faq" className="transition-colors hover:text-foreground">{t("faq")}</Link></li>
//               <li>
//                 {/* The kit's own site collects nothing through the site: its
//                     contact is the copyable-email dialog, as it was before the
//                     contact form existed, so the waitlist stays the only data
//                     the privacy policy has to cover. Your app links the form. */}
//                 {isKitSite ? (
//                   <ContactDialog
//                     trigger={
//                       <button type="button" className="transition-colors hover:text-foreground">
//                         {t("contact")}
//                       </button>
//                     }
//                   />
//                 ) : (
//                   <Link href="/contact" className="transition-colors hover:text-foreground">{t("contact")}</Link>
//                 )}
//               </li>
//               {isKitSite && orgUrl && (
//                 <li>
//                   <a
//                     href={orgUrl}
//                     target="_blank"
//                     rel="noopener noreferrer"
//                     className="transition-colors hover:text-foreground"
//                   >
//                     {t("openSource")}
//                   </a>
//                 </li>
//               )}
//             </ul>
//           </div>
//
//           {/* Every public page links to the free tools and the comparisons
//               from here: the internal links that make them findable
//               (src/lib/seo/pages.ts lists them). */}
//           <div>
//             <h4 className="mb-4 text-sm font-semibold text-foreground">{t("freeTools")}</h4>
//             <ul className="space-y-2 text-sm text-muted-foreground">
//               {getPages({ kind: "tool" }).map((p) => (
//                 <li key={p.path}><Link href={p.path} className="transition-colors hover:text-foreground">{p.breadcrumb}</Link></li>
//               ))}
//             </ul>
//           </div>
//
//           <div>
//             <h4 className="mb-4 text-sm font-semibold text-foreground">{t("compare")}</h4>
//             <ul className="space-y-2 text-sm text-muted-foreground">
//               {[...getPages({ kind: "comparison" }), ...getPages({ kind: "alternative" })].map((p) => (
//                 <li key={p.path}><Link href={p.path} className="transition-colors hover:text-foreground">{p.breadcrumb}</Link></li>
//               ))}
//               <li><Link href="/esignature-for" className="transition-colors hover:text-foreground">{t("useCases")}</Link></li>
//             </ul>
//           </div>
//
//           <div>
//             <h4 className="mb-4 text-sm font-semibold text-foreground">{t("legal")}</h4>
//             <ul className="space-y-2 text-sm text-muted-foreground">
//               <li><Link href="/privacy" className="transition-colors hover:text-foreground">{t("privacy")}</Link></li>
//               {/* The kit's own site sells nothing and has no accounts, so no
//                   terms; its cookie disclosure is a section of the (real)
//                   privacy policy. Your app keeps the dedicated pages. */}
//               {!isKitSite && (
//                 <li><Link href="/terms" className="transition-colors hover:text-foreground">{t("terms")}</Link></li>
//               )}
//               <li>
//                 <Link
//                   href={isKitSite ? "/privacy#cookies" : "/cookies"}
//                   className="transition-colors hover:text-foreground"
//                 >
//                   {t("cookies")}
//                 </Link>
//               </li>
//               {isKitSite && (
//                 <li>
//                   <a
//                     href={
//                       siteConfig.links.github
//                         ? `${siteConfig.links.github}/blob/main/LICENSE`
//                         : "https://opensource.org/license/mit"
//                     }
//                     target="_blank"
//                     rel="noopener noreferrer"
//                     className="transition-colors hover:text-foreground"
//                   >
//                     License
//                   </a>
//                 </li>
//               )}
//             </ul>
//           </div>
//         </div>

// Replaced by the Footer above (rebuilt from docs/reference/salsox-homepage-live.html).
// The version it replaced: a brand row with the social icons and badges
// beside it, then up to eight columns from the shared navigation data.
// export async function Footer() {
//   const [t, nav] = await Promise.all([getTranslations("footer"), getSiteNav()])
//   const social = {
//     youtube: t("social.youtube"),
//     instagram: (its "social.instagram" label, removed with the Instagram icon),
//     tiktok: t("social.tiktok"),
//     facebook: t("social.facebook"),
//     pinterest: (its "social.pinterest" label, removed with the Pinterest icon),
//     linkedin: t("linkedin"),
//     x: t("social.x"),
//   }
//   const orgUrl = siteConfig.links.githubOrg ?? siteConfig.links.github
//   const tryLink = footerTryLink(siteConfig.links.demo)
//   return (
//     // Was border-t border-border bg-muted/30 py-12: the theme's surface. Now
//     // the reference footer's black, top padding tighter than its 60px, and
//     // the bottom padding moved into the cyan bar below.
//     <footer style={FOOTER_COLORS} className="bg-[var(--footer-bg)] pt-10 text-[var(--footer-link)]">
//       {/* Wider (was max-w-6xl), like the header, for seven columns of
//           larger type. */}
//       {/* 90rem (was max-w-7xl): eight tracks now, the Why group taking three. */}
//       <div className="mx-auto max-w-[90rem] px-6 lg:px-12">
//         {/* Grouped the way the top menu is (src/lib/site-nav.ts), from the
//             same data, so the two cannot list different pages: Product, Why,
//             Free tools, Compare, Resources, Company. Was Product (with docs,
//             blog, changelog and verify mixed in), About and Legal; About and
//             Legal are now one Company column, and the help material has a
//             Resources column of its own. The old columns are kept at the
//             bottom of this file. Brand on its own row, then two columns of
//             links on a phone, three on a tablet, six on a desktop. */}
//         {/* Brand on the left; the social icons and store badges beside it
//             from lg, under it on smaller screens. */}
//         <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
//         <div className="max-w-xs">
//           <LogoLink className="flex items-center gap-2">
//             <Logo markClassName="h-9 w-9" wordmarkClassName="text-xl font-bold text-[var(--footer-link)]" />
//           </LogoLink>
//           <p className="mt-3 text-[13px] text-[var(--footer-muted)]">
//             {isKitSite ? t("blurb", { tagline: siteConfig.tagline }) : siteConfig.description}
//           </p>
//           {/* The kit's own site keeps its GitHub icon here; the product's
//               social icons are FooterSocial, beside this block. */}
//           <div className="mt-4 flex items-center gap-2 empty:hidden">
//             {orgUrl && (
//               <a
//                 href={orgUrl}
//                 target="_blank"
//                 rel="noopener noreferrer"
//                 aria-label={t("github")}
//                 className="flex h-9 w-9 items-center justify-center bg-white text-black transition-opacity hover:opacity-85"
//               >
//                 <GithubIcon />
//               </a>
//             )}
//             {/* X and LinkedIn moved into FooterSocial with the other networks.
//                 Were links here only when set, in the theme's colours, as
//                 <XIcon /> and <LinkedinIcon /> inside bordered squares. */}
//           </div>
//         </div>
//         <div className="flex flex-col gap-4 lg:items-end">
//           <FooterSocial
//             links={{
//               youtube: siteConfig.links.youtube,
//               instagram: siteConfig.links.instagram,
//               tiktok: siteConfig.links.tiktok,
//               facebook: siteConfig.links.facebook,
//               linkedin: siteConfig.links.linkedin,
//               pinterest: siteConfig.links.pinterest,
//               x: siteConfig.links.x,
//             }}
//             labels={social}
//             soonLabel={(name) => t("socialSoon", { name })}
//           />
//           <StoreBadges
//             appStore={siteConfig.links.appStore}
//             playStore={siteConfig.links.playStore}
//             labels={{ appStore: t("appStoreBadge"), playStore: t("playStoreBadge"), comingSoon: t("appsComingSoon") }}
//           />
//         </div>
//         </div>
//
//         {/* Was grid-cols-2 sm:grid-cols-3 lg:grid-cols-6, one column per
//             group. The "Why" group now spans two (SplitFooterColumn), so
//             seven tracks on a wide screen, four on a laptop, three on a
//             tablet, two on a phone; dense flow fills the cell its span leaves
//             beside Product on a phone. */}
//         {/* Gaps tighter than the reference's 40px: 20px between columns,
//             28px between rows (were gap-x-6 gap-y-10, mt-10). */}
//         {/* Was xl:grid-cols-7, when the Why group took two tracks. */}
//         <div className="mt-8 grid grid-flow-row-dense grid-cols-2 gap-x-5 gap-y-7 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8">
//           <FooterColumn heading={t("product")}>
//             {/* `/#` instead of bare `#`: the footer renders on every public
//                 page, but the sections only exist on the home page. */}
//             <FooterLink href="/#features">{t("features")}</FooterLink>
//             {/* The pricing page (was the home page's /#pricing section). */}
//             <FooterLink href={nav.pricing.href}>{t("pricing")}</FooterLink>
//             {/* Was a literal "Demo" → /login when no demo deployment was
//                 set; see footerTryLink. */}
//             <FooterLink href={tryLink.href}>{t(tryLink.label === "demo" ? "demo" : "tryFree")}</FooterLink>
//             {isKitSite && orgUrl && <FooterLink href={orgUrl} external>{t("openSource")}</FooterLink>}
//           </FooterColumn>
//
//           {/* Every public page links to the solution, use-case, tool and
//               comparison pages from here: the internal links that make them
//               findable (src/lib/seo/pages.ts lists them). */}
//           {nav.groups.map((group) =>
//             group.id === "why" ? (
//               <SplitFooterColumn
//                 key={group.id}
//                 heading={group.label}
//                 // The group's two columns in the shared navigation data
//                 // (src/lib/site-nav.ts): solution pages, then the use-case
//                 // pages. Headed here by what the links are; the menu's "By
//                 // industry" fits only the twelve industries among them.
//                 parts={[
//                   { heading: t("whatYouCanDo"), links: group.columns[0]?.links ?? [] },
//                   { heading: t("whoItsFor"), links: (group.columns[1]?.links ?? []).filter((link) => link.href !== "/#features") },
//                 ]}
//                 footer={group.footer}
//               />
//             ) : (
//             <FooterColumn key={group.id} heading={group.label}>
//               {group.columns
//                 .flatMap((column) => column.links)
//                 // Features is already the Product column's first link.
//                 .filter((link) => link.href !== "/#features")
//                 .map((link) => (
//                   <FooterLink key={link.href} href={link.href}>{link.label}</FooterLink>
//                 ))}
//               <FooterLink href={group.footer.href}>{group.footer.label}</FooterLink>
//             </FooterColumn>
//             )
//           )}
//
//           <FooterColumn heading={t("company")}>
//             <FooterLink href="/about">{t("aboutLink")}</FooterLink>
//             {/* The kit's own site collects nothing through the site: its
//                 contact is the copyable-email dialog, as it was before the
//                 contact form existed, so the waitlist stays the only data
//                 the privacy policy has to cover. Your app links the form. */}
//             {isKitSite ? (
//               <li>
//                 <ContactDialog
//                   trigger={
//                     <button type="button" className="transition-colors hover:text-[var(--footer-accent)]">
//                       {t("contact")}
//                     </button>
//                   }
//                 />
//               </li>
//             ) : (
//               <FooterLink href="/contact">{t("contact")}</FooterLink>
//             )}
//             <FooterLink href="/privacy">{t("privacy")}</FooterLink>
//             {/* The kit's own site sells nothing and has no accounts, so no
//                 terms; its cookie disclosure is a section of the (real)
//                 privacy policy. Your app keeps the dedicated pages. */}
//             {!isKitSite && <FooterLink href="/terms">{t("terms")}</FooterLink>}
//             <FooterLink href={isKitSite ? "/privacy#cookies" : "/cookies"}>{t("cookies")}</FooterLink>
//             {isKitSite && (
//               <FooterLink
//                 href={siteConfig.links.github ? `${siteConfig.links.github}/blob/main/LICENSE` : "https://opensource.org/license/mit"}
//                 external
//               >
//                 License
//               </FooterLink>
//             )}
//           </FooterColumn>
//         </div>
//
//       </div>
//
//       {/* The bottom bar, full width in the reference's cyan, much shorter
//           than its 139px. Was a border-t row (mt-12 pt-8) with the
//           PoweredBy badge centred under it (mt-8). */}
//       {/* Was bg-[var(--footer-accent)] text-black, text-[15px]. */}
//       <div className="mt-8 bg-[var(--footer-bar)] text-[var(--footer-bar-text)]">
//         <div className="mx-auto flex max-w-[90rem] flex-col items-center justify-between gap-3 px-6 py-4 text-[12px] md:flex-row lg:px-12">
//           <p>{t("copyright", { year: new Date().getFullYear(), site: siteConfig.name })}</p>
//           <div className="flex flex-wrap items-center justify-center gap-4">
//             <PoweredBy />
//             <p>
//               <Link href="/changelog" className="underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--footer-bar-text)]">
//                 v{siteConfig.version}
//               </Link>
//               {isKitSite && ` · ${t("license")}`}
//             </p>
//           </div>
//         </div>
//       </div>
//     </footer>
//   )
// }
