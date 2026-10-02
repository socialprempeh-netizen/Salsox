import type { Metadata } from "next"
import { siteConfig } from "@/config/site"
import { pageMetadata } from "@/lib/metadata"
import { useTranslations } from "next-intl"
// Unused since the placeholder note below was removed.
// import { isKitSite } from "@/config/kit"
import { jsonLdScript } from "@/lib/json-ld"
import { aboutPageJsonLd } from "@/lib/structured-data"
import { RelatedLinks } from "@/components/landing/related-links"
import { hasPosts } from "@/lib/blog"

export const metadata: Metadata = pageMetadata({
  title: `About | ${siteConfig.name}`,
  description: `${siteConfig.name} is e-signatures built for phones: send any PDF, get it signed and paid in one flow, by email, WhatsApp or SMS.`,
  path: "/about",
})

/**
 * What Salsox is, who it is for, and the principles it is run by. The copy
 * lives under `about.$product` in the message files; it used to be the kit's
 * placeholder ("projects", "small teams") with a note saying so.
 */
export default function AboutPage() {
  const t = useTranslations("about")
  return (
    <section className="py-24">
      {/* The same organisation the home page declares, as the subject of this
          page: built by the same helper so the two cannot disagree. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(aboutPageJsonLd()) }} />
      <div className="mx-auto max-w-3xl px-6 lg:px-12">
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          {t("title", { site: siteConfig.name })}
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">{siteConfig.description}</p>

        <div className="mt-12 space-y-8 leading-7 text-muted-foreground">
          {/* Removed with the placeholder copy it apologised for: this page
              now describes Salsox. The note's strings stay under `$kit`.
              {!isKitSite && (
              <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-5 text-sm">
              <p className="font-medium text-foreground">{t("noteTitle")}</p>
              <p className="mt-1">
              {t.rich("noteBody", { path: (c) => <code>{c}</code> })}
              </p>
              </div>
              )}
          */}

          <div>
            <h2 className="mb-2 text-lg font-semibold text-foreground">{t("whatTitle")}</h2>
            <p>{t("what")}</p>
          </div>

          <div>
            <h2 className="mb-2 text-lg font-semibold text-foreground">{t("whoTitle")}</h2>
            <p>{t("who")}</p>
          </div>

          <div>
            <h2 className="mb-2 text-lg font-semibold text-foreground">{t("principlesTitle")}</h2>
            <ul className="list-disc space-y-1 pl-5">
              {t.raw("principles").map((p: string) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>

          {siteConfig.maintainer.name && (
            <div>
              <h2 className="mb-2 text-lg font-semibold text-foreground">{t("maintainerTitle")}</h2>
              <p>
                {t("maintainerIntro", { site: siteConfig.name })}{" "}
                {siteConfig.maintainer.url ? (
                  <a
                    href={siteConfig.maintainer.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-primary underline underline-offset-4 hover:no-underline"
                  >
                    {siteConfig.maintainer.name}
                  </a>
                ) : (
                  <span className="font-medium text-foreground">{siteConfig.maintainer.name}</span>
                )}
                {t("maintainerBody")}
              </p>
            </div>
          )}
        </div>

        <RelatedLinks path="/about" hide={hasPosts() ? [] : ["blog"]} />
      </div>
    </section>
  )
}
