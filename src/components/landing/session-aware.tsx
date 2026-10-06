"use client"

/**
 * The parts of the public pages that differ for a signed-in visitor, decided
 * in the browser so the pages themselves can be static and cached.
 *
 * Each renders the signed-out version first. That is what the static HTML
 * contains, what most visitors see, and what stays if the check fails
 * (src/lib/session-hint.ts). When the answer says "signed in", the navbar's
 * buttons become one Dashboard button and the hero's call to action points at
 * a new document instead of sign up.
 *
 * The swap fades in with a CSS transition (tw-animate-css), not framer-motion.
 * That is a deliberate exception to the "animate with framer-motion or gsap"
 * rule: the previous performance pass took framer-motion off the landing
 * page's first load, and a library-sized import for one fade would put it
 * back. Disabled under prefers-reduced-motion.
 */
import { useEffect, useState } from "react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { GithubIcon } from "@/components/icons/github"
import { fetchSignedIn } from "@/lib/session-hint"

/** null until the browser has asked; then true or false. */
export function useSignedIn(): boolean | null {
  const [signedIn, setSignedIn] = useState<boolean | null>(null)
  useEffect(() => {
    let live = true
    fetchSignedIn().then((value) => {
      if (live) setSignedIn(value)
    })
    return () => {
      live = false
    }
  }, [])
  return signedIn
}

const FADE = "animate-in fade-in duration-300 motion-reduce:animate-none"

/**
 * The navbar's desktop buttons: Sign in and Get started (or Star on GitHub on
 * the kit's own site), or Dashboard once the visitor is known to be signed in.
 * Hidden below `md`, where the mobile menu carries the same links.
 */
export function NavbarAuthActions({
  signInHref,
  starHref,
  getStartedHref,
}: {
  signInHref: string
  starHref: string | null
  getStartedHref: string
}) {
  const t = useTranslations("nav")
  const tCommon = useTranslations("common")
  const signedIn = useSignedIn()

  if (signedIn) {
    return (
      <Button asChild size="sm" className={`hidden md:inline-flex ${FADE}`}>
        <Link href="/dashboard">{t("dashboard")}</Link>
      </Button>
    )
  }

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="hidden md:inline-flex">
        <Link href={signInHref}>{t("signIn")}</Link>
      </Button>
      <Button asChild variant="gradient" size="sm" className="hidden md:inline-flex">
        {starHref ? (
          <a href={starHref} target="_blank" rel="noreferrer">
            <GithubIcon className="h-4 w-4" />
            {tCommon("starOnGitHub")}
          </a>
        ) : (
          <Link href={getStartedHref}>{t("getStarted")}</Link>
        )}
      </Button>
    </>
  )
}

/**
 * The hero's primary button. Both destinations come from the page
 * (heroCtaHref in src/lib/landing-cta.ts, asked once for each state), so the
 * rule stays where it is tested; this only picks between them.
 */
export function HeroCta({ signedOutHref, signedInHref, children }: { signedOutHref: string; signedInHref: string; children: React.ReactNode }) {
  const signedIn = useSignedIn()
  const href = signedIn ? signedInHref : signedOutHref
  return (
    <Button asChild variant="gradient" size="xl">
      <Link href={href} key={href} className={signedIn && signedInHref !== signedOutHref ? FADE : undefined}>
        {children} <ArrowRight className="h-5 w-5" />
      </Link>
    </Button>
  )
}
