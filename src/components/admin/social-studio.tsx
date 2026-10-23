"use client"

/**
 * The social studio (/admin/outreach/social): the interactive parts of the
 * social-posting agent's page. The page around them is a server component
 * that loads the posts; these call the existing server actions
 * (src/app/actions/outreach-agent.ts), which call src/lib/outreach-agent.
 * Nothing here publishes on its own.
 *
 * - IdeaComposer: one idea in, one draft per chosen platform out (draftPosts).
 * - PlatformSquares: one square per platform for the idea's drafts.
 *   X, LinkedIn and Facebook are edited, scheduled or published now through
 *   their APIs (savePost, schedulePost, publishPostNow), exactly as before.
 *   Reddit is never posted by the app: "Create Reddit post" opens reddit.com's
 *   own submit page in a new tab, pre-filled, for a person to submit.
 *   TikTok and YouTube are never posted either (there is no video yet): their
 *   caption, title and description are edited and copied by hand. All three
 *   are marked posted by hand (markPosted) once they are out.
 * - PostCalendar: a month calendar of scheduled and past posts on wider
 *   screens, a day-by-day agenda on a phone, and the list of every post with
 *   its status, filterable.
 *
 * The pattern (idea in, per-network previews, calendar of what is queued) is
 * a familiar one in social schedulers such as Postiz; none of their code is
 * used. Square corners throughout. Motion (framer-motion): squares and rows
 * enter and leave, the filter tint and the month slide. Everything snaps
 * under prefers-reduced-motion.
 */
import { useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { useFormatter, useTranslations } from "next-intl"
import { toast } from "sonner"
import { CalendarClock, Check, ChevronLeft, ChevronRight, Copy, ExternalLink, Send, Sparkles } from "lucide-react"
import { siX } from "simple-icons"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Chip, Empty, type Tone } from "@/components/admin/admin-ui"
import { SegmentMeter } from "@/components/admin/segment-meter"
import { discardPost, draftPosts, markPosted, publishPostNow, savePost, schedulePost, type OutreachAgentResult } from "@/app/actions/outreach-agent"
import { dayKey, monthGrid, shiftMonth } from "@/lib/admin/calendar"
import { ALL_PLATFORMS, DESCRIPTION_LIMITS, isAutoPlatform, LIMITS, PLATFORM_LABEL, REDDIT_URL_BODY_MAX, redditSubmitUrl, TITLE_LIMITS } from "@/lib/outreach-agent/social"
import { cn } from "@/lib/utils"

// ── Types the page hands over (dates as ISO strings) ─────────────────────

export type Platform = "X" | "LINKEDIN" | "FACEBOOK" | "REDDIT" | "TIKTOK" | "YOUTUBE"
export type PostStatus = "DRAFT" | "SCHEDULED" | "PUBLISHED" | "FAILED"

export type StudioPost = {
  id: string
  platform: Platform
  body: string
  title: string | null
  description: string | null
  idea: string | null
  batchId: string | null
  status: PostStatus
  scheduledFor: string | null
  publishedAt: string | null
  error: string | null
  createdAt: string
}

const PLATFORM_NAME: Record<Platform, string> = PLATFORM_LABEL
const ICON: Partial<Record<Platform, string>> = {
  LINKEDIN: "/brand/web/icon-linkedin.png",
  FACEBOOK: "/brand/web/icon-facebook.png",
  REDDIT: "/brand/web/icon-reddit.png",
  TIKTOK: "/brand/web/icon-tiktok.png",
  YOUTUBE: "/brand/web/icon-youtube.png",
}
const STATUS_TONE: Record<PostStatus, Tone> = { DRAFT: "default", SCHEDULED: "info", PUBLISHED: "good", FAILED: "bad" }

/** The platform's own mark: the footer's brand artwork, X drawn from simple-icons. */
export function PlatformMark({ platform, size = 28 }: { platform: Platform; size?: number }) {
  if (platform === "X") {
    return (
      <span className="flex shrink-0 items-center justify-center rounded-full bg-black ring-1 ring-white/20" style={{ width: size, height: size }}>
        <svg viewBox="0 0 24 24" width={size * 0.47} height={size * 0.47} fill="#ffffff" aria-hidden="true">
          <path d={siX.path} />
        </svg>
      </span>
    )
  }
  // eslint-disable-next-line @next/next/no-img-element -- small static brand artwork, already sized
  return <img src={ICON[platform]} alt="" width={size} height={size} className="shrink-0" style={{ width: size, height: size }} />
}

/** Runs an action, toasts its outcome, refreshes on success. */
function useAction() {
  const t = useTranslations("admin.socialStudio")
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
    <Button size="sm" variant={armed ? "destructive" : "ghost"} disabled={disabled} onBlur={() => setArmed(false)} onClick={() => (armed ? (setArmed(false), onConfirm()) : setArmed(true))}>
      {armed ? confirm : label}
    </Button>
  )
}

/** Copies a field to the clipboard, and says so for a moment. */
function CopyButton({ text, label }: { text: string; label: string }) {
  const t = useTranslations("admin.socialStudio")
  const [copied, setCopied] = useState(false)
  return (
    <Button
      size="sm"
      variant="outline"
      type="button"
      disabled={!text.trim()}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text.trim())
          setCopied(true)
          setTimeout(() => setCopied(false), 1600)
        } catch {
          toast.error(t("copyFailed"))
        }
      }}
    >
      {copied ? <Check aria-hidden className="h-4 w-4" /> : <Copy aria-hidden className="h-4 w-4" />}
      {copied ? t("copied") : label}
    </Button>
  )
}

/** A field's length against its limit: a meter and a count. */
function LengthMeter({ value, limit, label }: { value: string; limit: number; label: string }) {
  const t = useTranslations("admin.socialStudio")
  const length = [...value.trim()].length
  const ratio = length / limit
  return (
    <div className="flex items-center gap-3">
      <SegmentMeter value={Math.min(1, ratio)} segments={14} tone={ratio > 1 ? "bad" : ratio > 0.9 ? "warn" : "info"} label={label} className="max-w-40 flex-1" />
      <span className={cn("text-xs tabular-nums", ratio > 1 ? "text-destructive" : "text-muted-foreground")}>{t("characters", { count: length, limit })}</span>
    </div>
  )
}

const over = (value: string | undefined, limit: number | undefined) => Boolean(limit) && [...(value ?? "").trim()].length > limit!

// ── Idea composer ─────────────────────────────────────────────────────────

export function IdeaComposer({ canDraft, connected }: { canDraft: boolean; connected: Platform[] }) {
  const t = useTranslations("admin.socialStudio")
  const { run, pending, busy } = useAction()
  const [idea, setIdea] = useState("")
  const [chosen, setChosen] = useState<Platform[]>([...ALL_PLATFORMS] as Platform[])
  const toggle = (p: Platform) => setChosen((c) => (c.includes(p) ? c.filter((x) => x !== p) : [...c, p]))

  return (
    <div className="space-y-4 p-4 sm:p-5">
      <div>
        <label htmlFor="studio-idea" className="text-sm font-semibold">{t("ideaLabel")}</label>
        <Textarea
          id="studio-idea"
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
          maxLength={300}
          rows={3}
          placeholder={t("ideaPlaceholder")}
          className="mt-2 text-base leading-relaxed sm:text-sm"
        />
        <p className="mt-1.5 text-xs text-muted-foreground">{t("ideaHint")}</p>
      </div>
      <fieldset>
        <legend className="text-xs font-medium text-muted-foreground">{t("platforms")}</legend>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {(ALL_PLATFORMS as Platform[]).map((p) => {
            const on = chosen.includes(p)
            return (
              <button
                key={p}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(p)}
                className={cn(
                  "flex min-h-11 items-center gap-2 border px-2.5 text-left text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                  on ? "border-primary/60 bg-primary/[0.07] text-foreground" : "border-border bg-card text-muted-foreground hover:text-foreground"
                )}
              >
                <span aria-hidden className={cn("flex h-4 w-4 shrink-0 items-center justify-center border", on ? "border-primary bg-primary text-primary-foreground" : "border-input")}>{on && <Check className="h-3 w-3" strokeWidth={3} />}</span>
                <PlatformMark platform={p} size={20} />
                <span className="min-w-0 truncate">{PLATFORM_NAME[p]}</span>
                {isAutoPlatform(p) && <span className={cn("ml-auto h-1.5 w-1.5 shrink-0", connected.includes(p) ? "bg-emerald-500" : "bg-muted-foreground/40")} title={connected.includes(p) ? t("connected") : t("notConnected")} />}
              </button>
            )
          })}
        </div>
      </fieldset>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button className="h-11 sm:w-auto" disabled={pending || !canDraft || chosen.length === 0} loading={busy === "draft"} onClick={() => run("draft", () => draftPosts(chosen, idea), t("drafted"), (r) => r.ok && setIdea(""))}>
          <Sparkles aria-hidden className="h-4 w-4" />
          {busy === "draft" ? t("drafting") : t("draft", { count: chosen.length })}
        </Button>
        {!canDraft && <p className="text-xs text-muted-foreground">{t("noWriter")}</p>}
      </div>
    </div>
  )
}

// ── The six squares ───────────────────────────────────────────────────────

export function PlatformSquares({ posts, connected }: { posts: StudioPost[]; connected: Platform[] }) {
  const t = useTranslations("admin.socialStudio")
  const reduce = useReducedMotion()
  const byPlatform = new Map(posts.map((p) => [p.platform, p]))
  return (
    <ul className="grid gap-px bg-border lg:grid-cols-2 2xl:grid-cols-3">
      {(ALL_PLATFORMS as Platform[]).map((platform, i) => {
        const post = byPlatform.get(platform)
        return (
          <motion.li
            key={post?.id ?? platform}
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, delay: reduce ? 0 : i * 0.04, ease: "easeOut" }}
            className="flex min-w-0 flex-col bg-card"
          >
            <header className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
              <PlatformMark platform={platform} />
              <h3 className="font-semibold">{PLATFORM_NAME[platform]}</h3>
              <Chip tone={isAutoPlatform(platform) ? (connected.includes(platform) ? "good" : "default") : "accent"}>
                {isAutoPlatform(platform) ? (connected.includes(platform) ? t("laneAuto") : t("laneNotConnected")) : platform === "REDDIT" ? t("laneReddit") : t("laneVideo")}
              </Chip>
              {post && <span className="ml-auto"><Chip tone={STATUS_TONE[post.status]}>{t(`status.${post.status}`)}</Chip></span>}
            </header>
            {!post ? (
              <p className="flex-1 p-4 text-sm text-muted-foreground">{t("notInBatch")}</p>
            ) : isAutoPlatform(platform) ? (
              <AutoSquare post={post} connected={connected.includes(platform)} />
            ) : platform === "REDDIT" ? (
              <RedditSquare post={post} />
            ) : (
              <VideoSquare post={post} />
            )}
          </motion.li>
        )
      })}
    </ul>
  )
}

/** "YYYY-MM-DDTHH:mm" in local time, for a datetime-local input. */
function localInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${dayKey(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function When({ post }: { post: StudioPost }) {
  const t = useTranslations("admin.socialStudio")
  const format = useFormatter()
  const posted = post.status === "PUBLISHED"
  const at = posted ? post.publishedAt : post.status === "SCHEDULED" ? post.scheduledFor : null
  if (!at) return null
  return (
    <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <CalendarClock aria-hidden className="h-3.5 w-3.5" />
      {posted ? t("postedAt", { when: format.dateTime(new Date(at), { dateStyle: "medium", timeStyle: "short" }) }) : t("scheduledAt", { when: format.dateTime(new Date(at), { dateStyle: "medium", timeStyle: "short" }) })}
    </p>
  )
}

/** X, LinkedIn, Facebook: edit, publish now or schedule through the existing actions. */
function AutoSquare({ post, connected }: { post: StudioPost; connected: boolean }) {
  const t = useTranslations("admin.socialStudio")
  const { run, pending, busy } = useAction()
  const [body, setBody] = useState(post.body)
  const [when, setWhen] = useState(() => localInput(post.scheduledFor ? new Date(post.scheduledFor) : new Date(Date.now() + 24 * 3600_000)))
  const limit = LIMITS[post.platform]
  const tooLong = over(body, limit)
  const editable = post.status !== "PUBLISHED"
  const dirty = body !== post.body

  return (
    <div className="flex flex-1 flex-col gap-3 p-4">
      <When post={post} />
      {editable ? (
        <Textarea aria-label={t("postText", { platform: PLATFORM_NAME[post.platform] })} value={body} onChange={(e) => setBody(e.target.value)} rows={post.platform === "X" ? 4 : 8} className="text-sm leading-relaxed" />
      ) : (
        <p className="whitespace-pre-line text-sm leading-relaxed">{post.body}</p>
      )}
      {editable && <LengthMeter value={body} limit={limit} label={t("length")} />}
      {post.status === "FAILED" && post.error && <p className="break-words border-l-2 border-destructive pl-3 text-sm text-destructive">{post.error}</p>}
      {editable && (
        <div className="mt-auto space-y-2 pt-1">
          <div className="flex flex-wrap gap-2">
            {dirty && (
              <Button size="sm" variant="outline" disabled={pending || tooLong} onClick={() => run("save", () => savePost(post.id, body), t("saved"))}>
                {t("save")}
              </Button>
            )}
            <Button size="sm" disabled={pending || tooLong || !connected || dirty} loading={busy === "publish"} title={connected ? undefined : t("notConnected")} onClick={() => run("publish", () => publishPostNow(post.id), t("published"))}>
              <Send aria-hidden className="h-4 w-4" />
              {post.status === "FAILED" ? t("retry") : t("publishNow")}
            </Button>
            <ConfirmButton label={t("discard")} confirm={t("confirmDiscard")} disabled={pending} onConfirm={() => run("discard", () => discardPost(post.id), t("discarded"))} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input type="datetime-local" aria-label={t("scheduleFor")} value={when} onChange={(e) => setWhen(e.target.value)} className="h-9 w-full min-w-0 sm:w-auto" />
            {post.status === "SCHEDULED" ? (
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => run("unschedule", () => schedulePost(post.id, null), t("unscheduled"))}>
                {t("unschedule")}
              </Button>
            ) : (
              <Button size="sm" variant="outline" disabled={pending || tooLong || !when || dirty} onClick={() => run("schedule", () => schedulePost(post.id, new Date(when).toISOString()), t("scheduled"))}>
                <CalendarClock aria-hidden className="h-4 w-4" />
                {t("schedule")}
              </Button>
            )}
          </div>
          {!connected && <p className="text-xs text-muted-foreground">{t("connectHint")}</p>}
        </div>
      )}
    </div>
  )
}

/** Reddit: edit, then open reddit.com's own submit page pre-filled. Never posted by the app. */
function RedditSquare({ post }: { post: StudioPost }) {
  const t = useTranslations("admin.socialStudio")
  const { run, pending } = useAction()
  const [title, setTitle] = useState(post.title ?? "")
  const [body, setBody] = useState(post.body)
  const dirty = title !== (post.title ?? "") || body !== post.body
  const invalid = !title.trim() || !body.trim() || over(title, TITLE_LIMITS.REDDIT) || over(body, LIMITS.REDDIT)
  const posted = post.status === "PUBLISHED"
  const cut = [...body.trim()].length > REDDIT_URL_BODY_MAX

  return (
    <div className="flex flex-1 flex-col gap-3 p-4">
      <When post={post} />
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground" htmlFor={`rt-${post.id}`}>{t("fieldTitle")}</label>
        <Input id={`rt-${post.id}`} value={title} onChange={(e) => setTitle(e.target.value)} readOnly={posted} className="h-10" />
        {!posted && <LengthMeter value={title} limit={TITLE_LIMITS.REDDIT!} label={t("length")} />}
      </div>
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground" htmlFor={`rb-${post.id}`}>{t("body")}</label>
        <Textarea id={`rb-${post.id}`} value={body} onChange={(e) => setBody(e.target.value)} readOnly={posted} rows={8} className="text-sm leading-relaxed" />
      </div>
      {cut && <p className="text-xs text-amber-700 dark:text-amber-400">{t("redditCut", { max: REDDIT_URL_BODY_MAX })}</p>}
      <div className="mt-auto flex flex-wrap gap-2 pt-1">
        {dirty && !posted && (
          <Button size="sm" variant="outline" disabled={pending || invalid} onClick={() => run("save", () => savePost(post.id, body, { title }), t("saved"))}>
            {t("save")}
          </Button>
        )}
        {!posted && (
          <Button size="sm" asChild disabled={invalid}>
            <a href={invalid ? undefined : redditSubmitUrl({ title, body })} target="_blank" rel="noopener noreferrer" aria-disabled={invalid}>
              <ExternalLink aria-hidden className="h-4 w-4" />
              {t("createReddit")}
            </a>
          </Button>
        )}
        <CopyButton text={body} label={t("copyBody")} />
        {!posted && (
          <ConfirmButton label={t("markPosted")} confirm={t("confirmMarkPosted")} disabled={pending || dirty} onConfirm={() => run("posted", () => markPosted(post.id), t("markedPosted"))} />
        )}
      </div>
      {!posted && <p className="text-xs text-muted-foreground">{t("redditHint")}</p>}
    </div>
  )
}

/** TikTok and YouTube: caption, title and description to copy in alongside a video. Never posted by the app. */
function VideoSquare({ post }: { post: StudioPost }) {
  const t = useTranslations("admin.socialStudio")
  const { run, pending } = useAction()
  const [title, setTitle] = useState(post.title ?? "")
  const [body, setBody] = useState(post.body)
  const [description, setDescription] = useState(post.description ?? "")
  const posted = post.status === "PUBLISHED"
  const dirty = title !== (post.title ?? "") || body !== post.body || description !== (post.description ?? "")
  const titleLimit = TITLE_LIMITS[post.platform]!
  const descriptionLimit = DESCRIPTION_LIMITS[post.platform]!
  const invalid = [title, body, description].some((v) => !v.trim()) || over(title, titleLimit) || over(body, LIMITS[post.platform]) || over(description, descriptionLimit)

  const field = (id: string, label: string, value: string, set: (v: string) => void, limit: number, rows?: number) => (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs font-medium text-muted-foreground" htmlFor={`${id}-${post.id}`}>{label}</label>
        <CopyButton text={value} label={t("copy")} />
      </div>
      {rows ? (
        <Textarea id={`${id}-${post.id}`} value={value} onChange={(e) => set(e.target.value)} readOnly={posted} rows={rows} className="text-sm leading-relaxed" />
      ) : (
        <Input id={`${id}-${post.id}`} value={value} onChange={(e) => set(e.target.value)} readOnly={posted} className="h-10" />
      )}
      {!posted && <LengthMeter value={value} limit={limit} label={t("length")} />}
    </div>
  )

  return (
    <div className="flex flex-1 flex-col gap-3 p-4">
      <When post={post} />
      {field("vt", t("fieldTitle"), title, setTitle, titleLimit)}
      {field("vc", t("caption"), body, setBody, LIMITS[post.platform], 3)}
      {field("vd", t("description"), description, setDescription, descriptionLimit, 6)}
      {!posted && (
        <div className="mt-auto flex flex-wrap gap-2 pt-1">
          {dirty && (
            <Button size="sm" variant="outline" disabled={pending || invalid} onClick={() => run("save", () => savePost(post.id, body, { title, description }), t("saved"))}>
              {t("save")}
            </Button>
          )}
          <ConfirmButton label={t("markPosted")} confirm={t("confirmMarkPosted")} disabled={pending || dirty} onConfirm={() => run("posted", () => markPosted(post.id), t("markedPosted"))} />
        </div>
      )}
      {!posted && <p className="text-xs text-muted-foreground">{t("videoHint")}</p>}
    </div>
  )
}

// ── Calendar and list ─────────────────────────────────────────────────────

/** When a post sits on the calendar: its publish time, or its scheduled time. */
const placedAt = (p: StudioPost) => (p.status === "PUBLISHED" ? p.publishedAt : p.scheduledFor)

const FILTERS = ["all", "SCHEDULED", "PUBLISHED", "FAILED", "DRAFT"] as const
type Filter = (typeof FILTERS)[number]

export function PostCalendar({ posts, today }: { posts: StudioPost[]; today: string }) {
  const t = useTranslations("admin.socialStudio")
  const format = useFormatter()
  const reduce = useReducedMotion()
  const now = new Date(today)
  const [view, setView] = useState({ year: now.getFullYear(), month: now.getMonth() })
  const [filter, setFilter] = useState<Filter>("all")
  const days = useMemo(() => monthGrid(view.year, view.month), [view])
  const placed = useMemo(() => {
    const map = new Map<string, StudioPost[]>()
    for (const p of posts) {
      const at = placedAt(p)
      if (!at) continue
      const key = dayKey(new Date(at))
      map.set(key, [...(map.get(key) ?? []), p].sort((a, b) => placedAt(a)!.localeCompare(placedAt(b)!)))
    }
    return map
  }, [posts])
  const monthDays = days.filter((d) => d.inMonth && placed.has(d.key))
  const listed = posts.filter((p) => filter === "all" || p.status === filter)
  const weekdays = days.slice(0, 7).map((d) => format.dateTime(d.date, { weekday: "short" }))
  const todayKey = dayKey(now)

  return (
    <div>
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3 sm:px-5">
        <Button size="sm" variant="ghost" aria-label={t("previousMonth")} onClick={() => setView((v) => shiftMonth(v, -1))}>
          <ChevronLeft aria-hidden className="h-4 w-4" />
        </Button>
        <motion.p key={`${view.year}-${view.month}`} initial={reduce ? false : { opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="text-sm font-semibold" aria-live="polite">
          {format.dateTime(new Date(view.year, view.month, 1), { month: "long", year: "numeric" })}
        </motion.p>
        <Button size="sm" variant="ghost" aria-label={t("nextMonth")} onClick={() => setView((v) => shiftMonth(v, 1))}>
          <ChevronRight aria-hidden className="h-4 w-4" />
        </Button>
      </div>

      {/* The month as a grid from laptop width up; narrower, the agenda below. */}
      <div className="hidden lg:block">
        <div className="grid grid-cols-7 border-b border-border bg-muted/30 text-xs font-medium text-muted-foreground">
          {weekdays.map((w) => (
            <span key={w} className="px-2 py-1.5">{w}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-px bg-border">
          {days.map((d) => {
            const items = placed.get(d.key) ?? []
            return (
              <div key={d.key} className={cn("min-h-24 bg-card p-1.5", !d.inMonth && "bg-muted/30")}>
                <span className={cn("inline-flex h-6 min-w-6 items-center justify-center px-1 text-xs tabular-nums", d.key === todayKey ? "bg-primary font-semibold text-primary-foreground" : d.inMonth ? "text-foreground" : "text-muted-foreground/60")}>{d.date.getDate()}</span>
                <ul className="mt-1 space-y-1">
                  {items.slice(0, 3).map((p) => (
                    <li key={p.id} className={cn("flex items-center gap-1.5 border-l-2 bg-muted/40 px-1.5 py-0.5 text-[11px] leading-tight", p.status === "PUBLISHED" ? "border-l-emerald-500" : p.status === "FAILED" ? "border-l-destructive" : "border-l-primary")}>
                      <PlatformMark platform={p.platform} size={14} />
                      <span className="truncate">{format.dateTime(new Date(placedAt(p)!), { timeStyle: "short" })}</span>
                    </li>
                  ))}
                  {items.length > 3 && <li className="px-1 text-[11px] text-muted-foreground">{t("more", { count: items.length - 3 })}</li>}
                </ul>
              </div>
            )
          })}
        </div>
      </div>

      {/* The same month as an agenda on a phone or tablet. */}
      <div className="lg:hidden">
        {monthDays.length === 0 ? (
          <p className="px-4 py-5 text-sm text-muted-foreground">{t("monthEmpty")}</p>
        ) : (
          <ol className="divide-y divide-border">
            {monthDays.map((d) => (
              <li key={d.key} className="px-4 py-3">
                <p className="text-xs font-semibold text-muted-foreground">{format.dateTime(d.date, { weekday: "long", day: "numeric", month: "long" })}</p>
                <ul className="mt-2 space-y-1.5">
                  {placed.get(d.key)!.map((p) => (
                    <li key={p.id} className="flex items-center gap-2 text-sm">
                      <PlatformMark platform={p.platform} size={18} />
                      <span className="tabular-nums text-muted-foreground">{format.dateTime(new Date(placedAt(p)!), { timeStyle: "short" })}</span>
                      <span className="min-w-0 flex-1 truncate">{p.title || p.body}</span>
                      <Chip tone={STATUS_TONE[p.status]}>{t(`status.${p.status}`)}</Chip>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* Every post, filterable by status. */}
      <div className="border-t border-border">
        <div role="tablist" aria-label={t("filterLabel")} className="flex gap-1 overflow-x-auto px-4 pt-3 sm:px-5">
          {FILTERS.map((f) => (
            <button key={f} type="button" role="tab" aria-selected={filter === f} onClick={() => setFilter(f)} className={cn("relative h-9 shrink-0 px-3 text-sm font-medium", filter === f ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
              {filter === f && <motion.span layoutId="studio-filter" aria-hidden className="absolute inset-0 bg-primary/[0.08]" transition={reduce ? { duration: 0 } : { type: "spring", bounce: 0.12, duration: 0.3 }} />}
              <span className="relative">{f === "all" ? t("filterAll") : t(`status.${f}`)}</span>
            </button>
          ))}
        </div>
        {listed.length === 0 ? (
          <Empty icon={CalendarClock}>{t("listEmpty")}</Empty>
        ) : (
          <ul className="mt-2 divide-y divide-border">
            <AnimatePresence initial={false}>
              {listed.map((p) => (
                <motion.li key={p.id} layout={!reduce} initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex min-w-0 items-start gap-3 px-4 py-3 sm:px-5">
                  <PlatformMark platform={p.platform} size={22} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{PLATFORM_NAME[p.platform]}</span>
                      <Chip tone={STATUS_TONE[p.status]}>{t(`status.${p.status}`)}</Chip>
                      <span className="text-xs text-muted-foreground">
                        {placedAt(p) ? format.dateTime(new Date(placedAt(p)!), { dateStyle: "medium", timeStyle: "short" }) : t("draftedOn", { when: format.dateTime(new Date(p.createdAt), { dateStyle: "medium" }) })}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 break-words text-sm text-muted-foreground">{p.title ? `${p.title}: ${p.body}` : p.body}</p>
                    {p.status === "FAILED" && p.error && <p className="mt-1 break-words text-xs text-destructive">{p.error}</p>}
                  </div>
                  {p.batchId && (
                    <Link href={`/admin/outreach/social?batch=${p.batchId}`} className="shrink-0 text-xs font-medium text-primary underline-offset-4 hover:underline">
                      {t("openBatch")}
                    </Link>
                  )}
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>
    </div>
  )
}
