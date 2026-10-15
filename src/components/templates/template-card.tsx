import Link from "next/link"
import { ArrowRight } from "lucide-react"
import type { TemplateCard as Card } from "@/lib/templates"

/**
 * A template in a list: a small paper thumbnail of its first lines, filled
 * with its sample values, then its name, category and one-line summary.
 *
 * Plain markup with no hooks, so the same card renders in server pages
 * (category, industry and team pages, related templates) and inside the
 * filterable library, which is a client component. `hrefBase` decides where
 * a card leads: the public page (/templates) or the dashboard's use page
 * (/dashboard/templates).
 */
export function TemplateCard({ card, categoryLabel, hrefBase = "/templates" }: { card: Card; categoryLabel: string; hrefBase?: string }) {
  return (
    <Link
      href={`${hrefBase}/${card.slug}`}
      className="group flex h-full min-w-0 flex-col overflow-hidden border border-border bg-background transition-colors hover:border-primary/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
    >
      <div aria-hidden className="relative h-36 overflow-hidden border-b border-border bg-muted/40 px-5 pt-4">
        <div className="h-full border border-border bg-card px-3 pt-3 shadow-sm transition-transform duration-300 group-hover:-translate-y-1 motion-reduce:transition-none">
          {card.preview.map((line, i) => (
            <p key={i} className={i === 0 ? "truncate text-[9px] font-bold text-foreground" : "truncate text-[7px] leading-[11px] text-muted-foreground"}>
              {line}
            </p>
          ))}
        </div>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <p className="text-xs font-medium text-muted-foreground">{categoryLabel}</p>
        <h3 className="mt-1 flex items-start justify-between gap-2 font-semibold">
          {card.h1}
          <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </h3>
        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{card.lede}</p>
      </div>
    </Link>
  )
}

export function TemplateCardGrid({ cards, categoryLabels, hrefBase }: { cards: Card[]; categoryLabels: Record<string, string>; hrefBase?: string }) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map((card) => (
        // min-w-0: the thumbnail's one-line previews must not widen the grid on a phone.
        <li key={card.slug} className="min-w-0">
          <TemplateCard card={card} categoryLabel={categoryLabels[card.category] ?? card.category} hrefBase={hrefBase} />
        </li>
      ))}
    </ul>
  )
}
