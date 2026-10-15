"use client"

/**
 * The working sheet behind /admin/outreach: every manual conversation with a
 * prospect, one row each, so seventy-odd threads across LinkedIn, email and
 * Reddit stay in one place.
 *
 * - A filter bar with counts (all, due a follow-up, and each status) and a
 *   search over name, company and notes. The rules live in src/lib/outreach.ts.
 * - Status changes straight from the list, the thing done most often, saved
 *   as soon as it is picked and shown at once (rolled back if the save fails).
 * - One form for adding and editing, opened above the list; delete sits in it
 *   behind a second confirming tap.
 * - A table from `md` up and a card per row below it, like the other admin
 *   views, so a phone never scrolls sideways.
 *
 * Motion: the form panel expands and collapses, and rows animate in, out and
 * into their new place when the filter or a save reorders the list
 * (framer-motion layout). Under prefers-reduced-motion it all snaps.
 */
import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { useFormatter, useTranslations } from "next-intl"
import { toast } from "sonner"
import { Plus, Search, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { deleteOutreachContact, saveOutreachContact, setOutreachStatus, type OutreachResult } from "@/app/actions/outreach"
import {
  filterOutreach,
  needsFollowUp,
  OUTREACH_CHANNELS,
  OUTREACH_LIMITS,
  OUTREACH_STATUSES,
  summarizeOutreach,
  type OutreachFilter,
  type OutreachInput,
  type OutreachRow,
  type OutreachStatus,
} from "@/lib/outreach"
import { cn } from "@/lib/utils"

const FILTERS: OutreachFilter[] = ["all", "followUp", ...OUTREACH_STATUSES]

// One colour per status, used by the select in each row: grey while waiting,
// blue once they answer, green when they signed up.
const STATUS_TONE: Record<OutreachStatus, string> = {
  NO_REPLY: "border-border bg-muted/40 text-muted-foreground",
  REPLIED: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  CONVERTED: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
}

const SELECT =
  "h-11 w-full border border-input bg-card px-3 text-base text-foreground transition-colors hover:border-foreground/50 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25"

export function OutreachTracker({ rows: initial, today }: { rows: OutreachRow[]; today: string }) {
  const t = useTranslations("admin.outreach")
  const router = useRouter()
  const format = useFormatter()
  const reduceMotion = useReducedMotion()
  const [rows, setRows] = useState(initial)
  const [filter, setFilter] = useState<OutreachFilter>("all")
  const [query, setQuery] = useState("")
  // null: form closed; "new": adding; otherwise the id being edited.
  const [editing, setEditing] = useState<string | null>(null)

  // The server's list wins whenever a save refreshes the page.
  const [seen, setSeen] = useState(initial)
  if (initial !== seen) {
    setSeen(initial)
    setRows(initial)
  }

  // Formatted in UTC, the zone the day is stored in: in the viewer's own zone,
  // midnight UTC is still the previous evening anywhere west of Greenwich.
  const day = (d: string) => format.dateTime(new Date(`${d}T00:00:00Z`), { dateStyle: "medium", timeZone: "UTC" })

  const summary = useMemo(() => summarizeOutreach(rows, today), [rows, today])
  const visible = useMemo(() => filterOutreach(rows, filter, query, today), [rows, filter, query, today])
  const editingRow = editing && editing !== "new" ? rows.find((r) => r.id === editing) ?? null : null

  const fail = (result: OutreachResult) => {
    if (!result.ok) toast.error(t(`errors.${result.error}`))
  }

  const changeStatus = async (id: string, status: OutreachStatus) => {
    const before = rows
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, status } : r)))
    try {
      const result = await setOutreachStatus(id, status)
      if (!result.ok) {
        setRows(before)
        fail(result)
      } else router.refresh()
    } catch {
      setRows(before)
      toast.error(t("errors.saveFailed"))
    }
  }

  const rowMotion = {
    layout: !reduceMotion,
    initial: reduceMotion ? false : { opacity: 0, y: 6 },
    animate: { opacity: 1, y: 0 },
    exit: reduceMotion ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, transition: { duration: 0.15 } },
    transition: { duration: 0.2, ease: "easeOut" },
  } as const

  const statusSelect = (r: OutreachRow, className?: string) => (
    <select
      aria-label={t("statusFor", { name: r.name })}
      value={r.status}
      onChange={(e) => changeStatus(r.id, e.target.value as OutreachStatus)}
      className={cn(
        "h-9 border px-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25",
        STATUS_TONE[r.status],
        className
      )}
    >
      {OUTREACH_STATUSES.map((s) => (
        <option key={s} value={s}>
          {t(`status.${s}`)}
        </option>
      ))}
    </select>
  )

  const followUpTag = (r: OutreachRow) =>
    needsFollowUp(r, today) && (
      <span className="border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
        {t("followUpTag")}
      </span>
    )

  return (
    <div className="space-y-4">
      {/* Filters scroll inside their own strip on a phone, never the page. */}
      <div className="-mx-6 overflow-x-auto px-6 md:mx-0 md:px-0">
        <div role="tablist" aria-label={t("filtersLabel")} className="flex w-max gap-1.5">
          {FILTERS.map((f) => {
            const count = f === "all" ? summary.total : f === "followUp" ? summary.followUp : summary[f]
            const active = filter === f
            return (
              <button
                key={f}
                role="tab"
                aria-selected={active}
                onClick={() => setFilter(f)}
                className={cn(
                  "relative inline-flex h-9 items-center gap-2 border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25",
                  active ? "border-foreground text-foreground" : "border-border text-muted-foreground hover:border-foreground/50 hover:text-foreground"
                )}
              >
                {active && (
                  <motion.span
                    layoutId="outreach-filter"
                    className="absolute inset-0 -z-10 bg-accent"
                    transition={reduceMotion ? { duration: 0 } : { type: "spring", bounce: 0.15, duration: 0.35 }}
                  />
                )}
                {t(`filter.${f}`)}
                <span className="tabular-nums text-xs text-muted-foreground">{count}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            aria-label={t("searchLabel")}
            placeholder={t("searchPlaceholder")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button onClick={() => setEditing(editing === "new" ? null : "new")} aria-expanded={editing === "new"}>
          <Plus aria-hidden className="h-4 w-4" />
          {t("add")}
        </Button>
      </div>

      <AnimatePresence initial={false}>
        {editing && (
          <motion.div
            key={editing}
            initial={reduceMotion ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduceMotion ? { opacity: 0, transition: { duration: 0 } } : { height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <OutreachForm
              row={editingRow}
              today={today}
              onClose={() => setEditing(null)}
              onSaved={() => {
                setEditing(null)
                router.refresh()
              }}
              onDeleted={(id) => {
                setRows((rs) => rs.filter((r) => r.id !== id))
                setEditing(null)
                router.refresh()
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="border border-border bg-card">
        {visible.length === 0 ? (
          <p className="p-8 text-center text-muted-foreground">
            {rows.length === 0 ? t("empty") : t("noMatches")}
          </p>
        ) : (
          <>
            {/* Phone: one card per conversation. */}
            <ul className="divide-y divide-border md:hidden">
              <AnimatePresence initial={false}>
                {visible.map((r) => (
                  <motion.li key={r.id} {...rowMotion} className="space-y-2 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <button onClick={() => setEditing(r.id)} className="min-w-0 text-left focus-visible:outline-none focus-visible:underline">
                        <p className="truncate font-medium">{r.name}</p>
                        {r.company && <p className="truncate text-sm text-muted-foreground">{r.company}</p>}
                      </button>
                      {statusSelect(r, "shrink-0")}
                    </div>
                    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span>{t(`channel.${r.channel}`)}</span>
                      <span>{t("contactedOn", { date: day(r.contactedAt) })}</span>
                      {followUpTag(r)}
                    </p>
                    {r.notes && <p className="line-clamp-3 break-words text-sm text-muted-foreground">{r.notes}</p>}
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>

            {/* Wider screens: the spreadsheet view. */}
            <table className="hidden w-full text-sm md:table">
              <thead className="border-b border-border text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">{t("col.name")}</th>
                  <th className="px-4 py-3 font-medium">{t("col.company")}</th>
                  <th className="px-4 py-3 font-medium">{t("col.channel")}</th>
                  <th className="px-4 py-3 font-medium">{t("col.contacted")}</th>
                  <th className="px-4 py-3 font-medium">{t("col.status")}</th>
                  <th className="px-4 py-3 font-medium">{t("col.notes")}</th>
                  <th className="px-4 py-3"><span className="sr-only">{t("col.actions")}</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <AnimatePresence initial={false}>
                  {visible.map((r) => (
                    <motion.tr key={r.id} {...rowMotion} className="align-top transition-colors hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium">{r.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{r.company ?? "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{t(`channel.${r.channel}`)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                        <div className="flex flex-col items-start gap-1">
                          {day(r.contactedAt)}
                          {followUpTag(r)}
                        </div>
                      </td>
                      <td className="px-4 py-2">{statusSelect(r)}</td>
                      <td className="max-w-xs px-4 py-3 text-muted-foreground">
                        <p className="line-clamp-2 break-words" title={r.notes ?? undefined}>{r.notes ?? ""}</p>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <Button variant="ghost" size="sm" onClick={() => setEditing(r.id)}>
                          {t("edit")}
                        </Button>
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  )
}

/** Add or edit one conversation. Empty when `row` is null. */
function OutreachForm({
  row,
  today,
  onClose,
  onSaved,
  onDeleted,
}: {
  row: OutreachRow | null
  today: string
  onClose: () => void
  onSaved: () => void
  onDeleted: (id: string) => void
}) {
  const t = useTranslations("admin.outreach")
  const [pending, startTransition] = useTransition()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = (form: FormData) => {
    const input: Record<keyof OutreachInput, unknown> = {
      name: form.get("name"),
      company: form.get("company"),
      channel: form.get("channel"),
      contactedAt: form.get("contactedAt"),
      status: form.get("status"),
      notes: form.get("notes"),
    }
    setError(null)
    startTransition(async () => {
      try {
        const result = await saveOutreachContact(row?.id ?? null, input)
        if (!result.ok) return setError(t(`errors.${result.error}`))
        toast.success(row ? t("saved") : t("added"))
        onSaved()
      } catch {
        setError(t("errors.saveFailed"))
      }
    })
  }

  const remove = () => {
    if (!row) return
    if (!confirmDelete) return setConfirmDelete(true)
    startTransition(async () => {
      try {
        const result = await deleteOutreachContact(row.id)
        if (!result.ok) return setError(t(`errors.${result.error}`))
        toast.success(t("deleted"))
        onDeleted(row.id)
      } catch {
        setError(t("errors.saveFailed"))
      }
    })
  }

  return (
    <form action={submit} className="border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border p-4">
        <h2 className="font-semibold">{row ? t("editTitle", { name: row.name }) : t("addTitle")}</h2>
        <button type="button" onClick={onClose} aria-label={t("close")} className="p-1 text-muted-foreground transition-colors hover:text-foreground">
          <X aria-hidden className="h-4 w-4" />
        </button>
      </div>

      <div className="grid gap-4 p-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="outreach-name">{t("col.name")}</Label>
          <Input id="outreach-name" name="name" required maxLength={OUTREACH_LIMITS.name} defaultValue={row?.name} autoFocus />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="outreach-company">{t("col.company")}</Label>
          <Input id="outreach-company" name="company" maxLength={OUTREACH_LIMITS.company} defaultValue={row?.company ?? ""} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="outreach-channel">{t("col.channel")}</Label>
          <select id="outreach-channel" name="channel" defaultValue={row?.channel ?? "LINKEDIN"} className={SELECT}>
            {OUTREACH_CHANNELS.map((c) => (
              <option key={c} value={c}>
                {t(`channel.${c}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="outreach-date">{t("col.contacted")}</Label>
          <Input id="outreach-date" name="contactedAt" type="date" required max={today} defaultValue={row?.contactedAt ?? today} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="outreach-status">{t("col.status")}</Label>
          <select id="outreach-status" name="status" defaultValue={row?.status ?? "NO_REPLY"} className={SELECT}>
            {OUTREACH_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`status.${s}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="outreach-notes">{t("col.notes")}</Label>
          <Textarea id="outreach-notes" name="notes" rows={3} maxLength={OUTREACH_LIMITS.notes} defaultValue={row?.notes ?? ""} placeholder={t("notesPlaceholder")} />
        </div>
      </div>

      {error && (
        <p role="alert" className="px-4 pb-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex flex-col-reverse gap-2 border-t border-border p-4 sm:flex-row sm:items-center sm:justify-between">
        {row ? (
          <Button type="button" variant={confirmDelete ? "destructive" : "ghost"} size="sm" onClick={remove} disabled={pending}>
            {confirmDelete ? t("confirmDelete") : t("delete")}
          </Button>
        ) : (
          <span />
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
            {t("cancel")}
          </Button>
          <Button type="submit" loading={pending}>
            {row ? t("save") : t("add")}
          </Button>
        </div>
      </div>
    </form>
  )
}
