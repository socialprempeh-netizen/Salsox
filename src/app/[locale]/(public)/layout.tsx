import { setRequestLocale } from "next-intl/server"
import { Navbar } from "@/components/landing/navbar"
import { Footer } from "@/components/landing/footer"
import { BackToTop } from "@/components/landing/back-to-top"
import { DemoBanner } from "@/components/landing/demo-banner"
import { StickyHeader } from "@/components/landing/sticky-header"

/**
 * The public pages' frame: header, footer, back-to-top.
 *
 * Async only to state the locale (see the note below): with it, and with no
 * session read in the navbar any more, the pages under this layout can be
 * static.
 */
export default async function PublicLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  // Every layout and page under [locale] states its locale itself: Next
  // renders them independently, so the call in [locale]/layout.tsx does not
  // reach this one, and without it next-intl reads a request header, which
  // makes the page dynamic (next-intl's static rendering setup).
  setRequestLocale((await params).locale)
  return (
    <div className="flex min-h-screen flex-col">
      <StickyHeader>
        <DemoBanner />
        <Navbar />
      </StickyHeader>
      <main className="flex-1">{children}</main>
      <Footer />
      <BackToTop />
    </div>
  )
}
