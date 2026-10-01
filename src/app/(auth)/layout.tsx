import type { Metadata } from "next"

/**
 * Sign-in, sign-up and recovery pages: useful to a visitor, worthless as a
 * search result. `noindex` keeps them out of the index while `follow` lets a
 * crawler that landed here continue to the public pages they link to. They
 * stay crawlable in robots.txt on purpose: a page that is never fetched never
 * has its noindex read. They are also left out of the sitemap.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: true },
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-muted/40">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-grid" />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[500px] bg-glow" />
      <div className="relative w-full max-w-md px-4">{children}</div>
    </div>
  )
}
