/**
 * /admin/outreach/agent: the Outreach agent's tab in the Analytics section
 * (src/lib/outreach-agent), beside the Outreach tracker it feeds. Admin only;
 * nothing here is public.
 *
 * Top to bottom: the agent's state in one line (its last run and where it
 * sends from), four figures (leads, emails sent today against the limit,
 * replies, emails waiting for review), what is left to set up, the sending
 * settings with the trust gate, the lead pipeline (address needed, drafts to
 * approve, replies to act on), a summary of social posts with a link to the
 * social studio (/admin/outreach/social) where they are made, and the run log.
 *
 * Data is read here, on the server, and handed to the client parts
 * (src/components/admin/outreach-agent-console.tsx) as plain values. A hunt
 * started from here crawls and reads a dozen pages, hence maxDuration.
 */
import Link from "next/link"
import { redirect } from "next/navigation"
import { getFormatter, getTranslations } from "next-intl/server"
import { Crosshair, DatabaseZap, Inbox, Megaphone, MessageSquareReply, ScrollText, Send, Settings2, ShieldCheck, Sparkles, Users } from "lucide-react"
import { getCurrentUser } from "@/lib/auth"
import { connectedPlatforms, huntSources, missingForSending } from "@/lib/outreach-agent/agent"
import { domainOf } from "@/lib/outreach-agent/compliance"
import { fixFor, isComplaint } from "@/lib/outreach-agent/fixes"
import { outreachFrom } from "@/lib/outreach-agent/mailer"
import { MAX_DAILY_CAP, REVIEW_FIRST, remainingToday } from "@/lib/outreach-agent/policy"
import { salsoxOutreach, SALSOX_FIXES } from "@/lib/outreach-agent/site"
// Was LIMITS, for the social panel that moved to the social studio.
// import { LIMITS } from "@/lib/outreach-agent/social"
import * as store from "@/lib/outreach-agent/store"
import { AdminPageHeader, Chip, Empty, Panel, StatGrid, StatTile, StatusBanner, Timeline, type Tone } from "@/components/admin/admin-ui"
// SocialPanel and PostRow were the social section, now the social studio.
// import { AgentRunButtons, LeadBoard, SendingSettings, SocialPanel, type LeadRow, type PostRow } from "@/components/admin/outreach-agent-console"
import { AgentRunButtons, LeadBoard, SendingSettings, type LeadRow } from "@/components/admin/outreach-agent-console"

export const dynamic = "force-dynamic"
export const maxDuration = 300

const RUN_TONE: Record<string, Tone> = { ok: "good", skipped: "default", failed: "bad", running: "info" }

async function load() {
  try {
    const [settings, runs, leads, counts, replies, sent, today, posts] = await Promise.all([store.getSettings(), store.recentRuns(), store.listLeads(), store.leadCounts(), store.replyCounts(), store.countSent(), store.sentToday(), store.listPosts()])
    return { ok: true as const, settings, runs, leads, counts, replies, sent, today, posts }
  } catch (error) {
    console.error("[admin/outreach-agent] could not read the agent's tables:", error instanceof Error ? error.message : error)
    return { ok: false as const }
  }
}

export default async function OutreachAgentPage() {
  const user = await getCurrentUser()
  if (!user || user.role !== "ADMIN") redirect("/dashboard")
  const t = await getTranslations("admin.outreachAgent")
  const format = await getFormatter()
  const when = (d: Date) => format.dateTime(d, { dateStyle: "medium", timeStyle: "short" })
  const data = await load()
  const missing = missingForSending(salsoxOutreach)
  const sources = huntSources()
  const connected = connectedPlatforms()
  const fromDomain = domainOf(outreachFrom())
  const last = data.ok ? data.runs[0] : undefined
  const runStatus = (status: string) => t(`runStatus.${status as "ok" | "skipped" | "failed" | "running"}`)
  const runKind = (kind: string) => t(`runKind.${kind as "hunt" | "outreach" | "social" | "inbound"}`)

  const leads: LeadRow[] = data.ok
    ? data.leads.map((l) => ({
        id: l.id,
        source: l.source as LeadRow["source"],
        competitor: l.competitor,
        sourceUrl: l.sourceUrl,
        rating: l.rating,
        quote: l.quote,
        fixLabel: isComplaint(l.complaint) ? (fixFor(l.complaint, SALSOX_FIXES)?.label ?? null) : null,
        reviewerName: l.reviewerName,
        reviewerRole: l.reviewerRole,
        company: l.company,
        email: l.email,
        status: l.status,
        inTracker: Boolean(l.trackerContactId),
        createdAt: l.createdAt.toISOString(),
        messages: l.messages.map((m) => ({ id: m.id, kind: m.kind, status: m.status, subject: m.subject, body: m.body, error: m.error, sentAt: m.sentAt?.toISOString() ?? null, autoSent: m.autoSent, createdAt: m.createdAt.toISOString() })),
        replies: l.replies.map((r) => ({ id: r.id, category: r.category, summary: r.summary, text: r.text, receivedAt: r.receivedAt.toISOString(), source: r.source })),
      }))
    : []
  // Was the rows for SocialPanel; the studio loads its own.
  // const posts: PostRow[] = data.ok ? data.posts.map((p) => ({ id: p.id, platform: p.platform, body: p.body, status: p.status as PostRow["status"], scheduledFor: p.scheduledFor?.toISOString() ?? null, publishedAt: p.publishedAt?.toISOString() ?? null, error: p.error })) : []
  const postDrafts = data.ok ? data.posts.filter((p) => p.status === "DRAFT").length : 0
  const postsScheduled = data.ok ? data.posts.filter((p) => p.status === "SCHEDULED").length : 0
  const waiting = leads.filter((l) => l.messages.some((m) => m.status === "DRAFT")).length
  const totalLeads = data.ok ? Object.values(data.counts).reduce((a, b) => a + b, 0) : 0
  const contacted = data.ok ? data.counts.CONTACTED + data.counts.REPLIED + data.counts.UNSUBSCRIBED : 0

  return (
    <div className="space-y-6">
      <AdminPageHeader title={t("title")} subtitle={t("subtitle")} icon={Megaphone}>
        {data.ok && <AgentRunButtons canHunt={sources.reviews || sources.reddit} canSend={missing.length === 0} />}
      </AdminPageHeader>

      <StatusBanner tone={last ? (RUN_TONE[last.status] ?? "info") : "info"} icon={last ? undefined : Megaphone} title={last ? t("statusLast", { kind: runKind(last.kind), status: runStatus(last.status), time: when(last.startedAt) }) : t("statusNever")}>
        {fromDomain && !missing.includes("OUTREACH_EMAIL_FROM_DOMAIN") ? t("sendingFrom", { domain: fromDomain }) : t("sendingNotSet")}
      </StatusBanner>

      {data.ok && (
        <StatGrid index={2}>
          <StatTile label={t("statLeads")} value={totalLeads} hint={t("statLeadsHint", { count: data.counts.NEEDS_CONTACT })} tone="accent" icon={Crosshair} />
          <StatTile label={t("statSent")} value={data.sent} hint={t("statSentHint", { today: data.today, cap: data.settings.dailyCap })} icon={Send} meter={data.today / data.settings.dailyCap} tone={remainingToday(data.settings.dailyCap, data.today) === 0 ? "warn" : "default"} />
          <StatTile label={t("statReplies")} value={data.replies.total} hint={t("statRepliesHint", { count: data.replies.interested })} tone="good" icon={MessageSquareReply} meter={contacted ? data.replies.total / contacted : null} />
          <StatTile label={t("statWaiting")} value={waiting} hint={data.settings.paused ? t("statPaused") : t("statWaitingHint")} tone={waiting > 0 ? "warn" : "default"} icon={Inbox} />
        </StatGrid>
      )}

      {(missing.length > 0 || (!sources.reviews && !sources.reddit)) && (
        <Panel title={t("setupTitle")} hint={t("setupHint")} index={3} icon={Settings2} iconTone="warn">
          <ul className="space-y-2.5 text-sm">
            {missing.map((key) => (
              <li key={key} className="flex gap-2.5">
                <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 bg-amber-500" />
                <span className="min-w-0 break-words">{t(`setup.${key}`)}</span>
              </li>
            ))}
            {!sources.reviews && (
              <li className="flex gap-2.5">
                <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 bg-amber-500" />
                <span className="min-w-0 break-words">{t("setup.CRAWL4AI_URL")}</span>
              </li>
            )}
            {!sources.reddit && (
              <li className="flex gap-2.5">
                <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 bg-muted-foreground/50" />
                <span className="min-w-0 break-words">{t("setup.REDDIT")}</span>
              </li>
            )}
          </ul>
        </Panel>
      )}

      {!data.ok ? (
        <Panel title={t("dbTitle")} hint={t("dbHint")} index={3} icon={DatabaseZap} iconTone="bad" flush>
          <Empty icon={DatabaseZap}>{t("dbBody")}</Empty>
        </Panel>
      ) : (
        <>
          <Panel title={t("sendingTitle")} hint={t("sendingHint", { count: REVIEW_FIRST })} index={4} icon={ShieldCheck}>
            <SendingSettings
              reviewEvery={data.settings.reviewEvery}
              paused={data.settings.paused}
              dailyCap={data.settings.dailyCap}
              maxCap={MAX_DAILY_CAP}
              signature={data.settings.signature}
              sent={Math.min(data.sent, REVIEW_FIRST)}
              reviewFirst={REVIEW_FIRST}
              sentToday={data.today}
              toolName={salsoxOutreach.tool.name ?? null}
            />
          </Panel>

          <Panel title={t("leadsTitle")} hint={t("leadsHint")} flush index={5} icon={Users} iconTone="accent" badge={<Chip>{t("leadsCount", { count: totalLeads })}</Chip>}>
            <LeadBoard leads={leads} />
          </Panel>

          <div className="grid gap-6 lg:grid-cols-5">
            <Panel title={t("socialTitle")} hint={t("socialHint")} flush index={6} icon={Sparkles} className="lg:col-span-3" badge={<Chip tone={connected.length ? "good" : "default"}>{t("connectedCount", { count: connected.length })}</Chip>}>
              {/* Was <SocialPanel posts={posts} connected={connected} limits={LIMITS} />:
                  drafting, editing and scheduling moved to the social studio. */}
              <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <p className="text-sm text-muted-foreground">{t("socialStudioSummary", { drafts: postDrafts, scheduled: postsScheduled })}</p>
                <Link href="/admin/outreach/social" className="inline-flex h-10 shrink-0 items-center justify-center gap-2 bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90">
                  <Sparkles aria-hidden className="h-4 w-4" />
                  {t("openStudio")}
                </Link>
              </div>
            </Panel>

            <Panel title={t("runsTitle")} hint={t("runsHint")} flush index={7} icon={ScrollText} className="lg:col-span-2" badge={data.runs.length > 0 ? <Chip>{t("runsCount", { count: data.runs.length })}</Chip> : undefined}>
              {data.runs.length === 0 ? (
                <Empty icon={ScrollText}>{t("noRuns")}</Empty>
              ) : (
                <div className="max-h-[40rem] overflow-y-auto">
                  <Timeline
                    items={data.runs.map((r) => ({
                      key: r.id,
                      tone: RUN_TONE[r.status] ?? "default",
                      content: (
                        <>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="text-sm font-medium">{runKind(r.kind)}</span>
                            <Chip tone={RUN_TONE[r.status] ?? "default"}>{runStatus(r.status)}</Chip>
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {when(r.startedAt)}, {t(`trigger.${r.trigger as "cron" | "manual" | "webhook"}`).toLowerCase()}
                          </p>
                          {r.message && <p className="mt-1.5 break-words text-sm text-muted-foreground">{r.message}</p>}
                        </>
                      ),
                    }))}
                  />
                </div>
              )}
            </Panel>
          </div>
        </>
      )}

      <p className="text-xs text-muted-foreground">{t("footnote")}</p>
    </div>
  )
}
