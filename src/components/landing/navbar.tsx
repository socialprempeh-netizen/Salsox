// Unused since the account buttons moved to NavbarAuthActions:
// import { getTranslations } from "next-intl/server"
// import Link from "next/link"
// The session is no longer read here: doing so made every public page render
// per request with no-store. NavbarAuthActions and the mobile menu ask from
// the browser instead (src/lib/session-hint.ts).
// import { getCurrentUser } from "@/lib/auth"
import { NavbarAuthActions } from "@/components/landing/session-aware"
// import { Button } from "@/components/ui/button"
import { ThemeToggle } from "@/components/theme-toggle"
import { Logo } from "@/components/logo"
import { LogoLink } from "@/components/landing/logo-link"
import { MobileMenu } from "@/components/landing/mobile-menu"
import { NavLinks } from "@/components/landing/nav-links"
// import { GithubIcon } from "@/components/icons/github"
import { siteConfig } from "@/config/site"
import { isKitSite } from "@/config/kit"
import { NavbarWrapper } from "@/components/landing/navbar-wrapper"
import { getStartedHref } from "@/lib/landing-cta"
import { hasPosts } from "@/lib/blog"

export async function Navbar() {
  // Both moved with the buttons into NavbarAuthActions.
  // const [t, tCommon] = await Promise.all([getTranslations("nav"), getTranslations("common")])
  // const user = await getCurrentUser()

  /**
   * On the kit's own site the primary button asks for a star instead of
   * sending people to the pricing section.
   *
   * It costs less than it looks: "Pricing" is already a link two positions to
   * the left, so the button was a second door into the same room, while
   * nothing in the navbar asked for the one thing an open source project
   * actually needs.
   *
   * A clone keeps "Get started", and that is why the gate is `isKitSite` and
   * not `links.github`: a product's navbar should push its product, even when
   * that product happens to have a public repository.
   */
  const starHref = isKitSite ? siteConfig.links.github : null
  // Read here because both menus below are client components.
  const showBlog = hasPosts()

  return (
    <NavbarWrapper>
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 rounded-full border border-border bg-background/70 px-4 pl-5 shadow-soft backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
        <LogoLink className="flex items-center gap-2">
          <Logo animated wordmarkClassName="text-base font-bold" />
        </LogoLink>

        <NavLinks showBlog={showBlog} />

        <div className="flex items-center gap-2">
          <ThemeToggle />
          {/* Decided in the browser (session-aware.tsx), so this navbar, and
              every public page under it, can be static. */}
          <NavbarAuthActions signInHref={siteConfig.links.demo ?? "/login"} starHref={starHref} getStartedHref={getStartedHref()} />
          {/* `isKitSite` is not a NEXT_PUBLIC variable, so a client component
              reads it as false: the choice is made here and handed down, the
              same way `signInHref` already is. */}
          <MobileMenu
            signInHref={siteConfig.links.demo ?? "/login"}
            starHref={starHref}
            showBlog={showBlog}
          />
        </div>
      </div>
    </NavbarWrapper>
  )
}

// Replaced by <NavbarAuthActions>, which picks these in the browser. Rendered
// here from `getCurrentUser()`, they made the navbar, and every page under it,
// dynamic.
// {user ? (
//   <Button asChild size="sm" className="hidden md:inline-flex">
//     <Link href="/dashboard">Dashboard</Link>
//   </Button>
// ) : (
//   <>
//     <Button asChild variant="ghost" size="sm" className="hidden md:inline-flex">
//       <Link href={siteConfig.links.demo ?? "/login"}>{t("signIn")}</Link>
//     </Button>
//     <Button asChild variant="gradient" size="sm" className="hidden md:inline-flex">
//       {starHref ? (
//         <a href={starHref} target="_blank" rel="noreferrer">
//           <GithubIcon className="h-4 w-4" />
//           {tCommon("starOnGitHub")}
//         </a>
//       ) : (
//         // Replaced: <Link href="/#pricing">, which sent "Get started" to billing.
//         <Link href={getStartedHref()}>{t("getStarted")}</Link>
//       )}
//     </Button>
//   </>
// )}
