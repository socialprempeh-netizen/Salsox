/**
 * Export everything: GET /api/export → one ZIP with every document.
 *
 * For each document: the original PDF, the signed PDF when there is one, and
 * the audit trail as JSON, plus an index.csv at the top. Works on every plan,
 * including free and cancelled accounts: leaving must never mean losing your
 * records.
 *
 * The archive is streamed as it is built, so memory stays flat however many
 * documents there are.
 */
import JSZip from "jszip"
import { getCurrentUser } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { checkRateLimit } from "@/lib/rate-limit"
import { getFile } from "@/lib/esign/storage"
import { contentDisposition, safeFileName } from "@/lib/esign/files"

function csvCell(value: string | number | null | undefined): string {
  const s = value === null || value === undefined ? "" : String(value)
  // Leading = + - @ would make a spreadsheet evaluate the cell as a formula.
  const neutral = /^[=+\-@]/.test(s) ? `'${s}` : s
  return `"${neutral.replace(/"/g, '""')}"`
}

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })
  if (!(await checkRateLimit(`esign:export:${user.id}`, 10, 60 * 60 * 1000))) {
    return Response.json({ error: "Too many exports, try again later" }, { status: 429 })
  }

  const documents = await prisma.document.findMany({
    where: { userId: user.id },
    include: { recipients: true, auditEvents: { orderBy: { createdAt: "asc" } } },
    orderBy: { createdAt: "asc" },
  })

  const zip = new JSZip()
  const rows = [["id", "title", "status", "created", "completed", "recipients"].map(csvCell).join(",")]
  for (const d of documents) {
    const folder = zip.folder(`${safeFileName(d.title)} (${d.id.slice(-8)})`)!
    folder.file("original.pdf", await getFile(d.originalKey))
    if (d.sealedKey) folder.file("signed.pdf", await getFile(d.sealedKey))
    folder.file(
      "audit.json",
      JSON.stringify(
        {
          id: d.id,
          title: d.title,
          status: d.status,
          originalSha256: d.originalSha256,
          sealedSha256: d.sealedSha256,
          recipients: d.recipients.map((r) => ({ name: r.name, email: r.email, role: r.role, status: r.signingStatus, signedAt: r.signedAt })),
          events: d.auditEvents.map((e) => ({ at: e.createdAt, type: e.type, actor: e.actorEmail, ip: e.ipAddress, data: e.data })),
        },
        null,
        2
      )
    )
    rows.push(
      [d.id, d.title, d.status, d.createdAt.toISOString(), d.completedAt?.toISOString() ?? "", d.recipients.map((r) => r.email).join("; ")]
        .map(csvCell)
        .join(",")
    )
  }
  zip.file("index.csv", rows.join("\n") + "\n")

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      zip
        .generateInternalStream({ type: "uint8array", streamFiles: true, compression: "DEFLATE" })
        .on("data", (chunk) => controller.enqueue(chunk))
        .on("error", (err) => controller.error(err))
        .on("end", () => controller.close())
        .resume()
    },
  })

  const date = new Date().toISOString().slice(0, 10)
  return new Response(stream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": contentDisposition(`documents-export-${date}.zip`),
      "Cache-Control": "private, no-store",
    },
  })
}
