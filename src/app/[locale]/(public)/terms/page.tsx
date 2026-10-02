/**
 * /terms: rendered from content/legal/terms.md by the shared LegalDocument.
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

const doc = getLegalDocument("terms")

export const metadata = pageMetadata({
  title: `${doc.title} | ${siteConfig.name}`,
  description: doc.description,
  path: "/terms",
})

export default async function TermsPage() {
  const [t, format] = await Promise.all([getTranslations("legal"), getFormatter()])
  const updated = format.dateTime(new Date(`${doc.updated}T00:00:00Z`), { dateStyle: "long", timeZone: "UTC" })
  return <LegalDocument doc={doc} updatedLabel={t("updated", { date: updated })} />
}

// Replaced by the version above. This was the starter kit's placeholder: a
// template with a box saying it was one, describing "projects" rather than
// documents and signatures, and a "last updated" date that was always today.
// import { siteConfig } from "@/config/site"
// import { pageMetadata } from "@/lib/metadata"
//
// export const metadata = pageMetadata({
//   title: `Terms of Service | ${siteConfig.name}`,
//   description: `The terms that govern use of ${siteConfig.name}.`,
//   path: "/terms",
// })
//
// // ⚠️ Placeholder page: this is a structural template, NOT legal advice.
// // Replace it with terms that match your product and have them reviewed
// // for your jurisdiction before going to production.
// export default function TermsPage() {
//   return (
//     <section className="py-24">
//       <div className="mx-auto max-w-3xl px-6 lg:px-12">
//         <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
//           Terms of Service
//         </h1>
//         <p className="mt-2 text-sm text-muted-foreground">
//           Last updated: {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
//         </p>
//
//         <div className="mt-10 space-y-8 text-sm leading-7 text-muted-foreground">
//           <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-5">
//             <p className="font-medium text-foreground">This is a placeholder.</p>
//             <p className="mt-1">
//               It sketches the sections SaaS terms usually cover. Adapt it to your product and
//               your jurisdiction before launch.
//             </p>
//           </div>
//
//           <div>
//             <h2 className="mb-2 text-lg font-semibold text-foreground">1. The service</h2>
//             <p>
//               {siteConfig.name} provides the features described on our site. We may update,
//               improve, or discontinue features over time.
//             </p>
//           </div>
//
//           <div>
//             <h2 className="mb-2 text-lg font-semibold text-foreground">2. Your account</h2>
//             <p>
//               You are responsible for your account and for the content you create. You agree not
//               to misuse the service or use it for unlawful purposes.
//             </p>
//           </div>
//
//           <div>
//             <h2 className="mb-2 text-lg font-semibold text-foreground">3. Billing</h2>
//             <p>
//               Paid plans are billed via Stripe on a recurring basis. You can cancel anytime from
//               your billing page; access continues until the end of the paid period.
//             </p>
//           </div>
//
//           <div>
//             <h2 className="mb-2 text-lg font-semibold text-foreground">4. Liability</h2>
//             <p>
//               The service is provided &quot;as is&quot; without warranties. To the extent
//               permitted by law, our liability is limited to the amount you paid in the last 12
//               months.
//             </p>
//           </div>
//
//           <div>
//             <h2 className="mb-2 text-lg font-semibold text-foreground">5. Contact</h2>
//             <p>
//               Questions about these terms:{" "}
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
