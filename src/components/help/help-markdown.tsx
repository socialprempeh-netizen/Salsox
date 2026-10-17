/**
 * Renders Help Center Markdown (articles and video scripts, src/lib/help.ts)
 * in the site's style.
 *
 * Numbered lists are the articles' steps, so they are drawn as steps: each
 * item gets a square, brand-coloured number (`.help-steps` in globals.css).
 * The number comes from a CSS counter, and a list that continues an earlier
 * one ("6. …" after a heading) carries Markdown's `start`, which resets the
 * counter to match, so step 6 never shows as 1.
 *
 * Links inside the site go through Next's Link; links elsewhere open in a new
 * tab. Server component: nothing here runs in the browser.
 */
import Link from "next/link"
import ReactMarkdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"
import { cn } from "@/lib/utils"

const components: Components = {
  ol: ({ start, children }) => (
    <ol className="help-steps" style={{ counterReset: `help-step ${(Number(start) || 1) - 1}` }}>
      {children}
    </ol>
  ),
  a: ({ href = "", children }) =>
    href.startsWith("/") ? (
      <Link href={href}>{children}</Link>
    ) : (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    ),
  // Wide tables scroll inside their own box instead of widening the page.
  table: ({ children }) => (
    <div className="not-prose my-6 overflow-x-auto border border-border">
      <table className="w-full min-w-[28rem] border-collapse text-left text-sm [&_td]:border-t [&_td]:border-border [&_td]:p-3 [&_td]:align-top [&_th]:bg-muted/50 [&_th]:p-3 [&_th]:font-semibold">
        {children}
      </table>
    </div>
  ),
}

export function HelpMarkdown({ source, className }: { source: string; className?: string }) {
  return (
    <div
      className={cn(
        "prose max-w-none prose-headings:scroll-mt-24 prose-headings:tracking-tight prose-h2:mt-10 prose-h2:text-xl prose-h3:text-base prose-a:text-primary prose-a:underline-offset-4 prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:font-normal prose-code:before:content-none prose-code:after:content-none",
        className
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {source}
      </ReactMarkdown>
    </div>
  )
}
