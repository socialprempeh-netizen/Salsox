/**
 * The sender's documents, newest activity first, filterable by status and
 * searchable by title or recipient email. Each row shows who still has to act,
 * so "who am I waiting on?" is answerable without opening anything.
 */
import Link from "next/link"
import { getFormatter, getTranslations } from "next-intl/server"
import type { DocumentStatus, Prisma } from "@prisma/client"
import { FileSignature, Plus, Search, Send } from "lucide-react"
import { requireUser } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { DocumentStatusBadge } from "@/components/esign/document-status-badge"
import { cn } from "@/lib/utils"

const FILTERS = ["ALL", "PENDING", "COMPLETED", "DRAFT", "EXPIRED"] as const
type Filter = (typeof FILTERS)[number]

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const { status: rawStatus, q } = await searchParams
  const status: Filter = FILTERS.includes(rawStatus as Filter) ? (rawStatus as Filter) : "ALL"
  const query = (q ?? "").trim()
  const t = await getTranslations("esign.list")
  const format = await getFormatter()
  const user = await requireUser()

  const where: Prisma.DocumentWhereInput = {
    userId: user.id,
    ...(status !== "ALL" ? { status: status as DocumentStatus } : {}),
    ...(query
      ? {
          OR: [
            { title: { contains: query, mode: "insensitive" } },
            { recipients: { some: { email: { contains: query, mode: "insensitive" } } } },
          ],
        }
      : {}),
  }
  const documents = await prisma.document.findMany({
    where,
    include: { recipients: { select: { name: true, signingStatus: true, role: true } } },
    orderBy: { updatedAt: "desc" },
    take: 100,
  })

  const href = (s: Filter) => {
    const params = new URLSearchParams()
    if (s !== "ALL") params.set("status", s)
    if (query) params.set("q", query)
    const qs = params.toString()
    return `/dashboard/documents${qs ? `?${qs}` : ""}`
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="mt-1 text-muted-foreground">{t("subtitle")}</p>
        </div>
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
          <Button asChild>
            <Link href="/dashboard/documents/quick-send"><Send className="h-4 w-4" /> {t("quickSend")}</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/dashboard/documents/new"><Plus className="h-4 w-4" /> {t("new")}</Link>
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Horizontally scrollable on phones rather than wrapping into a wall of chips. */}
        <nav className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0" aria-label={t("filterLabel")}>
          {FILTERS.map((f) => (
            <Link
              key={f}
              href={href(f)}
              aria-current={status === f ? "page" : undefined}
              className={cn(
                "shrink-0 rounded-full border px-4 py-2 text-sm font-medium",
                status === f ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t(`filter.${f}`)}
            </Link>
          ))}
        </nav>
        <form className="relative w-full sm:w-64" action="/dashboard/documents">
          {status !== "ALL" && <input type="hidden" name="status" value={status} />}
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input name="q" defaultValue={query} placeholder={t("searchPlaceholder")} className="pl-9" aria-label={t("searchPlaceholder")} />
        </form>
      </div>

      {documents.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-16 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <FileSignature className="h-6 w-6" />
          </span>
          <p className="mt-4 font-medium">{query || status !== "ALL" ? t("noResults") : t("emptyTitle")}</p>
          <p className="mt-1 max-w-xs text-sm text-muted-foreground">{t("emptyBody")}</p>
        </Card>
      ) : (
        <ul className="divide-y rounded-2xl border bg-card">
          {documents.map((d) => {
            const signers = d.recipients.filter((r) => r.role === "SIGNER" || r.role === "APPROVER")
            const signed = signers.filter((r) => r.signingStatus === "SIGNED").length
            const target = d.status === "DRAFT" ? `/dashboard/documents/${d.id}/edit` : `/dashboard/documents/${d.id}`
            return (
              <li key={d.id}>
                <Link href={target} className="flex items-center gap-3 p-4 hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{d.title}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {signers.length > 0 ? t("signedOf", { signed, total: signers.length }) : t("noRecipients")}
                      {" · "}
                      {format.relativeTime(d.updatedAt)}
                    </p>
                  </div>
                  <DocumentStatusBadge status={d.status} />
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
