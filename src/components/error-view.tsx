"use client"

/**
 * What a visitor sees when a page throws: what happened, a way to try again,
 * and a way home. Rendered by the app's error boundaries (src/app/error.tsx
 * and src/app/global-error.tsx) through error-view-lazy.tsx, which also
 * reports the error to Sentry.
 *
 * Errors do not apologize and are never vague: the copy says the page could
 * not load and what to do next. A server error carries a `digest`, the id
 * Next logs it under; it is shown as a reference to quote, which is also how
 * the error is found in Sentry and in the server logs. Nothing of the error's
 * message is shown, since in production that can be internal detail.
 *
 * Animation: a short framer-motion stagger, as on the 404 page, with no
 * movement under reduced motion. Square corners, one column on phones that
 * becomes a row of buttons from `sm`.
 */
import Link from "next/link"
import { motion, useReducedMotion, type Variants } from "framer-motion"
import { AlertTriangle, RotateCw } from "lucide-react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"

export function ErrorView({ digest, retry }: { digest?: string; retry: () => void }) {
  const t = useTranslations("errorBoundary")
  const reduceMotion = useReducedMotion()
  const container: Variants = {
    hidden: {},
    show: { transition: { staggerChildren: reduceMotion ? 0 : 0.07 } },
  }
  const item: Variants = {
    hidden: { opacity: 0, y: reduceMotion ? 0 : 12 },
    show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" } },
  }

  return (
    <main className="flex flex-1 items-center justify-center bg-background px-4 py-16 sm:px-6">
      <motion.div variants={container} initial="hidden" animate="show" className="w-full max-w-md">
        <motion.span
          variants={item}
          className="flex h-12 w-12 items-center justify-center border border-destructive/30 bg-destructive/10 text-destructive"
        >
          <AlertTriangle className="h-6 w-6" aria-hidden="true" />
        </motion.span>
        <motion.h1 variants={item} className="mt-6 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          {t("title")}
        </motion.h1>
        <motion.p variants={item} className="mt-3 text-base text-muted-foreground">
          {t("body")}
        </motion.p>
        <motion.div variants={item} className="mt-8 flex flex-col gap-2 sm:flex-row">
          <Button size="lg" onClick={retry} className="w-full sm:w-auto">
            <RotateCw className="h-4 w-4" aria-hidden="true" />
            {t("retry")}
          </Button>
          <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
            <Link href="/">{t("home")}</Link>
          </Button>
        </motion.div>
        {digest && (
          <motion.p variants={item} className="mt-6 border-t border-border pt-4 text-xs text-muted-foreground">
            {t("reference", { digest })}
          </motion.p>
        )}
      </motion.div>
    </main>
  )
}
