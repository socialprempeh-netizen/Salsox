/**
 * /admin/outreach/social: the social studio, the social-posting agent's page
 * in the Analytics section (src/lib/outreach-agent). Admin only.
 *
 * Top to bottom: the next scheduled post in one line; four figures (drafts,
 * scheduled, posted in the last 30 days, failed); the idea composer; one
 * square per platform with the idea's drafts (X, LinkedIn and Facebook
 * publish through their APIs; Reddit, TikTok and YouTube are posted by hand);
 * and the calendar with the list of every post.
 *
 * The squares show one batch: the newest, or the one named by ?batch= (the
 * list links to each). Data is read here, on the server, and handed to the
 * client parts (src/components/admin/social-studio.tsx) as plain values.
 * Drafting waits for the writer, hence maxDuration.
 */
import { redirect } from "next/navigation"
import { getFormatter, getTranslations } from "next-intl/server"
import { CalendarClock, CalendarDays, CircleAlert, DatabaseZap, FilePen, Lightbulb, Megaphone, Send } from "lucide-react"
import { getCurrentUser } from "@/lib/auth"
import { connectedPlatforms } from "@/lib/outreach-agent/agent"
import { PLATFORM_LABEL } from "@/lib/outreach-agent/social"
import * as store from "@/lib/outreach-agent/store"
import { hasWriterKey } from "@/lib/outreach-agent/writer"
import { imageGeneration } from "@/lib/outreach-agent/images"
import { AdminPageHeader, Chip, Empty, Panel, StatGrid, StatTile, StatusBanner } from "@/components/admin/admin-ui"
import { IdeaComposer, PlatformSquares, PostCalendar, type Platform, type PostStatus, type StudioPost } from "@/components/admin/social-studio"

export const dynamic = "force-dynamic"
export const maxDuration = 300

// The clock is read here, with the data, not while rendering.
async function load() {
  try {
    return { ok: true as const, posts: await store.studioPosts(), now: new Date() }
  } catch (error) {
    console.error("[admin/social] could not read the social posts:", error instanceof Error ? error.message : error)
    return { ok: false as const }
  }
}

export default async function SocialStudioPage({ searchParams }: { searchParams: Promise<{ batch?: string }> }) {
  const user = await getCurrentUser()
  if (!user || user.role !== "ADMIN") redirect("/dashboard")
  const t = await getTranslations("admin.socialStudio")
  const format = await getFormatter()
  const { batch: wanted } = await searchParams
  const data = await load()
  const connected = connectedPlatforms() as Platform[]

  const posts: StudioPost[] = data.ok
    ? data.posts.map((p) => ({
        id: p.id,
        platform: p.platform,
        body: p.body,
        title: p.title,
        description: p.description,
        idea: p.idea,
        batchId: p.batchId,
        status: p.status as PostStatus,
        scheduledFor: p.scheduledFor?.toISOString() ?? null,
        publishedAt: p.publishedAt?.toISOString() ?? null,
        error: p.error,
        createdAt: p.createdAt.toISOString(),
      }))
    : []

  // The batch the squares show: the one asked for, else the newest. Posts
  // drafted before batches existed show the newest one per platform instead.
  const batchId = posts.some((p) => p.batchId === wanted) ? wanted : posts.find((p) => p.batchId)?.batchId
  const batch = batchId ? posts.filter((p) => p.batchId === batchId) : [...new Map(posts.filter((p) => !p.batchId).map((p) => [p.platform, p] as const)).values()]
  const idea = batch.find((p) => p.idea)?.idea ?? null

  const now = data.ok ? data.now : null
  const since = now ? now.getTime() - 30 * 24 * 3600_000 : 0
  const drafts = posts.filter((p) => p.status === "DRAFT").length
  const scheduled = posts.filter((p) => p.status === "SCHEDULED").sort((a, b) => a.scheduledFor!.localeCompare(b.scheduledFor!))
  const posted = posts.filter((p) => p.status === "PUBLISHED" && p.publishedAt && new Date(p.publishedAt).getTime() > since).length
  const failed = posts.filter((p) => p.status === "FAILED").length
  const next = scheduled[0]

  return (
    <div className="space-y-6">
      <AdminPageHeader title={t("title")} subtitle={t("subtitle")} icon={Megaphone} />

      <StatusBanner tone={failed ? "bad" : next ? "info" : "default"} icon={failed ? CircleAlert : CalendarClock} title={next ? t("nextPost", { platform: PLATFORM_LABEL[next.platform], when: format.dateTime(new Date(next.scheduledFor!), { dateStyle: "medium", timeStyle: "short" }) }) : t("nothingScheduled")}>
        {t("connectedLine", { count: connected.length })}
      </StatusBanner>

      {!data.ok ? (
        <Panel title={t("dbTitle")} hint={t("dbHint")} index={2} icon={DatabaseZap} iconTone="bad" flush>
          <Empty icon={DatabaseZap}>{t("dbBody")}</Empty>
        </Panel>
      ) : (
        <>
          <StatGrid index={2}>
            <StatTile label={t("statDrafts")} value={drafts} hint={t("statDraftsHint")} tone={drafts ? "warn" : "default"} icon={FilePen} />
            <StatTile label={t("statScheduled")} value={scheduled.length} hint={next ? t("statNext", { when: format.dateTime(new Date(next.scheduledFor!), { dateStyle: "medium" }) }) : undefined} tone="accent" icon={CalendarClock} />
            <StatTile label={t("statPosted")} value={posted} hint={t("statPostedHint")} tone="good" icon={Send} />
            <StatTile label={t("statFailed")} value={failed} hint={failed ? t("statFailedHint") : undefined} tone={failed ? "bad" : "default"} icon={CircleAlert} />
          </StatGrid>

          <Panel title={t("ideaTitle")} hint={t("ideaPanelHint")} flush index={3} icon={Lightbulb} iconTone="accent">
            <IdeaComposer canDraft={hasWriterKey()} connected={connected} />
          </Panel>

          <Panel title={idea ? t("squaresTitleIdea", { idea }) : t("squaresTitle")} hint={t("squaresHint")} flush index={4} icon={FilePen} badge={batch.length ? <Chip>{t("draftsCount", { count: batch.length })}</Chip> : undefined}>
            {batch.length === 0 ? <Empty icon={Lightbulb}>{t("noDrafts")}</Empty> : <PlatformSquares key={batchId ?? "unbatched"} posts={batch} connected={connected} imagesAvailable={imageGeneration().available} />}
          </Panel>

          <Panel title={t("calendarTitle")} hint={t("calendarHint")} flush index={5} icon={CalendarDays} badge={<Chip>{t("postsCount", { count: posts.length })}</Chip>}>
            <PostCalendar posts={posts} today={data.now.toISOString()} />
          </Panel>
        </>
      )}
    </div>
  )
}
