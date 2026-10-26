/**
 * Salesforce connections and write-back, the side that calls Salesforce and
 * the database (the rules are in salesforce.ts):
 *
 * - completeSalesforceConnection: the callback's step, exchanging the code
 *   (with its PKCE verifier) and keeping the org's tokens sealed.
 * - salesforceRequest: a call to the org's REST API, refreshing the access
 *   token once on a 401 (Salesforce does not say when one lapses).
 * - queueSalesforceWriteBack: called by the signing engine after a document
 *   completes or is declined; makes one job per document and event, for a
 *   document sent from a record by an account with a connection.
 * - runSalesforceJobs: does due jobs, from the engine right away and from the
 *   e-sign cron after that, with backoff (nextAttemptAt).
 * - disconnectSalesforce: the refresh token revoked in the org, then forgotten.
 *
 * Tokens never reach a log or an error message: failures name the step and
 * the HTTP status only.
 */
import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { siteConfig } from "@/config/site"
import { getFile } from "@/lib/esign/storage"
import { openSecret, sealSecret } from "@/lib/webhooks/secret-box"
import { integrationCallbackUrl } from "./hubspot"
import {
  nextAttemptAt,
  readSalesforceTokens,
  SALESFORCE_API_VERSION,
  salesforceConfig,
  salesforceLoginHost,
  signedFileName,
  WRITE_BACK_EVENTS,
  writeBackSteps,
  writeBackTask,
  type WriteBackEvent,
} from "./salesforce"

const TIMEOUT_MS = 20_000
export const SALESFORCE = "salesforce"

async function tokenRequest(sandbox: boolean, body: URLSearchParams): Promise<unknown> {
  const res = await fetch(`${salesforceLoginHost(sandbox)}/services/oauth2/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body, signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!res.ok) throw new Error(`Salesforce token request answered ${res.status}`)
  return res.json()
}

/** Exchanges the callback's code and stores the org connection for `userId`, replacing any earlier one. */
export async function completeSalesforceConnection(input: { userId: string; code: string; verifier: string; sandbox: boolean }): Promise<{ orgId: string; username: string | null }> {
  const config = salesforceConfig()
  if (!config) throw new Error("Salesforce is not configured")
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: integrationCallbackUrl(siteConfig.url, SALESFORCE),
    code_verifier: input.verifier,
  })
  const tokens = readSalesforceTokens(await tokenRequest(input.sandbox, body))
  if (!tokens?.refreshToken) throw new Error("Salesforce answered without a refresh token: the app needs the refresh_token scope")
  // Who connected, for the Developers page; the identity URL is on the same login host.
  let username: string | null = null
  try {
    const who = await fetch(tokens.identityUrl, { headers: { authorization: `Bearer ${tokens.accessToken}` }, signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (who.ok) username = ((await who.json()) as { username?: string }).username ?? null
  } catch {
    // The connection works without it.
  }
  const data = { orgId: tokens.orgId, instanceUrl: tokens.instanceUrl, sandbox: input.sandbox, username, accessToken: sealSecret(tokens.accessToken), refreshToken: sealSecret(tokens.refreshToken) }
  await prisma.salesforceConnection.upsert({ where: { userId: input.userId }, create: { userId: input.userId, ...data }, update: data })
  return { orgId: tokens.orgId, username }
}

type Connection = { userId: string; instanceUrl: string; sandbox: boolean; accessToken: string; refreshToken: string }

async function refresh(conn: Connection): Promise<Connection> {
  const config = salesforceConfig()
  if (!config) throw new Error("Salesforce is not configured")
  const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: openSecret(conn.refreshToken), client_id: config.clientId, client_secret: config.clientSecret })
  const tokens = readSalesforceTokens(await tokenRequest(conn.sandbox, body))
  if (!tokens) throw new Error("Salesforce refresh answered without a token")
  const data = { accessToken: sealSecret(tokens.accessToken), instanceUrl: tokens.instanceUrl, ...(tokens.refreshToken ? { refreshToken: sealSecret(tokens.refreshToken) } : {}) }
  await prisma.salesforceConnection.update({ where: { userId: conn.userId }, data })
  return { ...conn, ...data }
}

/** A call to the org's REST API (`path` under /services/data/<version>), refreshing once on a 401. */
export async function salesforceRequest(userId: string, path: string, init: { method: string; body?: unknown }): Promise<{ status: number; body: unknown }> {
  let conn: Connection | null = await prisma.salesforceConnection.findUnique({ where: { userId }, select: { userId: true, instanceUrl: true, sandbox: true, accessToken: true, refreshToken: true } })
  if (!conn) throw new Error("No Salesforce connection")
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(`${conn.instanceUrl}/services/data/${SALESFORCE_API_VERSION}${path}`, {
      method: init.method,
      headers: { authorization: `Bearer ${openSecret(conn.accessToken)}`, "content-type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (res.status === 401 && attempt === 0) {
      conn = await refresh(conn)
      continue
    }
    return { status: res.status, body: res.status === 204 ? null : await res.json().catch(() => null) }
  }
  throw new Error("unreachable")
}

/**
 * Called by the signing engine after a document event. Makes the job when
 * the event writes back, the document came from a Salesforce record and its
 * owner has a connection; then tries it at once. Never throws.
 */
export async function queueSalesforceWriteBack(input: { documentId: string; event: string }): Promise<void> {
  try {
    if (!(WRITE_BACK_EVENTS as string[]).includes(input.event)) return
    const document = await prisma.document.findUnique({ where: { id: input.documentId }, select: { salesforceRecordId: true, user: { select: { salesforceConnection: { select: { id: true } } } } } })
    if (!document?.salesforceRecordId || !document.user.salesforceConnection) return
    const job = await prisma.integrationJob.upsert({
      where: { documentId_provider_event: { documentId: input.documentId, provider: SALESFORCE, event: input.event } },
      create: { documentId: input.documentId, provider: SALESFORCE, event: input.event },
      update: {},
      select: { id: true, status: true },
    })
    if (job.status === "PENDING") await runSalesforceJob(job.id)
  } catch (error) {
    console.warn("[salesforce] write-back not queued", error instanceof Error ? error.message : "unknown error")
  }
}

type Progress = { contentVersionId?: string; taskId?: string }

/** Does one job's remaining steps. Records each step as it is done, so a retry skips it. */
export async function runSalesforceJob(jobId: string, now = new Date()): Promise<"done" | "retry" | "failed" | "skipped"> {
  const job = await prisma.integrationJob.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      status: true,
      event: true,
      attempts: true,
      progress: true,
      document: { select: { id: true, title: true, userId: true, sealedKey: true, salesforceRecordId: true, completedAt: true, recipients: { where: { signingStatus: "REJECTED" }, select: { name: true, email: true, rejectionReason: true }, take: 1 } } },
    },
  })
  if (!job || job.status !== "PENDING") return "skipped"
  const recordId = job.document.salesforceRecordId
  if (!recordId) {
    await prisma.integrationJob.update({ where: { id: job.id }, data: { status: "DONE", doneAt: now, lastError: "no record" } })
    return "done"
  }
  const progress = { ...(job.progress as Progress) }
  const event = job.event as WriteBackEvent
  try {
    for (const step of writeBackSteps(event)) {
      if (step === "file" && !progress.contentVersionId) {
        if (!job.document.sealedKey) throw new Error("The signed PDF is not ready yet")
        const pdf = Buffer.from(await getFile(job.document.sealedKey)).toString("base64")
        const name = signedFileName(job.document.title)
        const res = await salesforceRequest(job.document.userId, "/sobjects/ContentVersion", { method: "POST", body: { Title: name.replace(/\.pdf$/, ""), PathOnClient: name, VersionData: pdf, FirstPublishLocationId: recordId } })
        const id = (res.body as { id?: string } | null)?.id
        if (res.status !== 201 || !id) throw new Error(`Filing the PDF answered ${res.status}`)
        progress.contentVersionId = id
        await prisma.integrationJob.update({ where: { id: job.id }, data: { progress: progress as Prisma.InputJsonValue } })
      }
      if (step === "task" && !progress.taskId) {
        const declined = job.document.recipients[0]
        const task = writeBackTask({ event, recordId, title: job.document.title, siteName: siteConfig.name, at: job.document.completedAt ?? now, declinedBy: declined ? { name: declined.name, email: declined.email, reason: declined.rejectionReason } : null })
        const res = await salesforceRequest(job.document.userId, "/sobjects/Task", { method: "POST", body: task })
        const id = (res.body as { id?: string } | null)?.id
        if (res.status !== 201 || !id) throw new Error(`Logging the task answered ${res.status}`)
        progress.taskId = id
        await prisma.integrationJob.update({ where: { id: job.id }, data: { progress: progress as Prisma.InputJsonValue } })
      }
    }
    await prisma.integrationJob.update({ where: { id: job.id }, data: { status: "DONE", doneAt: now, attempts: job.attempts + 1, lastError: null } })
    return "done"
  } catch (error) {
    const attempts = job.attempts + 1
    const next = nextAttemptAt(attempts, now)
    const message = error instanceof Error ? error.message.slice(0, 300) : "unknown error"
    await prisma.integrationJob.update({ where: { id: job.id }, data: { attempts, lastError: message, ...(next ? { nextAttemptAt: next } : { status: "FAILED" }) } })
    return next ? "retry" : "failed"
  }
}

/** Due jobs, oldest first: for the e-sign cron. */
export async function runSalesforceJobs(limit = 25, now = new Date()): Promise<number> {
  const due = await prisma.integrationJob.findMany({ where: { provider: SALESFORCE, status: "PENDING", nextAttemptAt: { lte: now } }, orderBy: { nextAttemptAt: "asc" }, take: limit, select: { id: true } })
  for (const job of due) await runSalesforceJob(job.id, now)
  return due.length
}

/** Revokes the refresh token in the org (best effort) and forgets the connection. */
export async function disconnectSalesforce(userId: string): Promise<boolean> {
  const row = await prisma.salesforceConnection.findUnique({ where: { userId }, select: { refreshToken: true, sandbox: true } })
  if (!row) return false
  try {
    await fetch(`${salesforceLoginHost(row.sandbox)}/services/oauth2/revoke`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: openSecret(row.refreshToken) }), signal: AbortSignal.timeout(TIMEOUT_MS) })
  } catch {
    // Forgotten here either way.
  }
  await prisma.salesforceConnection.deleteMany({ where: { userId } })
  return true
}

export async function salesforceStatus(userId: string): Promise<{ orgId: string; username: string | null; sandbox: boolean; connectedAt: Date; failedJobs: number } | null> {
  const row = await prisma.salesforceConnection.findUnique({ where: { userId }, select: { orgId: true, username: true, sandbox: true, createdAt: true } })
  if (!row) return null
  const failedJobs = await prisma.integrationJob.count({ where: { provider: SALESFORCE, status: "FAILED", document: { userId } } })
  return { orgId: row.orgId, username: row.username, sandbox: row.sandbox, connectedAt: row.createdAt, failedJobs }
}

/** Links a document to the Salesforce record it was sent from (the API's `salesforce_record_id`). */
export async function linkDocumentToRecord(userId: string, documentId: string, recordId: string): Promise<void> {
  await prisma.document.updateMany({ where: { id: documentId, userId }, data: { salesforceRecordId: recordId } })
}
