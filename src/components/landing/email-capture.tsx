"use client"

/**
 * The "Get started" row in a hero: an email field and the button on one line,
 * the way the large e-signature sites open (it stacks on a narrow phone).
 *
 * It is not a capture flow of its own. It is a plain GET form whose action is
 * the signup link the hero already used (`/signup?next=...`), so submitting
 * lands on the real signup page with `email` added and the form prefilled
 * there (src/lib/signup-prefill.ts). Nothing is stored until that form is
 * completed, it works without JavaScript, and the server validates it all
 * again. A `cta_clicked` event (src/lib/analytics.ts) records the submit.
 *
 * A visitor known to be signed in sees one button to `signedInHref` instead,
 * decided in the browser like the other session-aware parts of the public
 * pages (session-aware.tsx), so the pages stay static.
 *
 * Motion: the signed-in button fades in with a CSS transition, and the row's
 * focus ring and arrow move with CSS. Like session-aware.tsx, this is the
 * documented exception to the framer-motion rule on the public pages, whose
 * first load deliberately carries no animation library; all of it is off
 * under prefers-reduced-motion.
 */
import Link from "next/link"
import { useTranslations } from "next-intl"
import { ArrowRight } from "lucide-react"
import { useSignedIn } from "@/components/landing/session-aware"
import { track } from "@/lib/analytics"
import { cn } from "@/lib/utils"

export function EmailCapture({
  signupHref,
  signedInHref,
  location,
  align = "center",
  size = "lg",
  showNote = true,
}: {
  /** The signup link to submit to, with its own query (e.g. `?next=`). */
  signupHref: string
  signedInHref: string
  /** Where the row sits, for the analytics event. A short identifier. */
  location: string
  align?: "center" | "start"
  size?: "lg" | "md"
  /** The reassurance line under the row; off where the page already says it. */
  showNote?: boolean
}) {
  const t = useTranslations("emailCapture")
  const signedIn = useSignedIn()
  const target = new URL(signupHref, "https://placeholder.invalid")
  const fieldId = `email-capture-${location.replace(/[^a-z0-9]+/gi, "-")}`
  const height = size === "lg" ? "h-14" : "h-12"

  if (signedIn) {
    return (
      <div className={cn("flex", align === "center" ? "justify-center" : "justify-start")}>
        <Link
          href={signedInHref}
          className={cn(
            "group inline-flex items-center justify-center gap-2 bg-primary px-7 text-[14px] font-medium text-primary-foreground transition-opacity hover:opacity-90 animate-in fade-in duration-300 motion-reduce:animate-none",
            height
          )}
        >
          {t("signedIn")}
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" />
        </Link>
      </div>
    )
  }

  return (
    <form
      action={target.pathname}
      method="get"
      onSubmit={() => track("cta_clicked", { location, target: "signup_email" })}
      className={cn("w-full max-w-xl", align === "center" && "mx-auto")}
    >
      {[...target.searchParams].map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <label htmlFor={fieldId} className="sr-only">
        {t("label")}
      </label>
      {/* One bordered row: the field and the button share an edge, and the
          whole row takes the focus ring, so it reads as a single control. */}
      <div className="flex flex-col gap-2 min-[380px]:flex-row min-[380px]:gap-0 min-[380px]:border min-[380px]:border-input min-[380px]:bg-card min-[380px]:shadow-soft min-[380px]:transition-shadow min-[380px]:focus-within:border-primary min-[380px]:focus-within:ring-2 min-[380px]:focus-within:ring-primary/25">
        <input
          id={fieldId}
          name="email"
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          maxLength={254}
          placeholder={t("placeholder")}
          className={cn(
            // flex-1 only once the row is a row (was flex-1 at every width): in
            // the stacked column below 380px it made the height the flexible
            // axis and collapsed the field to its text line, about 22px.
            "w-full min-w-0 min-[380px]:w-auto min-[380px]:flex-1 border border-input bg-card px-4 text-base text-foreground placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 min-[380px]:border-0 min-[380px]:bg-transparent min-[380px]:focus-visible:ring-0",
            height
          )}
        />
        <button
          type="submit"
          className={cn(
            "group inline-flex shrink-0 items-center justify-center gap-2 bg-primary px-6 text-[14px] font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
            height
          )}
        >
          {t("submit")}
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" />
        </button>
      </div>
      {showNote && <p className={cn("mt-3 text-sm text-muted-foreground", align === "center" && "text-center")}>{t("note")}</p>}
    </form>
  )
}
