import { MDXRemote } from "next-mdx-remote/rsc"
import remarkGfm from "remark-gfm"
import { FIELD_TOKEN, type TemplateRole } from "@/lib/templates"
import { roleTone } from "@/components/templates/role-tone"

/**
 * A template's document, set as a sheet on the page and rendered on the
 * server, so the full text is in the HTML for readers and crawlers.
 *
 * Two views of the same document (the page shows one at a time, see
 * template-preview.tsx):
 * - "sample": every blank filled with its realistic sample value, tinted so
 *   it is clear what will change;
 * - "blank": every [Blank to fill in] highlighted as written.
 * In both, each signing field token ([[signature:client]] and the like) is
 * drawn as a box labelled with the field and the role, in that role's colour,
 * which is the same colour the role has in the "Who signs" list.
 *
 * Differences from MarkdownBody (the article renderer), each deliberate: the
 * document's "# Title" renders as a styled paragraph, not a second H1; single
 * line breaks are kept (address blocks and signature lines are one per line);
 * tables scroll inside the sheet, never the page, on a 360px phone.
 */

const BLANK = /\[([A-Z][^\]\n]{1,59})\](?!\()/g

/** The Markdown with blanks and field tokens wrapped for highlighting. The source never contains `<`, so these are the only JSX in it. */
export function markDocument(markdown: string, mode: "sample" | "blank", samples: Record<string, string>): string {
  const withBlanks = markdown.replace(BLANK, (whole, name: string) =>
    mode === "sample" && samples[name] ? `<Filled>${samples[name]}</Filled>` : `<Blank>${whole}</Blank>`
  )
  return withBlanks.replace(FIELD_TOKEN, (_m, kind: string, role: string) => `<SignField kind="${kind}" role="${role}" />`)
}

const baseComponents = {
  h1: ({ children }: { children?: React.ReactNode }) => <p className="!mt-0 text-xl font-bold tracking-tight text-foreground sm:text-2xl">{children}</p>,
  h2: ({ children }: { children?: React.ReactNode }) => <h2 className="!mb-2 !mt-7 text-base font-semibold sm:text-lg">{children}</h2>,
  table: ({ children }: { children?: React.ReactNode }) => (
    <div className="not-prose my-4 overflow-x-auto border border-border">
      <table className="w-full min-w-[30rem] border-collapse text-left text-sm [&_td]:border-t [&_td]:border-border [&_td]:px-3 [&_td]:py-2 [&_th]:bg-muted/60 [&_th]:px-3 [&_th]:py-2 [&_th]:font-semibold">
        {children}
      </table>
    </div>
  ),
  Blank: ({ children }: { children?: React.ReactNode }) => <mark className="bg-primary/10 px-0.5 text-foreground [box-decoration-break:clone]">{children}</mark>,
  Filled: ({ children }: { children?: React.ReactNode }) => (
    <span className="bg-amber-500/10 px-0.5 text-foreground underline decoration-amber-500/50 decoration-dotted underline-offset-4 [box-decoration-break:clone]">{children}</span>
  ),
}

export function TemplateDocument({
  markdown,
  mode,
  samples,
  roles,
  fieldLabels,
}: {
  markdown: string
  mode: "sample" | "blank"
  samples: Record<string, string>
  roles: TemplateRole[]
  /** Translated names of the field kinds: signature, initials, date, name, text. */
  fieldLabels: Record<string, string>
}) {
  const roleIndex = new Map(roles.map((r, i) => [r.id, i]))
  const SignField = ({ kind, role }: { kind: string; role: string }) => {
    const index = roleIndex.get(role) ?? 0
    const label = roles[index]?.label ?? role
    const wide = kind === "signature" || kind === "text" || kind === "name"
    return (
      <span
        className={`not-prose mx-0.5 inline-flex h-8 items-end border-b-2 border-dashed px-2 pb-0.5 align-bottom text-[11px] font-medium ${roleTone(index)} ${wide ? "min-w-40 sm:min-w-52" : "min-w-20"}`}
      >
        {fieldLabels[kind] ?? kind} · {label}
      </span>
    )
  }
  return (
    <div className="prose prose-sm max-w-none sm:prose-base [&_p]:whitespace-pre-line prose-li:my-0.5">
      <MDXRemote source={markDocument(markdown, mode, samples)} components={{ ...baseComponents, SignField }} options={{ mdxOptions: { remarkPlugins: [remarkGfm] } }} />
    </div>
  )
}
