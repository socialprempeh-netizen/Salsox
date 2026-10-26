/**
 * The Salesforce write-back against a real database (salesforce-store.ts),
 * with Salesforce itself replaced by a recording fetch and the signed PDF by
 * a stub: a completed document from a record gets one job, its PDF filed on
 * the record and a task logged; a failure leaves the job for a retry that
 * does not upload the PDF again; a 401 refreshes the token once.
 *
 * Only when asked:
 * `ESIGN_DB_TESTS=1 npx vitest run src/lib/integrations/salesforce-store.db.test.ts`.
 * Every row hangs off one user, deleted at the end.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { randomUUID } from "node:crypto"
import { config } from "dotenv"

const enabled = process.env.ESIGN_DB_TESTS === "1"

vi.mock("@/lib/esign/storage", () => ({ getFile: async () => new Uint8Array([37, 80, 68, 70]) }))

type Call = { url: string; method: string; body: string }
const calls: Call[] = []
let answer: (call: Call) => { status: number; body?: unknown }

describe.skipIf(!enabled)("Salesforce write-back (database)", () => {
  let prisma: typeof import("@/lib/prisma").prisma
  let store: typeof import("./salesforce-store")
  let userId: string
  let documentId: string

  beforeAll(async () => {
    config({ path: ".env.local" })
    config({ path: ".env" })
    process.env.AUTH_SECRET ??= "db-test-secret"
    process.env.SALESFORCE_CLIENT_ID = "test-client"
    process.env.SALESFORCE_CLIENT_SECRET = "test-secret"
    vi.stubGlobal("fetch", async (url: string, init: { method?: string; body?: unknown }) => {
      const call = { url: String(url), method: init?.method ?? "GET", body: String(init?.body ?? "") }
      calls.push(call)
      const { status, body } = answer(call)
      return new Response(body === undefined ? null : JSON.stringify(body), { status })
    })
    prisma = (await import("@/lib/prisma")).prisma
    store = await import("./salesforce-store")
    const { sealSecret } = await import("@/lib/webhooks/secret-box")
    const user = await prisma.user.create({ data: { name: "SF Test", email: `sf-${randomUUID()}@example.com` } })
    userId = user.id
    await prisma.salesforceConnection.create({
      data: { userId, orgId: "00D5g000004XyZaEAK", instanceUrl: "https://acme.my.salesforce.com", accessToken: sealSecret("old-access"), refreshToken: sealSecret("refresh-1") },
    })
    const doc = await prisma.document.create({
      data: { userId, title: "Lease", status: "COMPLETED", originalKey: "o.pdf", originalSha256: "0".repeat(64), sealedKey: "s.pdf", pageCount: 1, completedAt: new Date(), salesforceRecordId: "0065g00000XyZaBAAV" },
    })
    documentId = doc.id
  })

  afterAll(async () => {
    vi.unstubAllGlobals()
    await prisma.user.delete({ where: { id: userId } })
  })

  beforeEach(() => {
    calls.length = 0
  })

  it("files the PDF and logs a task, refreshing an expired token once, and retries only what failed", async () => {
    let taskAttempts = 0
    answer = (call) => {
      if (call.url.endsWith("/services/oauth2/token")) return { status: 200, body: { access_token: "new-access", instance_url: "https://acme.my.salesforce.com", id: "https://login.salesforce.com/id/00D5g000004XyZaEAK/0055g00000AbCdEAAZ" } }
      if (call.url.endsWith("/sobjects/ContentVersion")) return call.body.includes('"VersionData"') && !calls.some((c) => c.url.endsWith("/services/oauth2/token")) ? { status: 401 } : { status: 201, body: { id: "068000000000001" } }
      if (call.url.endsWith("/sobjects/Task")) return ++taskAttempts === 1 ? { status: 503 } : { status: 201, body: { id: "00T000000000001" } }
      return { status: 404 }
    }

    await store.queueSalesforceWriteBack({ documentId, event: "document.completed" })
    let job = await prisma.integrationJob.findUniqueOrThrow({ where: { documentId_provider_event: { documentId, provider: "salesforce", event: "document.completed" } } })
    // The PDF went in (after one refresh); the task failed, so the job waits.
    expect(job.status).toBe("PENDING")
    expect(job.progress).toEqual({ contentVersionId: "068000000000001" })
    expect(job.lastError).toContain("503")
    expect(calls.filter((c) => c.url.endsWith("/services/oauth2/token"))).toHaveLength(1)
    const upload = JSON.parse(calls.filter((c) => c.url.endsWith("/sobjects/ContentVersion")).at(-1)!.body)
    expect(upload).toMatchObject({ PathOnClient: "Lease (signed).pdf", FirstPublishLocationId: "0065g00000XyZaBAAV", VersionData: "JVBERg==" })

    calls.length = 0
    expect(await store.runSalesforceJob(job.id)).toBe("done")
    job = await prisma.integrationJob.findUniqueOrThrow({ where: { id: job.id } })
    expect(job.status).toBe("DONE")
    expect(job.progress).toEqual({ contentVersionId: "068000000000001", taskId: "00T000000000001" })
    // The retry logged the task and did not upload the PDF a second time.
    expect(calls.map((c) => c.url.split("/").at(-1))).toEqual(["Task"])
    expect(JSON.parse(calls[0].body)).toMatchObject({ Subject: "Signed: Lease", WhatId: "0065g00000XyZaBAAV", Status: "Completed" })

    // The same event again makes no second job.
    await store.queueSalesforceWriteBack({ documentId, event: "document.completed" })
    expect(await prisma.integrationJob.count({ where: { documentId } })).toBe(1)
  })

  it("gives up after the last attempt, and the Developers page counts it", async () => {
    answer = () => ({ status: 500 })
    await store.queueSalesforceWriteBack({ documentId, event: "document.declined" })
    const job = await prisma.integrationJob.findUniqueOrThrow({ where: { documentId_provider_event: { documentId, provider: "salesforce", event: "document.declined" } } })
    await prisma.integrationJob.update({ where: { id: job.id }, data: { attempts: 7 } })
    expect(await store.runSalesforceJob(job.id)).toBe("failed")
    expect((await store.salesforceStatus(userId))?.failedJobs).toBe(1)
  })
})
