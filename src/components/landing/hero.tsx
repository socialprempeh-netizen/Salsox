import Link from "next/link"
import { Check, Sparkles } from "lucide-react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { siteConfig } from "@/config/site"
import { heroSecondaryCta } from "@/lib/landing-cta"
import { HeroCta } from "@/components/landing/session-aware"
import { EmailCapture } from "@/components/landing/email-capture"
import { HeroDashboard } from "@/components/landing/hero-dashboard"

/**
 * The homepage hero, two columns from lg: the serif headline, the pitch, the
 * email row and the trust points on the left; a floating card of the
 * dashboard on the right (hero-dashboard.tsx). One column on phones, card
 * under the copy. Replaces the centred hero with a full app mock-up under it
 * (kept in hero-classic.tsx).
 *
 * The copy lives in the message files, under `hero.product` (this app) and
 * `hero.kit` (the kit's own site, KIT_SITE="true"), as before:
 * `headlineHead` / `headlineAccent` split the H1 into a plain line and an
 * accented one, and when empty the split follows `tagline` in
 * src/config/site.ts, accenting its last word.
 *
 * The background is the reference build's (docs/reference/
 * salsox-homepage-live.html): a mint to lavender wash with two soft glows at
 * its edges (see the layers below). Faint enough that text keeps its
 * contrast. Nothing here starts hidden: the headline is the page's largest
 * paint.
 */
export function Hero({ ctaHrefs }: { ctaHrefs: { signedOut: string; signedIn: string } }) {
  const t = useTranslations("hero")
  const tm = useTranslations("hero.mock")
  const secondary = heroSecondaryCta(siteConfig.links.demo)
  const words = siteConfig.tagline.split(" ")
  const taglineLast = words.pop() ?? ""
  const headline = t("headlineHead") ? { head: t("headlineHead"), accent: t("headlineAccent") } : { head: words.join(" "), accent: taglineLast }
  // The trust line is one message, its points separated by " · ", so it
  // reads the same wherever it is shown as a sentence; here each point
  // gets its own check mark.
  const trustPoints = t("trust").split(/\s+·\s+/).filter(Boolean)
  const signupFlow = ctaHrefs.signedOut.startsWith("/signup")

  return (
    // isolate: the background layers below sit at -z-10, and without a
    // stacking context of its own here they paint behind the public layout's
    // cream background (.brand-landing), which hid the wash entirely.
    // Was: <section className="relative overflow-hidden">
    <section className="relative isolate overflow-hidden">
      {/* The reference build's background (docs/reference/
          salsox-homepage-live.html), its values as written: a wash to the
          bottom right from #DFF5F3 through #E8F6F4 to #E9E5FF, and the two
          glows that give its edges their colour, #C8EDE9 at 40% (600px,
          blurred 80px) off the top right and #E9E5FF at 60% (500px, 90px)
          off the left. The glows stay round: blurred that far they are light,
          not a box with corners. Dark mode keeps the theme's own wash, these
          colours being built for a light page; the grid texture is gone, the
          reference has none.
          Was a 120deg wash, mint to cream with a trace of purple:
          bg-[linear-gradient(120deg,var(--brand-mint)_0%,var(--brand-mint)_18%,var(--brand-cream)_68%,color-mix(in_srgb,var(--brand-accent)_7%,var(--brand-cream))_100%)]
          and before that: bg-[linear-gradient(120deg,color-mix(in_srgb,var(--primary)_12%,transparent)_0%,transparent_45%,color-mix(in_srgb,var(--brand-accent)_14%,transparent)_100%)]
          with <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-grid opacity-60" /> over it. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-linear-to-br from-[#DFF5F3] via-[#E8F6F4] to-[#E9E5FF] dark:from-[var(--brand-mint)] dark:via-[var(--background)] dark:to-[color-mix(in_srgb,var(--brand-accent)_18%,var(--background))]"
      >
        <div className="absolute -top-[20%] right-[10%] h-[600px] w-[600px] rounded-full bg-[#C8EDE9]/40 blur-[80px] dark:opacity-0" />
        <div className="absolute left-[-10%] top-[30%] h-[500px] w-[500px] rounded-full bg-[#E9E5FF]/60 blur-[90px] dark:opacity-0" />
      </div>

      <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] items-center gap-14 px-6 pb-20 pt-12 md:pt-16 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-10 lg:px-12 lg:pb-24 lg:pt-20">
        <div>
          {/* What is new: the product's own line, next to its version. */}
          <div className="mb-6 inline-flex max-w-full items-center gap-2 border border-border bg-card/80 py-1.5 pl-2 pr-3 text-sm font-medium backdrop-blur">
            {/* Badge type: 10px bold capitals (was text-xs font-semibold). */}
            <span className="inline-flex shrink-0 items-center gap-1 bg-brand-accent px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
              <Sparkles className="h-3 w-3" aria-hidden="true" /> v{siteConfig.version}
            </span>
            <span className="truncate text-muted-foreground">{t("pill")}</span>
          </div>

          {/* 36px on a phone to 60px on a laptop, line height 0.92, all dark
              teal. Was text-[2.6rem] sm:text-6xl lg:text-[4.25rem], leading 1.05. */}
          <h1 className="font-display text-[36px] font-semibold leading-[0.92] tracking-tight text-foreground sm:text-[48px] lg:text-[60px]">
            {/* One colour for the whole line: the accent span was text-primary. */}
            {headline.head} <span>{headline.accent}</span>
          </h1>

          <p className="mt-6 max-w-xl text-lg text-muted-foreground md:text-xl">{t("subtitle")}</p>

          {signupFlow ? (
            <div className="mt-8">
              <EmailCapture signupHref={ctaHrefs.signedOut} signedInHref={ctaHrefs.signedIn} location="hero:/" showNote={false} align="start" />
            </div>
          ) : (
            <div className="mt-8 flex flex-col gap-4 sm:flex-row">
              <HeroCta signedOutHref={ctaHrefs.signedOut} signedInHref={ctaHrefs.signedIn}>
                {t("cta")}
              </HeroCta>
              <Button asChild variant="outline" size="xl">
                <Link href={secondary.href}>{t(secondary.label === "liveDemo" ? "liveDemo" : "howItWorks")}</Link>
              </Button>
            </div>
          )}

          <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
            {trustPoints.map((point) => (
              <li key={point} className="inline-flex items-center gap-1.5">
                <Check className="h-4 w-4 shrink-0 text-brand-teal" strokeWidth={2.5} aria-hidden="true" />
                {point}
              </li>
            ))}
          </ul>

          {signupFlow && (
            <p className="mt-4 text-sm">
              <Link href={secondary.href} className="font-medium text-foreground underline underline-offset-4 hover:text-primary">
                {t(secondary.label === "liveDemo" ? "liveDemo" : "howItWorks")}
              </Link>
            </p>
          )}
        </div>

        <HeroDashboard
          text={{
            host: new URL(siteConfig.url).host,
            // The card rebuilt from the reference build (hero-dashboard.tsx).
            // The earlier card took greeting, greetingBody, statPlan,
            // statBilling, docsTitle, docsBody, viewAll, statStatus and
            // statStatusValue (hero-dashboard-compact.tsx).
            welcome: tm("welcome"),
            name: tm("name"),
            today: tm("today"),
            export: tm("export"),
            activeLabel: tm("activeLabel"),
            activeValue: tm("statSentValue"),
            activeDelta: tm("activeDelta"),
            paidLabel: tm("paidLabel"),
            paidValue: tm("statCollectedValue"),
            paidStatus: tm("paidStatus"),
            chartTitle: tm("chartTitle"),
            chartMeta: tm("chartMeta"),
            days: tm("days").split(","),
            chipTitle: tm("chipTitle"),
            chipBody: tm("chipBody"),
          }}
        />
      </div>
    </section>
  )
}
