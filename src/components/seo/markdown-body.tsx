import Link from "next/link"
import { MDXRemote } from "next-mdx-remote/rsc"
import remarkGfm from "remark-gfm"
import { slugify, nodeText } from "@/lib/toc"

/**
 * The Markdown body of a landing, tool, comparison or use-case page, rendered
 * on the server: crawlers get the full text in the HTML, with no client
 * JavaScript involved.
 *
 * Three adjustments to plain Markdown, each for a reason:
 * - internal links use next/link (prefetch, no full reload); outside links
 *   open normally with rel="noopener";
 * - headings get ids, so sections can be linked to;
 * - tables sit in their own scrolling box, so a comparison table never makes
 *   the whole page scroll sideways on a 360px phone.
 */
const components = {
  a: ({ href = "", children }: { href?: string; children?: React.ReactNode }) =>
    href.startsWith("/") ? (
      <Link href={href}>{children}</Link>
    ) : (
      <a href={href} rel="noopener noreferrer" target={href.startsWith("http") ? "_blank" : undefined}>
        {children}
      </a>
    ),
  h2: ({ children }: { children?: React.ReactNode }) => <h2 id={slugify(nodeText(children))}>{children}</h2>,
  h3: ({ children }: { children?: React.ReactNode }) => <h3 id={slugify(nodeText(children))}>{children}</h3>,
  table: ({ children }: { children?: React.ReactNode }) => (
    <div className="not-prose my-6 overflow-x-auto border border-border">
      <table className="w-full min-w-[34rem] border-collapse text-left text-sm [&_td]:border-t [&_td]:border-border [&_td]:px-3 [&_td]:py-2.5 [&_td]:align-top [&_th]:bg-muted/60 [&_th]:px-3 [&_th]:py-2.5 [&_th]:font-semibold [&_tr>*:first-child]:font-medium">
        {children}
      </table>
    </div>
  ),
}

export function MarkdownBody({ source }: { source: string }) {
  return (
    <div className="prose max-w-none prose-headings:scroll-mt-24 prose-headings:tracking-tight prose-a:text-primary prose-a:underline-offset-4 prose-li:my-1">
      <MDXRemote source={source} components={components} options={{ mdxOptions: { remarkPlugins: [remarkGfm] } }} />
    </div>
  )
}
