/**
 * /cookies: rendered from content/legal/cookies.md by the shared LegalDocument.
 *
 * The text was drafted with AI assistance and has NOT been reviewed by a
 * lawyer (see the note in the Markdown file and src/lib/legal.ts). It
 * replaced a placeholder template that said so on the page.
 */
import { getFormatter, getTranslations } from "next-intl/server"
import { getLegalDocument } from "@/lib/legal"
import { pageMetadata } from "@/lib/metadata"
import { siteConfig } from "@/config/site"
import { LegalDocument } from "@/components/legal/legal-document"

const doc = getLegalDocument("cookies")

export const metadata = pageMetadata({
  title: `${doc.title} | ${siteConfig.name}`,
  description: doc.description,
  path: "/cookies",
})

export default async function CookiesPage() {
  const [t, format] = await Promise.all([getTranslations("legal"), getFormatter()])
  const updated = format.dateTime(new Date(`${doc.updated}T00:00:00Z`), { dateStyle: "long", timeZone: "UTC" })
  return <LegalDocument doc={doc} updatedLabel={t("updated", { date: updated })} />
}

// Replaced by the version above. This was the starter kit's placeholder: a
// template with a box saying it was one, describing "projects" rather than
// documents and signatures, and a "last updated" date that was always today.
// import { siteConfig } from "@/config/site"
// import { pageMetadata } from "@/lib/metadata"
// import { isKitSite } from "@/config/kit"
//
// export const metadata = pageMetadata({
//   title: `Cookie Policy | ${siteConfig.name}`,
//   description: `Which cookies ${siteConfig.name} sets, and why.`,
//   path: "/cookies",
// })
//
// // ⚠️ Placeholder page: this is a structural template, NOT legal advice.
// // It reflects what the kit does out of the box (technical cookies only) —
// // update it if you add analytics or any third-party tracking, and have it
// // reviewed for your jurisdiction before going to production.
// export default function CookiesPage() {
//   return (
//     <section className="py-24">
//       <div className="mx-auto max-w-3xl px-6 lg:px-12">
//         <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
//           Cookie Policy
//         </h1>
//         <p className="mt-2 text-sm text-muted-foreground">
//           Last updated: {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
//         </p>
//
//         <div className="mt-10 space-y-8 text-sm leading-7 text-muted-foreground">
//           <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-5">
//             <p className="font-medium text-foreground">This is a placeholder.</p>
//             <p className="mt-1">
//               It describes what this {isKitSite ? "starter kit" : "app"} stores out of the box. If
//               you add analytics or any third-party tracking, update this page accordingly.
//             </p>
//           </div>
//
//           <div>
//             <h2 className="mb-2 text-lg font-semibold text-foreground">1. What we store</h2>
//             <p>
//               We only use <strong className="text-foreground">technical cookies</strong>, strictly
//               necessary to operate the service: a session cookie that keeps you signed in. It is
//               set only when you sign in and removed when you sign out.
//             </p>
//           </div>
//
//           <div>
//             <h2 className="mb-2 text-lg font-semibold text-foreground">2. Local storage</h2>
//             <p>
//               Your theme preference (light/dark mode) is saved in your browser&apos;s local
//               storage. It never leaves your device and contains no personal data.
//             </p>
//           </div>
//
//           <div>
//             <h2 className="mb-2 text-lg font-semibold text-foreground">3. No tracking</h2>
//             <p>
//               We do not use advertising, profiling, or third-party tracking cookies. Because we
//               only use cookies that are strictly necessary, no consent banner is required.
//             </p>
//           </div>
//
//           <div>
//             <h2 className="mb-2 text-lg font-semibold text-foreground">4. Questions</h2>
//             <p>
//               Anything unclear? Write to{" "}
//               <a href={`mailto:${siteConfig.contactEmail}`} className="text-foreground underline underline-offset-4">
//                 {siteConfig.contactEmail}
//               </a>
//               .
//             </p>
//           </div>
//         </div>
//       </div>
//     </section>
//   )
// }
