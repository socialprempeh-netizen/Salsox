"use client"

/**
 * The interactive parts of the Outreach agent tab (/admin/outreach/agent).
 * The page around them is a server component that loads the data; these
 * call the server actions (src/app/actions/outreach-agent.ts) and refresh.
 *
 * - AgentRunButtons: hunt for leads now, run the outreach now, and check
 *   that the crawler answers (one neutral page, no review site).
 * - SendingSettings: the trust gate (auto-send after the first batch, or
 *   review every email) with its progress squares, the daily limit, pause,
 *   and the "sent via" line for a standalone release, off by default.
 * - LeadBoard: every lead, filtered by what it needs next: an address (a
 *   form, react-hook-form with zod), a draft to approve or edit, a reply to
 *   act on ("Add to Customers" puts them in the Outreach tracker, never in an
 *   account). Destructive actions ask for a second tap.
 * - SocialPanel: draft posts for the connected accounts, edit, schedule,
 *   publish now.
 *
 * Motion (framer-motion): the filter underline and the mode tint slide, cards
 * enter and leave, disclosures open in place. Everything snaps under
 * prefers-reduced-motion.
 */
import { useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { useFormatter, useTranslations } from "next-intl"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { AtSign, CalendarClock, Check, ChevronDown, Crosshair, ExternalLink, Minus, PenLine, PlugZap, Plus, Send, Sparkles, Star, UserPlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Chip, Empty, type Tone } from "@/components/admin/admin-ui"
import { SegmentMeter } from "@/components/admin/segment-meter"
import {
  addLeadToCustomers,
  checkCrawlerNow,
  discardDraft,
  discardPost,
  draftPosts,
  huntNow,
  logReply,
  publishPostNow,
  retryDraft,
  runOutreachNow,
  saveDraft,
  savePost,
  schedulePost,
  sendDraft,
  setLeadContact,
  skipLead,
  updateOutreachSettings,
  type OutreachAgentResult,
} from "@/app/actions/outreach-agent"
import { cn } from "@/lib/utils"

// ── Types the page hands over (dates as ISO strings) ─────────────────────

type LeadStatus = "NEEDS_CONTACT" | "READY" | "CONTACTED" | "REPLIED" | "SKIPPED" | "UNSUBSCRIBED"
type MessageStatus = "DRAFT" | "SENT" | "DISCARDED" | "FAILED"
type ReplyCategory = "INTERESTED" | "QUESTION" | "NOT_NOW" | "NOT_INTERESTED" | "UNSUBSCRIBE" | "OUT_OF_OFFICE" | "OTHER"
type Platform = "FACEBOOK" | "LINKEDIN" | "X"
type PostStatus = "DRAFT" | "SCHEDULED" | "PUBLISHED" | "FAILED"
type Source = "g2" | "capterra" | "trustpilot" | "reddit" | "hackernews"

export type MessageRow = { id: string; kind: "INITIAL" | "FOLLOW_UP"; status: MessageStatus; subject: string; body: string; error: string | null; sentAt: string | null; autoSent: boolean; createdAt: string }
export type ReplyRow = { id: string; category: ReplyCategory; summary: string; text: string; receivedAt: string; source: string }
export type LeadRow = {
  id: string
  source: Source
  competitor: string
  sourceUrl: string
  rating: number | null
  quote: string
  fixLabel: string | null
  reviewerName: string | null
  reviewerRole: string | null
  company: string | null
  email: string | null
  status: LeadStatus
  inTracker: boolean
  createdAt: string
  messages: MessageRow[]
  replies: ReplyRow[]
}
export type PostRow = { id: string; platform: Platform; body: string; status: PostStatus; scheduledFor: string | null; publishedAt: string | null; error: string | null }

const SOURCE_NAME: Record<Source, string> = { g2: "G2", capterra: "Capterra", trustpilot: "Trustpilot", reddit: "Reddit", hackernews: "Hacker News" }
const LEAD_TONE: Record<LeadStatus, Tone> = { NEEDS_CONTACT: "warn", READY: "info", CONTACTED: "accent", REPLIED: "good", SKIPPED: "default", UNSUBSCRIBED: "bad" }
const MESSAGE_TONE: Record<MessageStatus, Tone> = { DRAFT: "warn", SENT: "good", DISCARDED: "default", FAILED: "bad" }
const REPLY_TONE: Record<ReplyCategory, Tone> = { INTERESTED: "good", QUESTION: "info", NOT_NOW: "default", NOT_INTERESTED: "default", UNSUBSCRIBE: "bad", OUT_OF_OFFICE: "default", OTHER: "default" }
const POST_TONE: Record<PostStatus, Tone> = { DRAFT: "default", SCHEDULED: "info", PUBLISHED: "good", FAILED: "bad" }
const PLATFORM_NAME: Record<Platform, string> = { LINKEDIN: "LinkedIn", X: "X", FACEBOOK: "Facebook" }

/** Runs an action, toasts its outcome, refreshes on success. */
function useAction() {
  const t = useTranslations("admin.outreachAgent")
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [busy, setBusy] = useState<string | null>(null)
  const run = (key: string, action: () => Promise<OutreachAgentResult>, success?: string, onDone?: (r: OutreachAgentResult) => void) => {
    setBusy(key)
    startTransition(async () => {
      try {
        const result = await action()
        if (result.ok) {
          if (success) toast.success(success, result.message && result.message.length > 12 ? { description: result.message } : undefined)
          router.refresh()
        } else {
          toast.error(result.message && result.message.length > 12 ? result.message : t(`errors.${result.error}`))
        }
        onDone?.(result)
      } catch {
        toast.error(t("errors.failed"))
      } finally {
        setBusy(null)
      }
    })
  }
  return { run, pending, busy }
}

/** A button that asks for a second tap before a destructive action. */
function ConfirmButton({ label, confirm, onConfirm, disabled }: { label: string; confirm: string; onConfirm: () => void; disabled?: boolean }) {
  const [armed, setArmed] = useState(false)
  return (
    <Button
      size="sm"
      variant={armed ? "destructive" : "ghost"}
      disabled={disabled}
      onBlur={() => setArmed(false)}
      onClick={() => {
        if (!armed) return setArmed(true)
        setArmed(false)
        onConfirm()
      }}
    >
      {armed ? confirm : label}
    </Button>
  )
}

/** Opens and closes its children in place. */
function Reveal({ open, children }: { open: boolean; children: React.ReactNode }) {
  const reduceMotion = useReducedMotion()
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          initial={reduceMotion ? false : { height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          className="overflow-hidden"
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ── Run buttons ───────────────────────────────────────────────────────────

export function AgentRunButtons({ canHunt, canSend, canCheckCrawler }: { canHunt: boolean; canSend: boolean; canCheckCrawler: boolean }) {
  const t = useTranslations("admin.outreachAgent")
  const { run, pending, busy } = useAction()
  return (
    <div className="flex shrink-0 flex-wrap gap-2">
      {canCheckCrawler && (
        <Button size="sm" variant="ghost" loading={pending && busy === "crawler"} disabled={pending} onClick={() => run("crawler", checkCrawlerNow, t("crawlerOk"))}>
          <PlugZap aria-hidden className="h-4 w-4" />
          {pending && busy === "crawler" ? t("checkingCrawler") : t("checkCrawler")}
        </Button>
      )}
      <Button size="sm" variant="outline" loading={pending && busy === "hunt"} disabled={pending || !canHunt} onClick={() => run("hunt", huntNow, t("huntDone"))}>
        <Crosshair aria-hidden className="h-4 w-4" />
        {pending && busy === "hunt" ? t("hunting") : t("huntNow")}
      </Button>
      <Button size="sm" loading={pending && busy === "send"} disabled={pending || !canSend} onClick={() => run("send", runOutreachNow, t("runDone"))}>
        <Send aria-hidden className="h-4 w-4" />
        {pending && busy === "send" ? t("running") : t("runNow")}
      </Button>
    </div>
  )
}

// ── Sending settings ──────────────────────────────────────────────────────

export function SendingSettings({ reviewEvery, paused, dailyCap, maxCap, signature, sent, reviewFirst, sentToday, toolName }: { reviewEvery: boolean; paused: boolean; dailyCap: number; maxCap: number; signature: boolean; sent: number; reviewFirst: number; sentToday: number; toolName: string | null }) {
  const t = useTranslations("admin.outreachAgent")
  const reduceMotion = useReducedMotion()
  const { run, pending } = useAction()
  const [mode, setMode] = useState(reviewEvery)
  const [cap, setCap] = useState(dailyCap)
  const left = Math.max(0, reviewFirst - sent)
  const save = (patch: Parameters<typeof updateOutreachSettings>[0]) => run("settings", () => updateOutreachSettings(patch), t("settingsSaved"))

  const options = [
    { on: false, label: t("modeAuto", { count: reviewFirst }), hint: t("modeAutoHint") },
    { on: true, label: t("modeReview"), hint: t("modeReviewHint") },
  ]

  return (
    <div className="space-y-5">
      <div role="radiogroup" aria-label={t("modeLabel")} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {options.map((option) => {
          const active = option.on === mode
          return (
            <button
              key={String(option.on)}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={pending}
              onClick={() => {
                if (active) return
                setMode(option.on)
                save({ reviewEvery: option.on })
              }}
              className={cn(
                "relative flex min-h-16 items-start gap-3 border px-4 py-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60",
                active ? "border-primary/50" : "border-border hover:border-foreground/25"
              )}
            >
              {active && <motion.span layoutId="outreach-mode" aria-hidden className="absolute inset-0 bg-primary/[0.07]" transition={reduceMotion ? { duration: 0 } : { type: "spring", bounce: 0.12, duration: 0.35 }} />}
              <span aria-hidden className={cn("relative mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center border transition-colors", active ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card")}>
                {active && <Check className="h-3.5 w-3.5" strokeWidth={2.5} />}
              </span>
              <span className="relative min-w-0">
                <span className={cn("block text-sm font-medium", active ? "text-foreground" : "text-muted-foreground")}>{option.label}</span>
                <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{option.hint}</span>
              </span>
            </button>
          )
        })}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <div className="flex gap-1" aria-hidden>
          {Array.from({ length: reviewFirst }, (_, i) => (
            <motion.span key={i} initial={false} animate={{ scale: i < sent ? 1 : 0.85 }} transition={reduceMotion ? { duration: 0 } : { delay: i * 0.06, duration: 0.2 }} className={cn("h-4 w-4 border", i < sent ? "border-primary bg-primary" : "border-border bg-muted/40")} />
          ))}
        </div>
        <p className="text-sm text-muted-foreground">{mode ? t("trialReview") : left > 0 ? t("trialLeft", { count: left }) : t("trialDone")}</p>
      </div>

      <div className="grid gap-px border border-border bg-border sm:grid-cols-3">
        <div className="bg-card p-4">
          <p className="text-sm font-medium">{t("dailyCap")}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{t("dailyCapHint", { sent: sentToday })}</p>
          <div className="mt-3 flex items-center gap-2">
            <Button size="sm" variant="outline" className="h-9 w-9 shrink-0 p-0" aria-label={t("capLess")} disabled={pending || cap <= 1} onClick={() => setCap((c) => Math.max(1, c - 5))}>
              <Minus aria-hidden className="h-4 w-4" />
            </Button>
            <span className="w-10 text-center text-lg font-semibold tabular-nums" aria-live="polite">{cap}</span>
            <Button size="sm" variant="outline" className="h-9 w-9 shrink-0 p-0" aria-label={t("capMore")} disabled={pending || cap >= maxCap} onClick={() => setCap((c) => Math.min(maxCap, c + 5))}>
              <Plus aria-hidden className="h-4 w-4" />
            </Button>
            {cap !== dailyCap && (
              <Button size="sm" disabled={pending} onClick={() => save({ dailyCap: cap })}>
                {t("save")}
              </Button>
            )}
          </div>
        </div>
        <label className="flex cursor-pointer items-start justify-between gap-4 bg-card p-4">
          <span>
            <span className="block text-sm font-medium">{t("pause")}</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">{t("pauseHint")}</span>
          </span>
          <Switch checked={paused} disabled={pending} onCheckedChange={(on) => save({ paused: on })} aria-label={t("pause")} />
        </label>
        <label className={cn("flex items-start justify-between gap-4 bg-card p-4", toolName ? "cursor-pointer" : "cursor-not-allowed")}>
          <span>
            <span className="block text-sm font-medium">{t("signature")}</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">{toolName ? t("signatureHint", { tool: toolName }) : t("signatureNoTool")}</span>
          </span>
          <Switch checked={signature} disabled={pending || !toolName} onCheckedChange={(on) => save({ signature: on })} aria-label={t("signature")} />
        </label>
      </div>
    </div>
  )
}

// ── Leads ─────────────────────────────────────────────────────────────────

type Filter = "review" | "needsContact" | "contacted" | "replied" | "all"

const needsReview = (lead: LeadRow) => lead.messages.some((m) => m.status === "DRAFT" || m.status === "FAILED")
const FILTERS: { key: Filter; test: (lead: LeadRow) => boolean }[] = [
  { key: "review", test: needsReview },
  { key: "needsContact", test: (l) => l.status === "NEEDS_CONTACT" },
  { key: "contacted", test: (l) => l.status === "CONTACTED" },
  { key: "replied", test: (l) => l.status === "REPLIED" },
  { key: "all", test: () => true },
]

export function LeadBoard({ leads }: { leads: LeadRow[] }) {
  const t = useTranslations("admin.outreachAgent")
  const reduceMotion = useReducedMotion()
  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f.key, leads.filter(f.test).length])) as Record<Filter, number>, [leads])
  const [filter, setFilter] = useState<Filter>(() => (counts.review ? "review" : counts.needsContact ? "needsContact" : counts.replied ? "replied" : "all"))
  const shown = leads.filter(FILTERS.find((f) => f.key === filter)!.test)

  return (
    <div>
      <nav aria-label={t("filterLabel")} className="overflow-x-auto border-b border-border px-2 sm:px-3">
        <ul className="flex w-max">
          {FILTERS.map((f) => {
            const active = f.key === filter
            return (
              <li key={f.key} className="relative">
                <button
                  type="button"
                  aria-pressed={active}
                  onClick={() => setFilter(f.key)}
                  className={cn("inline-flex h-11 items-center gap-2 whitespace-nowrap px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary", active ? "text-foreground" : "text-muted-foreground hover:text-foreground")}
                >
                  {t(`filter.${f.key}`)}
                  <span className={cn("min-w-5 border px-1 text-center text-xs tabular-nums", active ? "border-primary/30 bg-primary/10 text-primary-hover dark:text-primary" : "border-border bg-muted/50")}>{counts[f.key]}</span>
                </button>
                {active && <motion.span layoutId="outreach-filter" aria-hidden className="absolute inset-x-2 -bottom-px h-0.5 bg-primary" transition={reduceMotion ? { duration: 0 } : { type: "spring", bounce: 0.15, duration: 0.3 }} />}
              </li>
            )
          })}
        </ul>
      </nav>

      {shown.length === 0 ? (
        <Empty icon={Crosshair}>{t(`emptyFilter.${filter}`)}</Empty>
      ) : (
        <ul className="divide-y divide-border">
          <AnimatePresence initial={false}>
            {shown.map((lead) => (
              <motion.li key={lead.id} layout={!reduceMotion} initial={reduceMotion ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -12 }} transition={{ duration: 0.2, ease: "easeOut" }}>
                <LeadCard lead={lead} />
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </div>
  )
}

function Stars({ rating, label }: { rating: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={label}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star key={i} aria-hidden className={cn("h-3 w-3", i < rating ? "fill-amber-500 text-amber-500" : "text-border")} />
      ))}
    </span>
  )
}

function LeadCard({ lead }: { lead: LeadRow }) {
  const t = useTranslations("admin.outreachAgent")
  const format = useFormatter()
  const { run, pending, busy } = useAction()
  const [logging, setLogging] = useState(false)
  const who = [lead.reviewerName, lead.reviewerRole, lead.company].filter(Boolean).join(", ")
  const open = lead.messages.filter((m) => m.status !== "DISCARDED")
  const canLog = lead.status === "CONTACTED" || lead.status === "REPLIED"

  return (
    <article className="min-w-0 space-y-3 p-4 sm:px-5">
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone={LEAD_TONE[lead.status]}>{t(`leadStatus.${lead.status}`)}</Chip>
        <span className="text-sm font-medium">{lead.competitor}</span>
        <span className="text-xs text-muted-foreground">{t("onSource", { source: SOURCE_NAME[lead.source] })}</span>
        {lead.rating !== null && <Stars rating={lead.rating} label={t("rating", { rating: lead.rating })} />}
        {lead.fixLabel && <Chip tone="accent">{lead.fixLabel}</Chip>}
        <span className="ml-auto text-xs text-muted-foreground">{format.dateTime(new Date(lead.createdAt), { dateStyle: "medium" })}</span>
      </div>

      <blockquote className="border-l-2 border-brand-accent/60 bg-muted/25 py-2 pl-3 pr-2 text-sm leading-relaxed">&ldquo;{lead.quote}&rdquo;</blockquote>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="min-w-0 break-words">{who || t("unknownAuthor")}</span>
        {lead.email && (
          <span className="inline-flex min-w-0 items-center gap-1 break-all">
            <AtSign aria-hidden className="h-3 w-3 shrink-0" />
            {lead.email}
          </span>
        )}
        <a href={lead.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-primary-hover underline-offset-4 hover:underline dark:text-primary">
          {t("viewSource", { source: SOURCE_NAME[lead.source] })}
          <ExternalLink aria-hidden className="h-3 w-3" />
        </a>
      </div>

      {lead.status === "NEEDS_CONTACT" && <ContactForm leadId={lead.id} />}

      {open.length > 0 && (
        <div className="space-y-2">
          {open.map((m) => (
            <MessageCard key={m.id} message={m} />
          ))}
        </div>
      )}

      {lead.replies.map((reply) => (
        <ReplyCard key={reply.id} reply={reply} />
      ))}

      <div className="flex flex-wrap gap-2">
        {lead.status === "REPLIED" &&
          (lead.inTracker ? (
            <Link href="/admin/outreach" className="inline-flex h-9 items-center gap-1.5 border border-emerald-500/35 bg-emerald-500/10 px-3 text-sm font-medium text-emerald-700 dark:text-emerald-300">
              <Check aria-hidden className="h-4 w-4" />
              {t("inTracker")}
            </Link>
          ) : (
            <Button size="sm" disabled={pending} loading={busy === "customers"} onClick={() => run("customers", () => addLeadToCustomers(lead.id), t("addedToCustomers"))}>
              <UserPlus aria-hidden className="h-4 w-4" />
              {t("addToCustomers")}
            </Button>
          ))}
        {canLog && (
          <Button size="sm" variant="outline" aria-expanded={logging} onClick={() => setLogging((v) => !v)}>
            <PenLine aria-hidden className="h-4 w-4" />
            {t("logReply")}
          </Button>
        )}
        {(lead.status === "NEEDS_CONTACT" || lead.status === "READY") && <ConfirmButton label={t("skip")} confirm={t("confirmSkip")} disabled={pending} onConfirm={() => run("skip", () => skipLead(lead.id), t("skipped"))} />}
      </div>

      <Reveal open={logging}>
        <ReplyForm leadId={lead.id} onDone={() => setLogging(false)} />
      </Reveal>
    </article>
  )
}

function ContactForm({ leadId }: { leadId: string }) {
  const t = useTranslations("admin.outreachAgent")
  const { run, pending } = useAction()
  const schema = z.object({ email: z.string().trim().min(1, t("emailRequired")).email(t("emailInvalid")).max(254, t("emailInvalid")) })
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { email: "" } })
  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(({ email }) =>
          run("contact", () => setLeadContact(leadId, email), t("contactSaved"), (r) => {
            if (!r.ok && r.message === "suppressed") form.setError("email", { message: t("emailSuppressed") })
          })
        )}
        // noValidate: the zod schema validates, with translated messages, not the browser's own bubble.
        noValidate
        className="border border-dashed border-amber-500/40 bg-amber-500/[0.04] p-3"
      >
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs font-medium">{t("contactLabel")}</FormLabel>
              <div className="flex flex-col gap-2 sm:flex-row">
                <FormControl>
                  <Input type="email" inputMode="email" autoComplete="off" placeholder={t("contactPlaceholder")} className="h-10 bg-card" {...field} />
                </FormControl>
                <Button type="submit" className="h-10 shrink-0" disabled={pending}>
                  {t("contactSave")}
                </Button>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />
        <p className="mt-2 text-xs text-muted-foreground">{t("contactHint")}</p>
      </form>
    </Form>
  )
}

function MessageCard({ message }: { message: MessageRow }) {
  const t = useTranslations("admin.outreachAgent")
  const format = useFormatter()
  const { run, pending, busy } = useAction()
  const [editing, setEditing] = useState(false)
  const [expanded, setExpanded] = useState(message.status !== "SENT")
  const [subject, setSubject] = useState(message.subject)
  const [body, setBody] = useState(message.body)
  const draft = message.status === "DRAFT"
  const when = message.sentAt ?? message.createdAt

  return (
    <div className={cn("border", draft ? "border-amber-500/35" : message.status === "FAILED" ? "border-destructive/35" : "border-border")}>
      <button type="button" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded} className="flex w-full flex-wrap items-center gap-2 bg-muted/30 px-3 py-2 text-left">
        <span className="text-xs font-medium">{t(`kind.${message.kind}`)}</span>
        <Chip tone={MESSAGE_TONE[message.status]}>{t(`messageStatus.${message.status}`)}</Chip>
        {message.autoSent && <span className="text-xs text-muted-foreground">{t("autoSent")}</span>}
        <span className="ml-auto text-xs text-muted-foreground">{format.dateTime(new Date(when), { dateStyle: "medium", timeStyle: "short" })}</span>
        <ChevronDown aria-hidden className={cn("h-4 w-4 text-muted-foreground transition-transform", expanded && "rotate-180")} />
      </button>
      <Reveal open={expanded}>
        <div className="space-y-3 p-3">
          {editing ? (
            <div className="space-y-2">
              <Input aria-label={t("subject")} value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={120} className="h-10" />
              <Textarea aria-label={t("body")} value={body} onChange={(e) => setBody(e.target.value)} rows={9} className="text-sm leading-relaxed" />
            </div>
          ) : (
            <div className="text-sm">
              <p className="font-semibold">{message.subject}</p>
              <p className="mt-2 whitespace-pre-line leading-relaxed text-muted-foreground">{message.body}</p>
            </div>
          )}
          {message.status === "FAILED" && message.error && <p className="break-words border-l-2 border-destructive pl-3 text-sm text-destructive">{message.error}</p>}
          {draft && (
            <div className="flex flex-wrap gap-2">
              {editing ? (
                <>
                  <Button size="sm" disabled={pending} loading={busy === "save"} onClick={() => run("save", () => saveDraft(message.id, subject, body), t("draftSaved"), (r) => r.ok && setEditing(false))}>
                    {t("save")}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => (setEditing(false), setSubject(message.subject), setBody(message.body))}>
                    {t("cancel")}
                  </Button>
                </>
              ) : (
                <>
                  <Button size="sm" disabled={pending} loading={busy === "send"} onClick={() => run("send", () => sendDraft(message.id), t("sentToast"))}>
                    <Send aria-hidden className="h-4 w-4" />
                    {t("approveSend")}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                    <PenLine aria-hidden className="h-4 w-4" />
                    {t("edit")}
                  </Button>
                  <ConfirmButton label={t("discard")} confirm={t("confirmDiscard")} disabled={pending} onConfirm={() => run("discard", () => discardDraft(message.id), t("discardedToast"))} />
                </>
              )}
            </div>
          )}
          {message.status === "FAILED" && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={pending} onClick={() => run("retry", () => retryDraft(message.id), t("retryToast"))}>
                {t("retry")}
              </Button>
              <ConfirmButton label={t("discard")} confirm={t("confirmDiscard")} disabled={pending} onConfirm={() => run("discard", () => discardDraft(message.id), t("discardedToast"))} />
            </div>
          )}
        </div>
      </Reveal>
    </div>
  )
}

function ReplyCard({ reply }: { reply: ReplyRow }) {
  const t = useTranslations("admin.outreachAgent")
  const format = useFormatter()
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-l-[3px] border-border border-l-emerald-500 bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium">{t("reply")}</span>
        <Chip tone={REPLY_TONE[reply.category]}>{t(`category.${reply.category}`)}</Chip>
        <span className="ml-auto text-xs text-muted-foreground">{format.dateTime(new Date(reply.receivedAt), { dateStyle: "medium", timeStyle: "short" })}</span>
      </div>
      <p className="mt-2 text-sm">{reply.summary}</p>
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary-hover underline-offset-4 hover:underline dark:text-primary">
        {open ? t("hideReply") : t("showReply")}
        <ChevronDown aria-hidden className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
      </button>
      <Reveal open={open}>
        <p className="mt-2 whitespace-pre-line border-t border-border pt-2 text-sm leading-relaxed text-muted-foreground">{reply.text}</p>
      </Reveal>
    </div>
  )
}

function ReplyForm({ leadId, onDone }: { leadId: string; onDone: () => void }) {
  const t = useTranslations("admin.outreachAgent")
  const { run, pending } = useAction()
  const schema = z.object({ text: z.string().trim().min(1, t("replyRequired")).max(8_000, t("replyTooLong")) })
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { text: "" } })
  return (
    <Form {...form}>
      <form noValidate onSubmit={form.handleSubmit(({ text }) => run("reply", () => logReply(leadId, text), t("replyLogged"), (r) => r.ok && (form.reset(), onDone())))} className="space-y-2 border border-border bg-muted/20 p-3">
        <FormField
          control={form.control}
          name="text"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs font-medium">{t("replyLabel")}</FormLabel>
              <FormControl>
                <Textarea rows={4} placeholder={t("replyPlaceholder")} className="bg-card text-sm" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" size="sm" disabled={pending}>
          {t("replySave")}
        </Button>
      </form>
    </Form>
  )
}

// ── Social ────────────────────────────────────────────────────────────────

export function SocialPanel({ posts, connected, limits }: { posts: PostRow[]; connected: Platform[]; limits: Record<Platform, number> }) {
  const t = useTranslations("admin.outreachAgent")
  const reduceMotion = useReducedMotion()
  const { run, pending, busy } = useAction()
  const all: Platform[] = ["LINKEDIN", "X", "FACEBOOK"]
  const [chosen, setChosen] = useState<Platform[]>(connected.length ? connected : all)
  const [theme, setTheme] = useState("")
  const toggle = (p: Platform) => setChosen((c) => (c.includes(p) ? c.filter((x) => x !== p) : [...c, p]))

  return (
    <div>
      <div className="space-y-3 border-b border-border p-4 sm:px-5">
        <fieldset>
          <legend className="text-xs font-medium text-muted-foreground">{t("socialPlatforms")}</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {all.map((p) => {
              const on = chosen.includes(p)
              return (
                <button key={p} type="button" aria-pressed={on} onClick={() => toggle(p)} className={cn("inline-flex h-9 items-center gap-2 border px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary", on ? "border-primary bg-primary/10 text-primary-hover dark:text-primary" : "border-border bg-card text-muted-foreground hover:text-foreground")}>
                  <span aria-hidden className={cn("flex h-4 w-4 items-center justify-center border", on ? "border-primary bg-primary text-primary-foreground" : "border-input")}>{on && <Check className="h-3 w-3" strokeWidth={3} />}</span>
                  {PLATFORM_NAME[p]}
                  <span className={cn("h-1.5 w-1.5", connected.includes(p) ? "bg-emerald-500" : "bg-muted-foreground/40")} title={connected.includes(p) ? t("connected") : t("notConnected")} />
                </button>
              )
            })}
          </div>
        </fieldset>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input value={theme} onChange={(e) => setTheme(e.target.value)} maxLength={300} placeholder={t("socialTheme")} aria-label={t("socialTheme")} className="h-10" />
          <Button className="h-10 shrink-0" disabled={pending || chosen.length === 0} loading={busy === "draft"} onClick={() => run("draft", () => draftPosts(chosen, theme), t("postsDrafted"), (r) => r.ok && setTheme(""))}>
            <Sparkles aria-hidden className="h-4 w-4" />
            {busy === "draft" ? t("drafting") : t("draftPosts")}
          </Button>
        </div>
        {connected.length === 0 && <p className="text-xs text-muted-foreground">{t("socialNoneConnected")}</p>}
      </div>

      {posts.length === 0 ? (
        <Empty icon={Sparkles}>{t("noPosts")}</Empty>
      ) : (
        <ul className="divide-y divide-border">
          <AnimatePresence initial={false}>
            {posts.map((post) => (
              <motion.li key={post.id} layout={!reduceMotion} initial={reduceMotion ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                <PostCard post={post} limit={limits[post.platform]} connected={connected.includes(post.platform)} />
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </div>
  )
}

/** "YYYY-MM-DDTHH:mm" in local time, for a datetime-local input. */
function localInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function PostCard({ post, limit, connected }: { post: PostRow; limit: number; connected: boolean }) {
  const t = useTranslations("admin.outreachAgent")
  const format = useFormatter()
  const { run, pending, busy } = useAction()
  const [body, setBody] = useState(post.body)
  // Lazy: the default (this time tomorrow) is worked out once, not on every render.
  const [when, setWhen] = useState(() => localInput(post.scheduledFor ? new Date(post.scheduledFor) : new Date(Date.now() + 24 * 3600_000)))
  const length = [...body.trim()].length
  const over = length > limit
  const editable = post.status !== "PUBLISHED"

  return (
    <article className="space-y-3 p-4 sm:px-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{PLATFORM_NAME[post.platform]}</span>
        <Chip tone={POST_TONE[post.status]}>{t(`postStatus.${post.status}`)}</Chip>
        {post.status === "SCHEDULED" && post.scheduledFor && (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <CalendarClock aria-hidden className="h-3.5 w-3.5" />
            {format.dateTime(new Date(post.scheduledFor), { dateStyle: "medium", timeStyle: "short" })}
          </span>
        )}
        {post.status === "PUBLISHED" && post.publishedAt && <span className="text-xs text-muted-foreground">{format.dateTime(new Date(post.publishedAt), { dateStyle: "medium", timeStyle: "short" })}</span>}
      </div>
      {editable ? <Textarea aria-label={t("postBody")} value={body} onChange={(e) => setBody(e.target.value)} rows={post.platform === "X" ? 3 : 6} className="text-sm leading-relaxed" /> : <p className="whitespace-pre-line text-sm leading-relaxed">{post.body}</p>}
      {editable && (
        <div className="flex items-center gap-3">
          <SegmentMeter value={Math.min(1, length / limit)} segments={16} tone={over ? "bad" : length / limit > 0.9 ? "warn" : "info"} label={t("postLength")} className="max-w-48 flex-1" />
          <span className={cn("text-xs tabular-nums", over ? "text-destructive" : "text-muted-foreground")}>{t("characters", { count: length, limit })}</span>
        </div>
      )}
      {post.status === "FAILED" && post.error && <p className="break-words border-l-2 border-destructive pl-3 text-sm text-destructive">{post.error}</p>}
      {editable && (
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <div className="flex flex-wrap gap-2">
            {body !== post.body && (
              <Button size="sm" variant="outline" disabled={pending || over} onClick={() => run("save", () => savePost(post.id, body), t("postSaved"))}>
                {t("save")}
              </Button>
            )}
            <Button size="sm" disabled={pending || over || !connected || body !== post.body} loading={busy === "publish"} title={connected ? undefined : t("notConnected")} onClick={() => run("publish", () => publishPostNow(post.id), t("publishedToast"))}>
              {t("publishNow")}
            </Button>
            <ConfirmButton label={t("discard")} confirm={t("confirmDiscard")} disabled={pending} onConfirm={() => run("discardPost", () => discardPost(post.id), t("discardedToast"))} />
          </div>
          <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
            <Input type="datetime-local" aria-label={t("scheduleFor")} value={when} onChange={(e) => setWhen(e.target.value)} className="h-9 w-auto min-w-0" />
            {post.status === "SCHEDULED" ? (
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => run("unschedule", () => schedulePost(post.id, null), t("unscheduled"))}>
                {t("unschedule")}
              </Button>
            ) : (
              <Button size="sm" variant="outline" disabled={pending || over || !when || body !== post.body} onClick={() => run("schedule", () => schedulePost(post.id, new Date(when).toISOString()), t("scheduled"))}>
                <CalendarClock aria-hidden className="h-4 w-4" />
                {t("schedule")}
              </Button>
            )}
          </div>
        </div>
      )}
    </article>
  )
}
