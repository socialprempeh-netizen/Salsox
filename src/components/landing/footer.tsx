import Link from "next/link"
import { GithubIcon } from "@/components/icons/github"
import { LinkedinIcon } from "@/components/icons/linkedin"
import { PoweredBy } from "@/components/powered-by"
import { ContactDialog } from "@/components/landing/contact-dialog"
import { Logo } from "@/components/logo"
import { LogoLink } from "@/components/landing/logo-link"
import { siteConfig } from "@/config/site"
// The footer awaits the navigation data now, so it reads messages the async way.
// import { useTranslations } from "next-intl"
import { getTranslations } from "next-intl/server"
import { isKitSite } from "@/config/kit"
// Both moved into getSiteNav(), which the navbar shares.
// import { hasPosts } from "@/lib/blog"
import { footerTryLink } from "@/lib/landing-cta"
// import { getPages } from "@/lib/seo/pages"
import { getSiteNav } from "@/components/landing/site-nav-data"
import { cn } from "@/lib/utils"

function XIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
    </svg>
  )
}

// Type scale raised (was text-sm headings and links, space-y-2) to the size
// the established e-signature sites use in their footers: the footer is a
// map of the site, and at 14px it read as fine print.
function FooterColumn({ heading, children, className }: { heading: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <h4 className="mb-4 text-base font-semibold text-foreground">{heading}</h4>
      <ul className="space-y-2.5 text-[15px] text-muted-foreground sm:text-base">{children}</ul>
    </div>
  )
}

/**
 * The "Why" group in two side-by-side lists under one heading, each with its
 * own subheading: what the product does (the solution pages) and who it is
 * for (the industry, team and audience pages). As one column it ran to more
 * than thirty links. It spans two grid columns at every width, so on a phone
 * it takes the full row with its two lists beside each other.
 */
function SplitFooterColumn({ heading, parts, footer }: { heading: string; parts: { heading: string; links: { href: string; label: string }[] }[]; footer: { href: string; label: string } }) {
  return (
    <div className="col-span-2 min-w-0">
      <h4 className="mb-4 text-base font-semibold text-foreground">{heading}</h4>
      <div className="grid grid-cols-2 gap-x-6 gap-y-8">
        {parts.map((part, i) => (
          <div key={part.heading} className="min-w-0">
            <h5 className="mb-3 text-sm font-semibold text-foreground/80">{part.heading}</h5>
            <ul className="space-y-2.5 text-[15px] text-muted-foreground sm:text-base">
              {part.links.map((link) => (
                <FooterLink key={link.href} href={link.href}>{link.label}</FooterLink>
              ))}
              {/* The hub link closes the second list, as it closes every group. */}
              {i === parts.length - 1 && <FooterLink href={footer.href}>{footer.label}</FooterLink>}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}

function FooterLink({ href, external, children }: { href: string; external?: boolean; children: React.ReactNode }) {
  const className = "transition-colors hover:text-foreground"
  return (
    <li>
      {external ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className={className}>{children}</a>
      ) : (
        <Link href={href} className={className}>{children}</Link>
      )}
    </li>
  )
}

export async function Footer() {
  const [t, nav] = await Promise.all([getTranslations("footer"), getSiteNav()])
  const orgUrl = siteConfig.links.githubOrg ?? siteConfig.links.github
  const tryLink = footerTryLink(siteConfig.links.demo)
  return (
    <footer className="border-t border-border bg-muted/30 py-12">
      {/* Wider (was max-w-6xl), like the header, for seven columns of
          larger type. */}
      <div className="mx-auto max-w-7xl px-6 lg:px-12">
        {/* Grouped the way the top menu is (src/lib/site-nav.ts), from the
            same data, so the two cannot list different pages: Product, Why,
            Free tools, Compare, Resources, Company. Was Product (with docs,
            blog, changelog and verify mixed in), About and Legal; About and
            Legal are now one Company column, and the help material has a
            Resources column of its own. The old columns are kept at the
            bottom of this file. Brand on its own row, then two columns of
            links on a phone, three on a tablet, six on a desktop. */}
        <div className="max-w-xs">
          <LogoLink className="flex items-center gap-2">
            <Logo markClassName="h-9 w-9" wordmarkClassName="text-xl font-bold" />
          </LogoLink>
          <p className="mt-3 text-[15px] text-muted-foreground sm:text-base">
            {isKitSite ? t("blurb", { tagline: siteConfig.tagline }) : siteConfig.description}
          </p>
          <div className="mt-4 flex items-center gap-2">
            {orgUrl && (
              <a
                href={orgUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t("github")}
                className="flex h-9 w-9 items-center justify-center border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <GithubIcon />
              </a>
            )}
            {siteConfig.links.x && (
              <a
                href={siteConfig.links.x}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="X / Twitter"
                className="flex h-9 w-9 items-center justify-center border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <XIcon />
              </a>
            )}
            {siteConfig.links.linkedin && (
              <a
                href={siteConfig.links.linkedin}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t("linkedin")}
                className="flex h-9 w-9 items-center justify-center border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <LinkedinIcon />
              </a>
            )}
          </div>
        </div>

        {/* Was grid-cols-2 sm:grid-cols-3 lg:grid-cols-6, one column per
            group. The "Why" group now spans two (SplitFooterColumn), so
            seven tracks on a wide screen, four on a laptop, three on a
            tablet, two on a phone; dense flow fills the cell its span leaves
            beside Product on a phone. */}
        <div className="mt-10 grid grid-flow-row-dense grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
          <FooterColumn heading={t("product")}>
            {/* `/#` instead of bare `#`: the footer renders on every public
                page, but the sections only exist on the home page. */}
            <FooterLink href="/#features">{t("features")}</FooterLink>
            {/* The pricing page (was the home page's /#pricing section). */}
            <FooterLink href={nav.pricing.href}>{t("pricing")}</FooterLink>
            {/* Was a literal "Demo" → /login when no demo deployment was
                set; see footerTryLink. */}
            <FooterLink href={tryLink.href}>{t(tryLink.label === "demo" ? "demo" : "tryFree")}</FooterLink>
            {isKitSite && orgUrl && <FooterLink href={orgUrl} external>{t("openSource")}</FooterLink>}
          </FooterColumn>

          {/* Every public page links to the solution, use-case, tool and
              comparison pages from here: the internal links that make them
              findable (src/lib/seo/pages.ts lists them). */}
          {nav.groups.map((group) =>
            group.id === "why" ? (
              <SplitFooterColumn
                key={group.id}
                heading={group.label}
                // The group's two columns in the shared navigation data
                // (src/lib/site-nav.ts): solution pages, then the use-case
                // pages. Headed here by what the links are; the menu's "By
                // industry" fits only the twelve industries among them.
                parts={[
                  { heading: t("whatYouCanDo"), links: group.columns[0]?.links ?? [] },
                  { heading: t("whoItsFor"), links: (group.columns[1]?.links ?? []).filter((link) => link.href !== "/#features") },
                ]}
                footer={group.footer}
              />
            ) : (
            <FooterColumn key={group.id} heading={group.label}>
              {group.columns
                .flatMap((column) => column.links)
                // Features is already the Product column's first link.
                .filter((link) => link.href !== "/#features")
                .map((link) => (
                  <FooterLink key={link.href} href={link.href}>{link.label}</FooterLink>
                ))}
              <FooterLink href={group.footer.href}>{group.footer.label}</FooterLink>
            </FooterColumn>
            )
          )}

          <FooterColumn heading={t("company")}>
            <FooterLink href="/about">{t("aboutLink")}</FooterLink>
            {/* The kit's own site collects nothing through the site: its
                contact is the copyable-email dialog, as it was before the
                contact form existed, so the waitlist stays the only data
                the privacy policy has to cover. Your app links the form. */}
            {isKitSite ? (
              <li>
                <ContactDialog
                  trigger={
                    <button type="button" className="transition-colors hover:text-foreground">
                      {t("contact")}
                    </button>
                  }
                />
              </li>
            ) : (
              <FooterLink href="/contact">{t("contact")}</FooterLink>
            )}
            <FooterLink href="/privacy">{t("privacy")}</FooterLink>
            {/* The kit's own site sells nothing and has no accounts, so no
                terms; its cookie disclosure is a section of the (real)
                privacy policy. Your app keeps the dedicated pages. */}
            {!isKitSite && <FooterLink href="/terms">{t("terms")}</FooterLink>}
            <FooterLink href={isKitSite ? "/privacy#cookies" : "/cookies"}>{t("cookies")}</FooterLink>
            {isKitSite && (
              <FooterLink
                href={siteConfig.links.github ? `${siteConfig.links.github}/blob/main/LICENSE` : "https://opensource.org/license/mit"}
                external
              >
                License
              </FooterLink>
            )}
          </FooterColumn>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-border pt-8 text-[15px] text-muted-foreground md:flex-row">
          <p>{t("copyright", { year: new Date().getFullYear(), site: siteConfig.name })}</p>
          <p>
            <Link href="/changelog" className="transition-colors hover:text-foreground">
              v{siteConfig.version}
            </Link>
            {isKitSite && ` · ${t("license")}`}
          </p>
        </div>

        <div className="mt-8 flex justify-center">
          <PoweredBy />
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
