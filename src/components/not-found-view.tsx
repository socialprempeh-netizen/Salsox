"use client"

/**
 * What a visitor sees on a 404: what happened, a way home, and the pages they
 * most likely meant (via RelatedLinks).
 *
 * Client side only for the animation. The content enters as a short
 * framer-motion stagger, and the large "404" behind the heading drifts into
 * place; both drop the movement when the visitor prefers reduced motion. The
 * page has exactly one h1, square corners throughout, and a single column on
 * phones that widens from `sm`.
 *
 * It renders inside the root layout, outside the public navbar and footer,
 * which is why it carries its own links instead of relying on theirs.
 */
import { useEffect } from "react"
import Link from "next/link"
import { motion, useReducedMotion, type Variants } from "framer-motion"
import { ArrowLeft } from "lucide-react"
import { useTranslations } from "next-intl"
import { Logo } from "@/components/logo"
import { RelatedLinks } from "@/components/landing/related-links"
import { siteConfig } from "@/config/site"

export function NotFoundView() {
  const t = useTranslations("notFound")
  const reduceMotion = useReducedMotion()

  // The layout's default title is what the server sends (see not-found.tsx);
  // this names the tab for the reader once the page is up. Setting it once is
  // not enough: on an unmatched URL Next applies the layout's metadata after
  // this effect and writes the default back, so the title is re-asserted
  // whenever the head changes, for as long as the 404 is on screen.
  const metaTitle = t("metaTitle", { site: siteConfig.name })
  useEffect(() => {
    const apply = () => {
      if (document.title !== metaTitle) document.title = metaTitle
    }
    apply()
    const observer = new MutationObserver(apply)
    observer.observe(document.head, { childList: true, subtree: true, characterData: true })
    return () => observer.disconnect()
  }, [metaTitle])

  const container: Variants = {
    hidden: {},
    show: { transition: { staggerChildren: reduceMotion ? 0 : 0.08 } },
  }
  const item: Variants = {
    hidden: { opacity: 0, y: reduceMotion ? 0 : 14 },
    show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
  }

  return (
    <main className="relative flex flex-1 flex-col overflow-hidden bg-background">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-grid opacity-35" />
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-glow" />

      <header className="relative z-10 mx-auto w-full max-w-3xl px-4 pt-6 sm:px-6">
        <Link href="/" className="inline-flex items-center gap-2">
          <Logo wordmarkClassName="text-base font-bold" />
        </Link>
      </header>

      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="relative z-10 mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-4 py-16 sm:px-6 sm:py-24"
      >
        <motion.span
          aria-hidden
          initial={{ opacity: 0, x: reduceMotion ? 0 : -24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          className="select-none text-[5.5rem] font-black leading-none tracking-tighter text-primary/15 sm:text-[8rem]"
        >
          404
        </motion.span>

        <motion.p
          variants={item}
          className="mt-2 inline-flex w-fit items-center border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-primary"
        >
          {t("badge")}
        </motion.p>

        <motion.h1
          variants={item}
          className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-5xl"
        >
          {t("title")}
        </motion.h1>

        <motion.p variants={item} className="mt-4 max-w-xl text-base leading-7 text-muted-foreground">
          {t("body")}
        </motion.p>

        <motion.div variants={item} className="mt-8">
          <Link
            href="/"
            className="group inline-flex h-11 w-full items-center justify-center gap-2 bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:w-auto"
          >
            <ArrowLeft
              aria-hidden
              className="h-4 w-4 transition-transform group-hover:-translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
            />
            {t("home")}
          </Link>
        </motion.div>

        <motion.div variants={item}>
          <RelatedLinks path="/404" className="mt-14" />
        </motion.div>
      </motion.div>

      <footer className="relative z-10 mx-auto w-full max-w-3xl px-4 pb-8 text-xs text-muted-foreground sm:px-6">
        © {new Date().getFullYear()} {siteConfig.name}
      </footer>
    </main>
  )
}
