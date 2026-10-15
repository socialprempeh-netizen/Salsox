import { MDXRemote } from "next-mdx-remote/rsc"
import remarkGfm from "remark-gfm"

/**
 * A free template's text (src/lib/templates.ts), set as a document on the
 * page: a bordered sheet with the template's own title, numbered clauses and
 * signature lines, rendered on the server so the full text is in the HTML.
 *
 * Differences from MarkdownBody (the article renderer), each deliberate:
 * - the document's "# Title" renders as a styled paragraph, not a second H1:
 *   the page already has one;
 * - every [Blank to fill in] is highlighted, so a reader sees at a glance
 *   what they have to change;
 * - single line breaks are kept (`whitespace-pre-line`), because address
 *   blocks and signature lines are written one per line;
 * - tables scroll inside the sheet, never the page, on a 360px phone.
 */
const components = {
  h1: ({ children }: { children?: React.ReactNode }) => <p className="!mt-0 text-xl font-bold tracking-tight text-foreground sm:text-2xl">{children}</p>,
  h2: ({ children }: { children?: React.ReactNode }) => <h2 className="!mb-2 !mt-7 text-base font-semibold sm:text-lg">{children}</h2>,
  table: ({ children }: { children?: React.ReactNode }) => (
    <div className="not-prose my-4 overflow-x-auto border border-border">
      <table className="w-full min-w-[30rem] border-collapse text-left text-sm [&_td]:border-t [&_td]:border-border [&_td]:px-3 [&_td]:py-2 [&_th]:bg-muted/60 [&_th]:px-3 [&_th]:py-2 [&_th]:font-semibold">
        {children}
      </table>
    </div>
  ),
  Blank: ({ children }: { children?: React.ReactNode }) => (
    <mark className="bg-primary/10 px-0.5 text-foreground [box-decoration-break:clone]">{children}</mark>
  ),
}

/** Wraps each [Blank] for the highlight; the source never contains `<`, so this is the only JSX in it. */
export function markBlanks(markdown: string): string {
  return markdown.replace(/\[([A-Z][^\]\n]{1,60})\](?!\()/g, "<Blank>[$1]</Blank>")
}

export function TemplateDocument({ markdown }: { markdown: string }) {
  return (
    <div className="prose prose-sm max-w-none sm:prose-base [&_p]:whitespace-pre-line prose-li:my-0.5">
      <MDXRemote source={markBlanks(markdown)} components={components} options={{ mdxOptions: { remarkPlugins: [remarkGfm] } }} />
    </div>
  )
}
