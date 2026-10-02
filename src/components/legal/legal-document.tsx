/**
 * Renders one legal document (privacy, terms, cookies) from content/legal/,
 * loaded by src/lib/legal.ts: title, last-updated date, then the Markdown.
 *
 * Shared by the three pages so they look and behave the same, which the old
 * hand-written page components did not quite. Tables scroll inside their own
 * box on a phone instead of widening the page.
 */
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import type { LegalDocument as Doc } from "@/lib/legal"
import { FadeUp } from "@/components/motion/fade-up"

export function LegalDocument({ doc, updatedLabel }: { doc: Doc; updatedLabel: string }) {
  return (
    <section className="py-24">
      <FadeUp className="mx-auto max-w-3xl px-6 lg:px-12">
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{doc.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{updatedLabel}</p>
        <article className="prose prose-sm mt-10 max-w-none text-muted-foreground prose-headings:tracking-tight prose-headings:text-foreground prose-h2:mt-10 prose-h2:text-lg prose-a:text-primary prose-a:underline-offset-4 prose-strong:text-foreground prose-th:text-foreground prose-code:before:content-none prose-code:after:content-none">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              table: ({ children }) => (
                <div className="overflow-x-auto">
                  <table>{children}</table>
                </div>
              ),
            }}
          >
            {doc.content}
          </ReactMarkdown>
        </article>
      </FadeUp>
    </section>
  )
}
