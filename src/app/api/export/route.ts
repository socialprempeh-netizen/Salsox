/**
 * Export everything: GET /api/export?part=N → a ZIP of the account's documents.
 *
 * For each document: the original PDF, the signed PDF when there is one, and
 * the audit trail as JSON, plus an index.csv for the part. Works on every
 * plan, including free and cancelled accounts: leaving must never mean losing
 * your records.
 *
 * Streamed for real: `zipStream` (src/lib/esign/zip-stream.ts) loads one file
 * at a time, when the download asks for more, and documents are read from the
 * database as the archive reaches them. A large account is split into parts
 * of EXPORT_DOCUMENTS_PER_PART documents, each its own download (the billing
 * page lists them), so no single response runs past the function's time limit
 * or the 4 GB a plain ZIP can address.
 */
import { getCurrentUser } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { checkRateLimit } from "@/lib/rate-limit"
import { getFile } from "@/lib/esign/storage"
import { contentDisposition, safeFileName } from "@/lib/esign/files"
import { EXPORT_DOCUMENTS_PER_PART, exportPartCount, parseExportPart, zipStream, type ZipEntry } from "@/lib/esign/zip-stream"

// The longest a part may stream for on Vercel.
export const maxDuration = 300

function csvCell(value: string | number | null | undefined): string {
  const s = value === null || value === undefined ? "" : String(value)
  // Leading = + - @ would make a spreadsheet evaluate the cell as a formula.
  const neutral = /^[=+\-@]/.test(s) ? `'${s}` : s
  return `"${neutral.replace(/"/g, '""')}"`
}

/** How many documents are read from the database per query while streaming. */
const BATCH = 20

/** The entries of one part, produced as the archive asks for them. */
async function* partEntries(userId: string, part: number): AsyncGenerator<ZipEntry> {
  const rows = [["id", "title", "status", "created", "completed", "recipients"].map(csvCell).join(",")]
  const start = (part - 1) * EXPORT_DOCUMENTS_PER_PART
  for (let skip = start; skip < start + EXPORT_DOCUMENTS_PER_PART; skip += BATCH) {
    const documents = await prisma.document.findMany({
      where: { userId },
      include: { recipients: true },
      // id breaks ties, so the pages never overlap or skip a document.
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      skip,
      take: Math.min(BATCH, start + EXPORT_DOCUMENTS_PER_PART - skip),
    })
    if (documents.length === 0) break
    for (const d of documents) {
      const folder = `${safeFileName(d.title)} (${d.id.slice(-8)})`
      yield { name: `${folder}/original.pdf`, data: () => getFile(d.originalKey), modified: d.createdAt }
      if (d.sealedKey) yield { name: `${folder}/signed.pdf`, data: () => getFile(d.sealedKey!), modified: d.completedAt ?? d.updatedAt }
      yield {
        name: `${folder}/audit.json`,
        modified: d.updatedAt,
        data: async () => {
          const events = await prisma.auditEvent.findMany({ where: { documentId: d.id }, orderBy: { createdAt: "asc" } })
          return new TextEncoder().encode(
            JSON.stringify(
              {
                id: d.id,
                title: d.title,
                status: d.status,
                originalSha256: d.originalSha256,
                sealedSha256: d.sealedSha256,
                recipients: d.recipients.map((r) => ({ name: r.name, email: r.email, role: r.role, status: r.signingStatus, signedAt: r.signedAt })),
                events: events.map((e) => ({ at: e.createdAt, type: e.type, actor: e.actorEmail, ip: e.ipAddress, data: e.data })),
              },
              null,
              2
            )
          )
        },
      }
      rows.push(
        [d.id, d.title, d.status, d.createdAt.toISOString(), d.completedAt?.toISOString() ?? "", d.recipients.map((r) => r.email).join("; ")]
          .map(csvCell)
          .join(",")
      )
    }
  }
  // Last, so it lists exactly what this part contains.
  yield { name: "index.csv", data: new TextEncoder().encode(rows.join("\n") + "\n") }
}

export async function GET(request: Request) {
  const user = await getCurrentUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })
  // Per part, so an account with many parts can fetch them all in one sitting.
  if (!(await checkRateLimit(`esign:export:${user.id}`, 60, 60 * 60 * 1000))) {
    return Response.json({ error: "Too many exports, try again later" }, { status: 429 })
  }

  const parts = exportPartCount(await prisma.document.count({ where: { userId: user.id } }))
  const part = parseExportPart(new URL(request.url).searchParams.get("part"), parts)
  if (part === null) return Response.json({ error: `There are ${parts} parts` }, { status: 404 })

  const date = new Date().toISOString().slice(0, 10)
  const name = parts > 1 ? `documents-export-${date}-part-${part}-of-${parts}.zip` : `documents-export-${date}.zip`
  return new Response(zipStream(partEntries(user.id, part)), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": contentDisposition(name),
      "Cache-Control": "private, no-store",
    },
  })
}

// Replaced by the version above. This one added every PDF to a JSZip object
// before sending a byte, so the whole archive was in memory at once and the
// export failed on large accounts; and it loaded every document with its full
// audit trail in a single query.
// /**
//  * Export everything: GET /api/export → one ZIP with every document.
//  *
//  * For each document: the original PDF, the signed PDF when there is one, and
//  * the audit trail as JSON, plus an index.csv at the top. Works on every plan,
//  * including free and cancelled accounts: leaving must never mean losing your
//  * records.
//  *
//  * The archive is streamed as it is built, so memory stays flat however many
//  * documents there are.
//  */
// import JSZip from "jszip"
// import { getCurrentUser } from "@/lib/auth"
// import { prisma } from "@/lib/prisma"
// import { checkRateLimit } from "@/lib/rate-limit"
// import { getFile } from "@/lib/esign/storage"
// import { contentDisposition, safeFileName } from "@/lib/esign/files"
//
// function csvCell(value: string | number | null | undefined): string {
//   const s = value === null || value === undefined ? "" : String(value)
//   // Leading = + - @ would make a spreadsheet evaluate the cell as a formula.
//   const neutral = /^[=+\-@]/.test(s) ? `'${s}` : s
//   return `"${neutral.replace(/"/g, '""')}"`
// }
//
// export async function GET() {
//   const user = await getCurrentUser()
//   if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })
//   if (!(await checkRateLimit(`esign:export:${user.id}`, 10, 60 * 60 * 1000))) {
//     return Response.json({ error: "Too many exports, try again later" }, { status: 429 })
//   }
//
//   const documents = await prisma.document.findMany({
//     where: { userId: user.id },
//     include: { recipients: true, auditEvents: { orderBy: { createdAt: "asc" } } },
//     orderBy: { createdAt: "asc" },
//   })
//
//   const zip = new JSZip()
//   const rows = [["id", "title", "status", "created", "completed", "recipients"].map(csvCell).join(",")]
//   for (const d of documents) {
//     const folder = zip.folder(`${safeFileName(d.title)} (${d.id.slice(-8)})`)!
//     folder.file("original.pdf", await getFile(d.originalKey))
//     if (d.sealedKey) folder.file("signed.pdf", await getFile(d.sealedKey))
//     folder.file(
//       "audit.json",
//       JSON.stringify(
//         {
//           id: d.id,
//           title: d.title,
//           status: d.status,
//           originalSha256: d.originalSha256,
//           sealedSha256: d.sealedSha256,
//           recipients: d.recipients.map((r) => ({ name: r.name, email: r.email, role: r.role, status: r.signingStatus, signedAt: r.signedAt })),
//           events: d.auditEvents.map((e) => ({ at: e.createdAt, type: e.type, actor: e.actorEmail, ip: e.ipAddress, data: e.data })),
//         },
//         null,
//         2
//       )
//     )
//     rows.push(
//       [d.id, d.title, d.status, d.createdAt.toISOString(), d.completedAt?.toISOString() ?? "", d.recipients.map((r) => r.email).join("; ")]
//         .map(csvCell)
//         .join(",")
//     )
//   }
//   zip.file("index.csv", rows.join("\n") + "\n")
//
//   const stream = new ReadableStream<Uint8Array>({
//     start(controller) {
//       zip
//         .generateInternalStream({ type: "uint8array", streamFiles: true, compression: "DEFLATE" })
//         .on("data", (chunk) => controller.enqueue(chunk))
//         .on("error", (err) => controller.error(err))
//         .on("end", () => controller.close())
//         .resume()
//     },
//   })
//
//   const date = new Date().toISOString().slice(0, 10)
//   return new Response(stream, {
//     headers: {
//       "Content-Type": "application/zip",
//       "Content-Disposition": contentDisposition(`documents-export-${date}.zip`),
//       "Cache-Control": "private, no-store",
//     },
//   })
// }
