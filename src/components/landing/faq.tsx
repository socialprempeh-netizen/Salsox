import Link from "next/link"
import { ArrowRight, MessageCircle } from "lucide-react"
import { useTranslations } from "next-intl"
import { siteConfig } from "@/config/site"
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion"
import { Reveal } from "@/components/landing/reveal"
import { jsonLdScript } from "@/lib/json-ld"
import { FREE_DOCUMENTS_PER_MONTH } from "@/lib/esign/plans"

type Faq = { question: string; answer: string }

/**
 * Placeholder FAQ: four questions a visitor actually asks before signing up
 * for a SaaS, one per area (getting started, paying, privacy, support).
 * Answer them for your product, in your words, and add your own. Every answer
 * below is true of the kit as it ships, so nothing here oversells until you
 * change it.
 */


/**
 * `withJsonLd` emits the FAQPage structured data that can earn an expandable
 * result in search. Pass it on **one** page only — the questions are the same
 * everywhere this section appears, and repeating the markup across pages
 * gives search engines the same FAQ under several URLs.
 */
export function FAQ({ withJsonLd = false }: { withJsonLd?: boolean }) {
  const t = useTranslations("faq")
  // The list itself differs per deployment, so it comes from the messages
  // rather than a constant sized to whichever branch happens to be longer.
  //
  // `t.raw` returns the message untouched, so `{site}` is substituted here the
  // way the transactional emails do it. Reading each answer with `t()` instead
  // would interpolate on its own, but it would turn one list into a numbered
  // family of keys and lose the count that drives this section.
  // `{free}` likewise: the free monthly allowance, from plans.ts.
  const fill = (text: string) => text.replaceAll("{site}", siteConfig.name).replaceAll("{free}", String(FREE_DOCUMENTS_PER_MONTH))
  const items = (t.raw("items") as Faq[]).map((faq) => ({
    question: fill(faq.question),
    answer: fill(faq.answer),
  }))
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  }

  // Homepage redesign: two columns from lg, the serif heading and a way to
  // ask a question of our own on the left (sticky), the questions on the
  // right; an open question gets the brand accent down its edge. Was one
  // centred column; its classes are noted where they changed.
  return (
    <section id="faq" className="py-20 sm:py-24">
      {withJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }}
        />
      )}
      {/* Was: mx-auto max-w-3xl, heading centred above (mb-16 text-center). */}
      <div className="mx-auto grid max-w-6xl gap-10 px-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16 lg:px-12">
        <Reveal className="lg:sticky lg:top-28 lg:self-start">
          <h2 className="font-display text-3xl font-semibold tracking-tight text-foreground sm:text-[2.75rem]">
            {t("title")}
          </h2>
          <p className="mt-4 text-muted-foreground">{t("more")}</p>
          <Link href="/contact" className="group mt-5 inline-flex items-center gap-2 border border-border bg-card px-4 py-2.5 text-sm font-medium transition-colors hover:border-primary hover:text-primary">
            <MessageCircle className="h-4 w-4 text-brand-accent-text" aria-hidden="true" />
            {t("moreCta")}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </Link>
        </Reveal>

        <Reveal>
          <Accordion type="single" collapsible className="w-full space-y-3">
            {items.map((faq, i) => (
              <AccordionItem
                key={i}
                value={`item-${i}`}
                // Was: border bg-card px-5 shadow-soft, a larger shadow when open.
                className="border border-l-4 border-border border-l-transparent bg-card px-5 transition-colors data-[state=open]:border-l-brand-accent data-[state=open]:shadow-[var(--shadow-soft-lg)]"
              >
                <AccordionTrigger className="text-base">{faq.question}</AccordionTrigger>
                <AccordionContent>{faq.answer}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Reveal>
      </div>
    </section>
  )
}
