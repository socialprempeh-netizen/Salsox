/**
 * Salesforce, with Salsox as an OAuth 2.0 client of an org (the web server
 * flow, with PKCE), and the write-back it does there, as pure rules. The
 * calls and the job queue are in salesforce-store.ts. Tested in
 * salesforce.test.ts.
 *
 * This is direction 2 in marketing/marketplace-listings/salesforce-appexchange.md:
 * Salsox writing into the org as things happen. Direction 1, the package
 * calling Salsox, is the OAuth server in src/lib/oauth-server.
 *
 * Configured by SALESFORCE_CLIENT_ID and SALESFORCE_CLIENT_SECRET, the
 * consumer key and secret of an External Client App (or connected app) with
 * the "api" and "refresh_token" scopes, PKCE required, and the callback
 * `<site>/api/integrations/salesforce/callback`. Production orgs sign in on
 * login.salesforce.com, sandboxes on test.salesforce.com; the connection
 * keeps the org's own instance address and calls only that.
 *
 * Write-back, for a document sent from a record (Document.salesforceRecordId,
 * set by the API's `salesforce_record_id`):
 *   document.completed  the signed PDF filed on the record (a ContentVersion
 *                       published to it), and a completed Task logged
 *   document.declined   a completed Task saying who declined, and why
 */

export const SALESFORCE_API_VERSION = "v62.0"
export const SALESFORCE_SCOPES = "api refresh_token"

export type SalesforceConfig = { clientId: string; clientSecret: string }

export function salesforceConfig(env: Record<string, string | undefined> = process.env): SalesforceConfig | null {
  const clientId = env.SALESFORCE_CLIENT_ID?.trim()
  const clientSecret = env.SALESFORCE_CLIENT_SECRET?.trim()
  return clientId && clientSecret ? { clientId, clientSecret } : null
}

/** Where a production org or a sandbox signs in, and refreshes and revokes tokens. */
export function salesforceLoginHost(sandbox: boolean): string {
  return sandbox ? "https://test.salesforce.com" : "https://login.salesforce.com"
}

export function salesforceAuthorizeUrl(input: { config: SalesforceConfig; sandbox: boolean; redirectUri: string; state: string; codeChallenge: string }): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: input.config.clientId,
    redirect_uri: input.redirectUri,
    scope: SALESFORCE_SCOPES,
    state: input.state,
    code_challenge: input.codeChallenge,
    code_challenge_method: "S256",
  })
  return `${salesforceLoginHost(input.sandbox)}/services/oauth2/authorize?${params}`
}

/**
 * Whether an address is a Salesforce org's own host. The instance address
 * comes from Salesforce's token answer, and every API call and every token
 * goes to it, so anything else is refused rather than trusted.
 */
export function isSalesforceInstance(raw: unknown): raw is string {
  if (typeof raw !== "string") return false
  try {
    const url = new URL(raw)
    return url.protocol === "https:" && !url.port && !url.username && /(^|\.)(salesforce\.com|force\.com|salesforce\.mil|cloudforce\.com)$/.test(url.hostname)
  } catch {
    return false
  }
}

export type SalesforceTokens = { accessToken: string; refreshToken: string | null; instanceUrl: string; orgId: string; identityUrl: string }

/** A token answer: the tokens, the org's instance and the org id (from the identity URL), or null. */
export function readSalesforceTokens(body: unknown): SalesforceTokens | null {
  if (!body || typeof body !== "object") return null
  const b = body as Record<string, unknown>
  if (typeof b.access_token !== "string" || !isSalesforceInstance(b.instance_url) || typeof b.id !== "string") return null
  const orgId = /\/id\/([a-zA-Z0-9]{15,18})\/[a-zA-Z0-9]{15,18}$/.exec(b.id)?.[1]
  if (!orgId) return null
  return {
    accessToken: b.access_token,
    refreshToken: typeof b.refresh_token === "string" ? b.refresh_token : null,
    instanceUrl: b.instance_url.replace(/\/+$/, ""),
    orgId,
    identityUrl: b.id,
  }
}

/** A Salesforce record id (15 or 18 characters), or null. */
export function normalizeRecordId(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const id = raw.trim()
  return /^[a-zA-Z0-9]{15}([a-zA-Z0-9]{3})?$/.test(id) ? id : null
}

/** A Task's link to the record: WhoId for a Contact (003) or Lead (00Q), WhatId for anything else. */
export function taskLinkField(recordId: string): "WhoId" | "WhatId" {
  const prefix = recordId.slice(0, 3)
  return prefix === "003" || prefix === "00Q" ? "WhoId" : "WhatId"
}

export type WriteBackEvent = "document.completed" | "document.declined"
export const WRITE_BACK_EVENTS: WriteBackEvent[] = ["document.completed", "document.declined"]

/** The steps a write-back takes, in order. */
export function writeBackSteps(event: WriteBackEvent): ("file" | "task")[] {
  return event === "document.completed" ? ["file", "task"] : ["task"]
}

/** The Task logged on the record. */
export function writeBackTask(input: { event: WriteBackEvent; recordId: string; title: string; siteName: string; at: Date; declinedBy?: { name: string; email: string; reason: string | null } | null }): Record<string, string> {
  const subject = input.event === "document.completed" ? `Signed: ${input.title}` : `Declined: ${input.title}`
  const description =
    input.event === "document.completed"
      ? `Everyone signed "${input.title}" with ${input.siteName}. The signed PDF is in this record's Files.`
      : `${input.declinedBy ? `${input.declinedBy.name} (${input.declinedBy.email})` : "A recipient"} declined to sign "${input.title}" in ${input.siteName}.${input.declinedBy?.reason ? ` Reason: ${input.declinedBy.reason}` : ""}`
  return {
    Subject: subject.slice(0, 255),
    Description: description.slice(0, 32_000),
    Status: "Completed",
    Priority: "Normal",
    ActivityDate: input.at.toISOString().slice(0, 10),
    [taskLinkField(input.recordId)]: input.recordId,
  }
}

/** The file name the signed PDF gets in Salesforce Files. */
export function signedFileName(title: string): string {
  const clean = title.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 200) || "Document"
  return `${clean} (signed).pdf`
}

/** When a failed job is tried again: 1, 5, 30 minutes, then 2 and 12 hours; given up after MAX_JOB_ATTEMPTS. */
const BACKOFF_MINUTES = [1, 5, 30, 120, 720]
export const MAX_JOB_ATTEMPTS = 8

export function nextAttemptAt(attempts: number, now: Date): Date | null {
  if (attempts >= MAX_JOB_ATTEMPTS) return null
  const minutes = BACKOFF_MINUTES[Math.min(attempts - 1, BACKOFF_MINUTES.length - 1)] ?? 1
  return new Date(now.getTime() + minutes * 60_000)
}
