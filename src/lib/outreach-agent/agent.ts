/**
 * The outreach agent's jobs, end to end:
 *
 *  - runHunt (Hunter): read competitors' low-rated reviews on G2, Capterra
 *    and Trustpilot through Crawl4AI, and Reddit posts asking for an
 *    alternative through Reddit's API; keep each complaint whose quote is
 *    real and which the product has a fix for, as a lead. Pages a site's
 *    robots.txt disallows are skipped, never fetched.
 *  - runOutreach (Marco, Oscar): write the first email for every lead an
 *    admin has given an address, and the one follow-up three days after a
 *    first email that got no reply; send them by themselves only once the
 *    trust gate allows (policy.ts), never past the daily cap.
 *  - recordReply (Leo): label a reply, stop everything pending for that lead,
 *    and put anyone who asked to stop on the suppression list.
 *  - addToCustomers: one click from a reply to the app's Outreach tracker,
 *    through the adapter. Never creates an account.
 *  - social: draft posts for the product's accounts, schedule them, publish
 *    them through each platform's official API.
 *
 * Everything about the host app comes through an OutreachAdapter, so this
 * file knows nothing about the app around it (src/lib/outreach-agent/site.ts
 * is this app's). Every run is logged with a plain-language outcome; failures
 * are recorded, never thrown to a cron, and no message ever contains a secret.
 */
import type { SocialPlatform } from "@prisma/client"
import { composeEmail, readUnsubscribeToken, sendingDomainProblem, sentViaLine, unsubscribeSecret, unsubscribeToken } from "./compliance"
import { crawlPages, crawlerConfigured } from "./crawl4ai"
import { fixFor, isComplaint, type Fix } from "./fixes"
import { addressOf } from "./inbound"
import { getInboundEmail, outreachFrom, sendOutreachEmail } from "./mailer"
import { checkEmail } from "./message"
import { followUpCutoff, remainingToday, shouldAutoSend } from "./policy"
import { searchReddit, redditConfigured } from "./reddit"
import { isAllowed } from "./robots"
import { rejection, sourceKey } from "./signals"
import { platformConfigured, postProblem, publish, PLATFORMS } from "./social"
import { COMPETITORS, competitorIn, redditQueries, reviewPages, type LeadSource } from "./sources"
import * as store from "./store"
import { classifyReply, extractFromPost, extractFromReviews, hasWriterKey, writeEmail, writeFollowUp, writeSocialPosts, type ExtractedSignal, type ReplyCategory } from "./writer"

export type TrackerEntry = { name: string; company: string | null; email: string | null; source: LeadSource; competitor: string; quote: string; replySummary: string | null }

export type OutreachAdapter = {
  name: string
  url: string
  productSummary: string
  /** The only product facts an email or post may state (fixes.ts). */
  fixes: Fix[]
  /** Who the emails are from: a first name, and a role if wanted. */
  sender: { name: string | undefined; role?: string }
  /** Sent to every site the Hunter reads, e.g. "AcmeOutreachBot/1.0 (+https://acme.com)". */
  userAgent: string
  /** The sender's postal address, required in every email's footer. */
  postalAddress: string | undefined
  /** The product's own transactional sender, which outreach must never share a domain with. */
  mainEmailFrom: string | undefined
  /** The standalone tool named by the optional "sent via" line. */
  tool: { name: string | undefined; url: string | undefined }
  /** The footer lines under every email, in the sender's language. */
  footer(unsubscribeUrl: string): Promise<string[]>
  unsubscribeUrl(token: string): string
  /** Adds a lead to the app's own contact tracker; returns its id there. */
  addToTracker(entry: TrackerEntry): Promise<string>
  revalidate(paths: string[]): void
}

const PAGE = "/admin/outreach/agent"
/** First emails written per run while every email waits for review: a queue, not a flood. */
const REVIEW_QUEUE = 10
/** Reddit posts read per hunt, newest first. */
const MAX_POSTS = 30
/** Model calls made at once while reading pages. */
const CONCURRENCY = 4

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error)).slice(0, 300)

/** Runs `work` over `items`, `limit` at a time, in order of completion. */
async function pool<T, R>(items: T[], limit: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = []
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) results.push(await work(items[next++]))
    })
  )
  return results
}

// ── Settings check ────────────────────────────────────────────────────────

export type MissingSetting = "ANTHROPIC_API_KEY" | "RESEND_API_KEY" | "OUTREACH_EMAIL_FROM" | "OUTREACH_EMAIL_FROM_DOMAIN" | "OUTREACH_POSTAL_ADDRESS" | "OUTREACH_SENDER_NAME" | "CRON_SECRET"

/** What sending needs that is not set, as setting names (never their values). */
export function missingForSending(site: OutreachAdapter, env: Record<string, string | undefined> = process.env): MissingSetting[] {
  const missing: MissingSetting[] = []
  if (!env.ANTHROPIC_API_KEY?.trim()) missing.push("ANTHROPIC_API_KEY")
  if (!env.RESEND_API_KEY?.trim()) missing.push("RESEND_API_KEY")
  const domain = sendingDomainProblem(outreachFrom(env), site.mainEmailFrom)
  if (domain === "missing") missing.push("OUTREACH_EMAIL_FROM")
  if (domain === "sameDomain") missing.push("OUTREACH_EMAIL_FROM_DOMAIN")
  if (!site.postalAddress?.trim()) missing.push("OUTREACH_POSTAL_ADDRESS")
  if (!site.sender.name?.trim()) missing.push("OUTREACH_SENDER_NAME")
  if (!unsubscribeSecret(env)) missing.push("CRON_SECRET")
  return missing
}

/** Which lead sources can run. */
export function huntSources(env: Record<string, string | undefined> = process.env): { reviews: boolean; reddit: boolean } {
  return { reviews: crawlerConfigured(env), reddit: redditConfigured(env) }
}

// ── Hunter ────────────────────────────────────────────────────────────────

type HuntTally = { pages: number; posts: number; added: number; known: number; blocked: string[]; failed: string[]; rejected: Record<"rating" | "quote" | "noFix", number> }

async function robotsFor(origin: string, userAgent: string): Promise<string | null> {
  try {
    const response = await fetch(`${origin}/robots.txt`, { headers: { "user-agent": userAgent }, signal: AbortSignal.timeout(10_000) })
    if (response.status === 404 || response.status === 410) return ""
    if (!response.ok) return null
    return await response.text()
  } catch {
    return null
  }
}

async function keepSignals(site: OutreachAdapter, tally: HuntTally, signals: ExtractedSignal[], ctx: { source: LeadSource; competitor: (typeof COMPETITORS)[number]; url: string; page: string; fallbackId?: string; reviewer?: string }) {
  for (const s of signals) {
    if (!isComplaint(s.complaint)) continue
    const rating = s.rating === null ? null : Math.round(s.rating)
    const reason = rejection({ rating, quote: s.quote, complaint: s.complaint }, { source: ctx.source, page: ctx.page, catalogue: site.fixes })
    if (reason) {
      tally.rejected[reason]++
      continue
    }
    const added = await store.addLead({
      // A Reddit lead is keyed by its post, never by an id the model returned.
      sourceKey: sourceKey(ctx.source, ctx.competitor.id, ctx.source === "reddit" ? (ctx.fallbackId ?? null) : (s.reviewId ?? null), s.quote),
      source: ctx.source,
      competitor: ctx.competitor.name,
      sourceUrl: ctx.url,
      rating,
      quote: s.quote.trim(),
      complaint: s.complaint,
      reviewerName: ctx.reviewer ?? (s.reviewerName?.trim().slice(0, 120) || null),
      reviewerRole: s.reviewerRole?.trim().slice(0, 120) || null,
      company: s.company?.trim().slice(0, 120) || null,
    })
    if (added) tally.added++
    else tally.known++
  }
}

function huntMessage(t: HuntTally): string {
  const read = [t.pages ? `${t.pages} review page${t.pages === 1 ? "" : "s"}` : null, t.posts ? `${t.posts} Reddit post${t.posts === 1 ? "" : "s"}` : null].filter(Boolean).join(" and ") || "nothing"
  const setAside = t.rejected.rating + t.rejected.quote + t.rejected.noFix
  const parts = [`Read ${read}: ${t.added} new lead${t.added === 1 ? "" : "s"}${t.known ? `, ${t.known} already known` : ""}${setAside ? `, ${setAside} set aside (${t.rejected.rating} above 2 stars, ${t.rejected.quote} quote not found on the page, ${t.rejected.noFix} with no matching fix)` : ""}.`]
  if (t.blocked.length) parts.push(`Skipped by robots.txt: ${t.blocked.join(", ")}.`)
  if (t.failed.length) parts.push(`Could not read: ${t.failed.join("; ")}.`)
  return parts.join(" ")
}

export async function runHunt(site: OutreachAdapter, trigger: store.RunTrigger): Promise<{ status: store.RunStatus; message: string }> {
  const runId = await store.startRun("hunt", trigger)
  if (!runId) return { status: "skipped", message: "Another hunt is in progress." }
  const finish = async (status: Exclude<store.RunStatus, "running">, message: string, count = 0) => {
    await store.finishRun(runId, { status, message, count })
    site.revalidate([PAGE])
    return { status, message }
  }
  if (!hasWriterKey()) return finish("skipped", "Not configured: set ANTHROPIC_API_KEY.")
  const sources = huntSources()
  if (!sources.reviews && !sources.reddit) return finish("skipped", "Not configured: set CRAWL4AI_URL for review sites, or REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET for Reddit.")

  const tally: HuntTally = { pages: 0, posts: 0, added: 0, known: 0, blocked: [], failed: [], rejected: { rating: 0, quote: 0, noFix: 0 } }
  try {
    // 1. Review sites, through Crawl4AI, robots.txt first.
    if (sources.reviews) {
      const pages = reviewPages()
      const robots = new Map<string, string | null>()
      const allowed: typeof pages = []
      for (const page of pages) {
        const url = new URL(page.url)
        if (!robots.has(url.origin)) robots.set(url.origin, await robotsFor(url.origin, site.userAgent))
        const txt = robots.get(url.origin)
        // An unreadable robots.txt (an error, not a 404) is treated as a refusal.
        if (txt === null || txt === undefined || !isAllowed(txt, site.userAgent, url.pathname + url.search)) {
          if (!tally.blocked.includes(url.hostname)) tally.blocked.push(url.hostname)
          continue
        }
        allowed.push(page)
      }
      if (allowed.length) {
        const crawled = await crawlPages(allowed.map((p) => p.url), { userAgent: site.userAgent })
        const byUrl = new Map(crawled.map((c) => [c.url, c]))
        await pool(allowed, CONCURRENCY, async (page) => {
          const result = byUrl.get(page.url) ?? crawled.find((c) => c.url.startsWith(page.url.split("?")[0]))
          if (!result?.ok) {
            tally.failed.push(`${page.competitor.name} on ${page.source} (${result?.error ?? "not returned"})`)
            return
          }
          tally.pages++
          try {
            const signals = await extractFromReviews({ competitor: page.competitor.name, source: page.source, url: page.url, markdown: result.markdown })
            await keepSignals(site, tally, signals, { source: page.source, competitor: page.competitor, url: page.url, page: result.markdown })
          } catch (error) {
            tally.failed.push(`${page.competitor.name} on ${page.source} (${errorText(error)})`)
          }
        })
      }
    }

    // 2. Reddit, through its API.
    if (sources.reddit) {
      try {
        const posts = (await searchReddit(redditQueries().map((q) => q.query), { userAgent: site.userAgent })).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, MAX_POSTS)
        const named = posts.flatMap((post) => {
          const competitor = competitorIn(`${post.title}\n${post.text}`)
          return competitor ? [{ post, competitor }] : []
        })
        // A post already stored is not read again.
        const known = await store.knownSourceKeys(named.map(({ post, competitor }) => sourceKey("reddit", competitor.id, post.id, "")))
        await pool(
          named.filter(({ post, competitor }) => !known.has(sourceKey("reddit", competitor.id, post.id, ""))),
          CONCURRENCY,
          async ({ post, competitor }) => {
            tally.posts++
            try {
              const page = `${post.title}\n\n${post.text}`
              const signals = await extractFromPost({ competitor: competitor.name, title: post.title, text: post.text, url: post.url })
              // One lead per post, under the post's own id.
              await keepSignals(site, tally, signals.slice(0, 1), { source: "reddit", competitor, url: post.url, page, fallbackId: post.id, reviewer: `u/${post.author}` })
            } catch (error) {
              tally.failed.push(`a Reddit post (${errorText(error)})`)
            }
          }
        )
        tally.known += known.size
      } catch (error) {
        tally.failed.push(`Reddit (${errorText(error)})`)
      }
    }
  } catch (error) {
    return finish("failed", `The hunt stopped: ${errorText(error)}. ${huntMessage(tally)}`, tally.added)
  }
  const nothingRead = tally.pages + tally.posts === 0
  return finish(nothingRead && tally.failed.length ? "failed" : "ok", huntMessage(tally), tally.added)
}

// ── Marco and Oscar ───────────────────────────────────────────────────────

function briefFor(site: OutreachAdapter, lead: { quote: string; competitor: string; source: string; reviewerName: string | null; reviewerRole: string | null; company: string | null }, fix: Fix) {
  return {
    siteName: site.name,
    siteUrl: site.url,
    sender: { name: site.sender.name ?? site.name, role: site.sender.role },
    lead: { quote: lead.quote, competitor: lead.competitor, source: lead.source as LeadSource, reviewerName: lead.reviewerName, reviewerRole: lead.reviewerRole, company: lead.company },
    fix,
  }
}

/** Writes and checks a first email, with one second attempt told what was wrong. */
async function draftFirstEmail(site: OutreachAdapter, lead: Awaited<ReturnType<typeof store.leadsToWrite>>[number]): Promise<string> {
  const fix = isComplaint(lead.complaint) ? fixFor(lead.complaint, site.fixes) : null
  if (!fix) throw new Error("its complaint no longer has a matching fix")
  const brief = briefFor(site, lead, fix)
  let draft = await writeEmail(brief)
  let problems = checkEmail(draft, { kind: "initial", quote: lead.quote })
  if (problems.length) {
    draft = await writeEmail(brief, problems)
    problems = checkEmail(draft, { kind: "initial", quote: lead.quote })
  }
  if (problems.length) throw new Error(`the email did not pass its checks: ${problems.join(" ")}`)
  return store.createDraft({ leadId: lead.id, kind: "INITIAL", subject: draft.subject.trim(), body: draft.body.trim(), fixId: fix.id, model: draft.model })
}

async function draftFollowUp(site: OutreachAdapter, lead: Awaited<ReturnType<typeof store.followUpCandidates>>[number]): Promise<string> {
  const first = lead.messages[0]
  const fix = site.fixes.find((f) => f.id === first.fixId) ?? (isComplaint(lead.complaint) ? fixFor(lead.complaint, site.fixes) : null)
  if (!fix) throw new Error("its fix is no longer in the catalogue")
  const brief = { ...briefFor(site, lead, fix), firstEmail: first.body, otherFixes: site.fixes.filter((f) => f.id !== fix.id).slice(0, 3) }
  let draft = await writeFollowUp(brief)
  let problems = checkEmail({ subject: "", body: draft.body }, { kind: "followUp", firstBody: first.body })
  if (problems.length) {
    draft = await writeFollowUp(brief, problems)
    problems = checkEmail({ subject: "", body: draft.body }, { kind: "followUp", firstBody: first.body })
  }
  if (problems.length) throw new Error(`the follow-up did not pass its checks: ${problems.join(" ")}`)
  // A follow-up is a reply in the same thread, so "Re:" here is true.
  return store.createDraft({ leadId: lead.id, kind: "FOLLOW_UP", subject: `Re: ${first.subject}`, body: draft.body.trim(), fixId: fix.id, model: draft.model })
}

export type SendResult = { ok: true; message: string } | { ok: false; error: "notFound" | "notDraft" | "suppressed" | "cap" | "notConfigured" | "failed"; message: string }

/** Sends one draft: suppression, cap and configuration checked first, the claim makes a double send impossible. */
export async function sendMessage(site: OutreachAdapter, messageId: string, { auto }: { auto: boolean }): Promise<SendResult> {
  const message = await store.getMessage(messageId)
  if (!message) return { ok: false, error: "notFound", message: "That email no longer exists." }
  if (message.status !== "DRAFT") return { ok: false, error: "notDraft", message: "That email is not a draft any more." }
  const { lead } = message
  if (!lead.email) return { ok: false, error: "notFound", message: "The lead has no address." }
  if (lead.status === "UNSUBSCRIBED" || (await store.isSuppressed(lead.email))) {
    await store.discardMessage(messageId)
    return { ok: false, error: "suppressed", message: `${lead.email} asked not to be contacted; the draft was discarded.` }
  }
  if (message.kind === "FOLLOW_UP" && lead.status === "REPLIED") {
    await store.discardMessage(messageId)
    return { ok: false, error: "notDraft", message: "They already replied; the follow-up was discarded." }
  }
  const missing = missingForSending(site)
  if (missing.length) return { ok: false, error: "notConfigured", message: `Not configured: set ${missing.join(", ")}.` }
  const settings = await store.getSettings()
  if (remainingToday(settings.dailyCap, await store.sentToday()) === 0) return { ok: false, error: "cap", message: `Today's limit of ${settings.dailyCap} emails is reached; it resets at midnight UTC.` }

  if (!(await store.claimDraft(messageId))) return { ok: false, error: "notDraft", message: "That email was already sent." }
  try {
    const unsubscribeUrl = site.unsubscribeUrl(unsubscribeToken(lead.email, unsubscribeSecret()!))
    const text = composeEmail({ body: message.body, sentVia: sentViaLine({ enabled: settings.signature, tool: site.tool.name, url: site.tool.url }), footer: await site.footer(unsubscribeUrl) })
    const { id } = await sendOutreachEmail({ to: lead.email, subject: message.subject, text, unsubscribeUrl })
    await store.markSent(messageId, { providerId: id, auto, leadId: lead.id, kind: message.kind })
    site.revalidate([PAGE])
    return { ok: true, message: `Sent to ${lead.email}.` }
  } catch (error) {
    await store.markFailed(messageId, errorText(error))
    site.revalidate([PAGE])
    return { ok: false, error: "failed", message: `Sending failed: ${errorText(error)}` }
  }
}

export async function runOutreach(site: OutreachAdapter, trigger: store.RunTrigger): Promise<{ status: store.RunStatus; message: string }> {
  const runId = await store.startRun("outreach", trigger)
  if (!runId) return { status: "skipped", message: "Another outreach run is in progress." }
  const finish = async (status: Exclude<store.RunStatus, "running">, message: string, count = 0) => {
    await store.finishRun(runId, { status, message, count })
    site.revalidate([PAGE])
    return { status, message }
  }
  const settings = await store.getSettings()
  if (settings.paused) return finish("skipped", "Sending is paused.")
  const missing = missingForSending(site)
  if (missing.length) return finish("skipped", `Not configured: set ${missing.join(", ")}.`)

  let sentBefore = await store.countSent()
  let remaining = remainingToday(settings.dailyCap, await store.sentToday())
  const auto = () => shouldAutoSend({ sentBefore, reviewEvery: settings.reviewEvery, paused: settings.paused })
  // While emails wait for review, write a short queue; once they send themselves, only what today allows.
  let budget = auto() ? remaining : REVIEW_QUEUE
  const tally = { followUps: 0, firsts: 0, sent: 0, waiting: 0, failed: [] as string[] }

  const after = async (draftId: string) => {
    if (auto() && remaining > 0) {
      const result = await sendMessage(site, draftId, { auto: true })
      if (result.ok) {
        tally.sent++
        sentBefore++
        remaining--
        return
      }
      if (result.error === "failed") tally.failed.push(result.message)
    }
    tally.waiting++
  }

  // 1. Follow-ups first: they are owed to people already written to.
  for (const lead of await store.followUpCandidates(followUpCutoff(new Date()), budget)) {
    if (budget <= 0) break
    try {
      if (lead.email && (await store.isSuppressed(lead.email))) continue
      await after(await draftFollowUp(site, lead))
      tally.followUps++
      budget--
    } catch (error) {
      tally.failed.push(`follow-up for a ${lead.competitor} lead: ${errorText(error)}`)
    }
  }

  // 2. First emails to leads that have an address and nothing written yet.
  for (const lead of budget > 0 ? await store.leadsToWrite(budget) : []) {
    try {
      if (lead.email && (await store.isSuppressed(lead.email))) {
        await store.setLeadStatus(lead.id, "UNSUBSCRIBED")
        continue
      }
      await after(await draftFirstEmail(site, lead))
      tally.firsts++
    } catch (error) {
      tally.failed.push(`first email for a ${lead.competitor} lead: ${errorText(error)}`)
    }
  }

  const written = tally.firsts + tally.followUps
  const message = written
    ? `Wrote ${tally.firsts} first email${tally.firsts === 1 ? "" : "s"} and ${tally.followUps} follow-up${tally.followUps === 1 ? "" : "s"}: ${tally.sent} sent automatically, ${tally.waiting} waiting for review. ${remaining} left today.${tally.failed.length ? ` Problems: ${tally.failed.join("; ")}.` : ""}`
    : tally.failed.length
      ? `Nothing was written: ${tally.failed.join("; ")}.`
      : "Nothing to write: no lead with an address is waiting, and no follow-up is due."
  return finish(written === 0 && tally.failed.length ? "failed" : "ok", message, tally.sent)
}

// ── Leo ───────────────────────────────────────────────────────────────────

/** Labels and stores a reply, stops what is pending for the lead, honours a request to stop. */
export async function recordReply(site: OutreachAdapter, lead: { id: string; email: string | null }, reply: { fromEmail: string; subject: string; text: string; providerId: string | null; source: "inbound" | "manual" }): Promise<{ recorded: boolean; category: ReplyCategory }> {
  let label: { category: ReplyCategory; summary: string }
  try {
    label = await classifyReply({ subject: reply.subject, text: reply.text })
  } catch (error) {
    // Unlabelled is better than lost: stored as OTHER for an admin to read.
    label = { category: "OTHER", summary: `Not labelled automatically (${errorText(error)}).` }
  }
  const recorded = await store.addReply({ leadId: lead.id, ...reply, category: label.category, summary: label.summary })
  if (!recorded) return { recorded, category: label.category }
  await store.discardOpenMessages(lead.id)
  const address = lead.email ?? addressOf(reply.fromEmail)
  if (address && label.category === "UNSUBSCRIBE") await store.suppress(address, "asked in a reply", { markLead: true })
  if (address && label.category === "NOT_INTERESTED") await store.suppress(address, "not interested", { markLead: false })
  site.revalidate([PAGE])
  return { recorded, category: label.category }
}

/** A reply that arrived at the outreach address (from the inbound webhook). */
export async function handleInbound(site: OutreachAdapter, emailId: string): Promise<{ status: store.RunStatus; message: string }> {
  const runId = await store.startRun("inbound", "webhook")
  const finish = async (status: Exclude<store.RunStatus, "running">, message: string) => {
    if (runId) await store.finishRun(runId, { status, message, count: status === "ok" ? 1 : 0 })
    return { status, message }
  }
  try {
    const email = await getInboundEmail(emailId)
    const from = addressOf(email.from)
    const lead = from ? await store.leadByEmail(from) : null
    // A message from someone who is not a lead is not stored: it is not ours to keep.
    if (!lead || !from) return finish("skipped", "A message arrived from an address that is not a lead; it was not stored.")
    const { recorded, category } = await recordReply(site, lead, { fromEmail: from, subject: email.subject, text: email.text, providerId: email.id, source: "inbound" })
    return finish("ok", recorded ? `Reply from a ${lead.competitor} lead, labelled ${category.toLowerCase().replace("_", " ")}.` : "A reply was delivered twice; the copy was ignored.")
  } catch (error) {
    return finish("failed", `A reply could not be read: ${errorText(error)}`)
  }
}

export async function logReplyByHand(site: OutreachAdapter, leadId: string, text: string): Promise<{ ok: boolean; category?: ReplyCategory }> {
  const lead = await store.getLead(leadId)
  if (!lead) return { ok: false }
  const { category } = await recordReply(site, lead, { fromEmail: lead.email ?? "unknown@reply.invalid", subject: lead.messages.at(-1)?.subject ?? "Reply", text: text.trim().slice(0, 8_000), providerId: null, source: "manual" })
  return { ok: true, category }
}

/** "Add to Customers": the lead into the app's Outreach tracker, once. Never an account. */
export async function addToCustomers(site: OutreachAdapter, leadId: string): Promise<{ ok: boolean; already?: boolean }> {
  const lead = await store.getLead(leadId)
  if (!lead) return { ok: false }
  if (lead.trackerContactId) return { ok: true, already: true }
  const id = await site.addToTracker({
    name: lead.reviewerName ?? lead.email ?? `${lead.competitor} reviewer`,
    company: lead.company,
    email: lead.email,
    source: lead.source as LeadSource,
    competitor: lead.competitor,
    quote: lead.quote,
    replySummary: lead.replies[0]?.summary ?? null,
  })
  await store.setTrackerContact(lead.id, id)
  site.revalidate([PAGE])
  return { ok: true }
}

/** The unsubscribe link: true when the token was genuine and the address is now suppressed. */
export async function unsubscribe(token: string): Promise<boolean> {
  const secret = unsubscribeSecret()
  const email = secret ? readUnsubscribeToken(token, secret) : null
  if (!email) return false
  await store.suppress(email, "unsubscribe link", { markLead: true })
  return true
}

// ── Social ────────────────────────────────────────────────────────────────

export function connectedPlatforms(env: Record<string, string | undefined> = process.env): SocialPlatform[] {
  return PLATFORMS.filter((p) => platformConfigured(p, env))
}

export async function draftSocialPosts(site: OutreachAdapter, { platforms, theme }: { platforms: SocialPlatform[]; theme?: string }): Promise<{ ok: boolean; message: string }> {
  if (!hasWriterKey()) return { ok: false, message: "Not configured: set ANTHROPIC_API_KEY." }
  if (platforms.length === 0) return { ok: false, message: "Choose at least one platform." }
  try {
    const { posts, model } = await writeSocialPosts({ siteName: site.name, productSummary: site.productSummary, fixes: site.fixes, platforms, theme })
    const usable = posts.filter((p) => postProblem(p.platform, p.body) === null).map((p) => ({ platform: p.platform, body: p.body.trim(), model }))
    const count = await store.createPosts(usable)
    site.revalidate([PAGE])
    return { ok: count > 0, message: count ? `Drafted ${count} post${count === 1 ? "" : "s"}.` : "No post came back within the platforms' length limits; try again." }
  } catch (error) {
    return { ok: false, message: `Drafting failed: ${errorText(error)}` }
  }
}

export async function publishPost(site: OutreachAdapter, postId: string): Promise<{ ok: boolean; message: string }> {
  const post = await store.getPost(postId)
  if (!post) return { ok: false, message: "That post no longer exists." }
  if (!platformConfigured(post.platform)) return { ok: false, message: `${post.platform} is not connected.` }
  const problem = postProblem(post.platform, post.body)
  if (problem) return { ok: false, message: problem === "empty" ? "The post is empty." : "The post is too long for this platform." }
  if (!(await store.claimPost(postId))) return { ok: false, message: "That post was already published." }
  try {
    const { externalId } = await publish(post.platform, post.body)
    await store.postPublished(postId, externalId)
    site.revalidate([PAGE])
    return { ok: true, message: `Published to ${post.platform}.` }
  } catch (error) {
    await store.postFailed(postId, errorText(error))
    site.revalidate([PAGE])
    return { ok: false, message: `Publishing failed: ${errorText(error)}` }
  }
}

/** Publishes every scheduled post whose time has come. */
export async function runSocialDue(site: OutreachAdapter, trigger: store.RunTrigger): Promise<{ status: store.RunStatus; message: string }> {
  const due = await store.duePosts(new Date())
  if (due.length === 0) return { status: "skipped", message: "No post is due." }
  const runId = await store.startRun("social", trigger)
  if (!runId) return { status: "skipped", message: "Another social run is in progress." }
  const results = []
  for (const post of due) results.push(await publishPost(site, post.id))
  const ok = results.filter((r) => r.ok).length
  const failed = results.filter((r) => !r.ok).map((r) => r.message)
  const message = `Published ${ok} of ${due.length} scheduled post${due.length === 1 ? "" : "s"}.${failed.length ? ` ${failed.join(" ")}` : ""}`
  await store.finishRun(runId, { status: ok === 0 ? "failed" : "ok", message, count: ok })
  return { status: ok === 0 ? "failed" : "ok", message }
}
