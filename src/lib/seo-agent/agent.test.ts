/**
 * The daily run end to end, with the database, Google and Claude replaced by
 * fakes: it skips when not configured, picks the best untargeted query, keeps
 * the first three articles as drafts, publishes the fourth with links from
 * the busiest pages, and records failures without throwing.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { SiteAdapter } from "./agent"

const store = vi.hoisted(() => ({
  startRun: vi.fn(async () => "run1"),
  finishRun: vi.fn(async () => {}),
  targetKeywords: vi.fn(async () => [] as string[]),
  articleTitles: vi.fn(async () => [] as string[]),
  articleSlugs: vi.fn(async () => new Set<string>()),
  countArticles: vi.fn(async () => 0),
  createTarget: vi.fn(async () => "t1" as string | null),
  saveArticle: vi.fn(async () => "a1"),
  setTargetStatus: vi.fn(async () => {}),
  getSettings: vi.fn(async () => ({ draftFirst: false })),
  getArticle: vi.fn(),
  markPublished: vi.fn(async () => {}),
}))
vi.mock("./store", () => store)

const google = vi.hoisted(() => ({
  fetchSearchRows: vi.fn(),
  fetchTopSearchPages: vi.fn(async () => [] as string[]),
}))
vi.mock("./google", async (original) => ({ ...(await original<typeof import("./google")>()), ...google }))

const writer = vi.hoisted(() => ({
  hasWriterKey: vi.fn(() => true),
  writeArticle: vi.fn(),
  writeLinkSentences: vi.fn(async () => [] as { path: string; afterParagraph: number; sentence: string }[]),
}))
vi.mock("./writer", () => writer)

const { publishArticle, runDaily } = await import("./agent")

const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(" ")
const draft = {
  title: "How to sign a lease agreement online",
  description: "How to sign a lease online from any phone, what makes the signature valid, and what landlords and tenants should keep.",
  category: "Guides",
  body: `${words(200)}\n\n## One\n\n${words(200)}\n\n## Two\n\n${words(200)}\n\n## Three\n\n${words(200)}`,
  faq: [1, 2, 3].map((i) => ({ q: `Question number ${i}?`, a: `A complete answer number ${i} that is long enough.` })),
  related: ["/sign-pdf", "/pricing"],
}

const revalidate = vi.fn()
const site: SiteAdapter = {
  name: "Acme",
  url: "https://acme.test",
  description: "Signing.",
  productSummary: "Acme signs PDFs.",
  searchConsoleSite: "https://acme.test/",
  coveredPhrases: () => ["How to sign a PDF"],
  takenSlugs: () => new Set(["how-to-sign-a-pdf"]),
  categories: () => ["Guides"],
  sitePaths: async () => [
    { path: "/sign-pdf", name: "Sign PDF", description: "Tool." },
    { path: "/pricing", name: "Pricing", description: "Plans." },
  ],
  styleReferences: () => [],
  linkablePages: () =>
    new Map([
      ["/blog/busy", { path: "/blog/busy", title: "Busy", markdown: "First paragraph about leases.\n\nSecond paragraph.\n" }],
      ["/sign-pdf", { path: "/sign-pdf", title: "Sign PDF", markdown: "Sign a PDF here.\n" }],
    ]),
  topPages: async () => ["/", "/sign-pdf", "/blog/busy"],
  crawl: async () => [],
  revalidate,
}

const row = (query: string, impressions: number, position: number) => ({ query, page: "https://acme.test/x", impressions, position, clicks: 0 })
const KEY = Buffer.from(JSON.stringify({ client_email: "bot@p.iam", private_key: "-----BEGIN PRIVATE KEY-----\nx\n-----END PRIVATE KEY-----" })).toString("base64")

beforeEach(() => {
  vi.clearAllMocks()
  process.env.GA_SERVICE_ACCOUNT_KEY_BASE64 = KEY
  process.env.ANTHROPIC_API_KEY = "test"
  google.fetchSearchRows.mockResolvedValue([row("sign pdf", 900, 12), row("sign a lease online", 400, 15), row("acme login", 900, 12)])
  writer.writeArticle.mockResolvedValue({ draft, model: "claude-opus-5-5" })
  store.getArticle.mockResolvedValue({ id: "a1", slug: "sign-a-lease-online", title: draft.title, description: draft.description, keyword: "sign a lease online", target: { status: "DRAFT" } })
})

describe("runDaily", () => {
  it("is skipped, and says what is missing, when not configured", async () => {
    delete process.env.ANTHROPIC_API_KEY
    const result = await runDaily(site, "cron")
    expect(result).toMatchObject({ status: "skipped", message: "Not configured: set ANTHROPIC_API_KEY." })
    expect(google.fetchSearchRows).not.toHaveBeenCalled()
  })

  it("does nothing while another run is in progress", async () => {
    store.startRun.mockResolvedValueOnce(null as unknown as string)
    expect((await runDaily(site, "cron")).status).toBe("skipped")
    expect(store.createTarget).not.toHaveBeenCalled()
  })

  it("picks the best query nothing covers and saves a draft while in the review period", async () => {
    store.countArticles.mockResolvedValueOnce(2)
    const result = await runDaily(site, "cron")
    expect(store.createTarget).toHaveBeenCalledWith(expect.objectContaining({ query: "sign a lease online" }))
    expect(store.saveArticle).toHaveBeenCalledWith(expect.objectContaining({ slug: "sign-a-lease-online", keyword: "sign a lease online", title: draft.title }))
    expect(store.markPublished).not.toHaveBeenCalled()
    expect(result).toMatchObject({ status: "ok", published: false })
  })

  it("publishes the fourth article with links from the busiest pages that can carry one", async () => {
    store.countArticles.mockResolvedValueOnce(3)
    writer.writeLinkSentences.mockResolvedValueOnce([{ path: "/blog/busy", afterParagraph: 0, sentence: "Renting? See [how to sign a lease online](/blog/sign-a-lease-online)." }])
    const result = await runDaily(site, "cron")
    expect(result).toMatchObject({ status: "ok", published: true })
    const [, { links, auto }] = store.markPublished.mock.calls[0] as unknown as [string, { links: { sourcePath: string; sentence: string }[]; auto: boolean }]
    expect(auto).toBe(true)
    expect(links.map((l) => l.sourcePath)).toEqual(["/sign-pdf", "/blog/busy"])
    // The writer's sentence where it was usable, a plain one where it gave none.
    expect(links[1].sentence).toContain("Renting?")
    expect(links[0].sentence).toBe(`For a closer look at this, read [${draft.title}](/blog/sign-a-lease-online).`)
    expect(revalidate).toHaveBeenCalledWith(expect.arrayContaining(["/blog/sign-a-lease-online", "/sign-pdf", "/blog/busy"]))
  })

  it("keeps drafting in review-every-article mode", async () => {
    store.countArticles.mockResolvedValueOnce(10)
    store.getSettings.mockResolvedValueOnce({ draftFirst: true })
    expect((await runDaily(site, "cron")).published).toBe(false)
  })

  it("retries a draft that fails its checks once, then records the failure", async () => {
    writer.writeArticle.mockResolvedValue({ draft: { ...draft, title: "Bad" }, model: "m" })
    const result = await runDaily(site, "cron")
    expect(writer.writeArticle).toHaveBeenCalledTimes(2)
    expect(writer.writeArticle.mock.calls[1][0].feedback[0]).toMatch(/title is 3 characters/)
    expect(store.setTargetStatus).toHaveBeenCalledWith("t1", "FAILED", expect.objectContaining({ error: expect.stringMatching(/did not pass its checks/) }))
    expect(result.status).toBe("failed")
  })

  it("reports a Search Console error as a failed run, not a thrown one", async () => {
    google.fetchSearchRows.mockRejectedValueOnce(new Error("Search Console answered 403: no access"))
    expect(await runDaily(site, "cron")).toMatchObject({ status: "failed", message: "Could not read Search Console: Search Console answered 403: no access" })
  })

  it("skips when every opportunity is covered", async () => {
    google.fetchSearchRows.mockResolvedValueOnce([row("sign pdf", 900, 12)])
    expect(await runDaily(site, "cron")).toMatchObject({ status: "skipped", message: expect.stringMatching(/already covered/) })
  })
})

describe("publishArticle", () => {
  it("still publishes when the traffic sources fail, and says so", async () => {
    const failing = { ...site, topPages: async () => Promise.reject(new Error("GA not configured")) }
    google.fetchTopSearchPages.mockRejectedValueOnce(new Error("Search Console answered 403"))
    const result = await publishArticle(failing, "a1", { auto: false })
    expect(result).toEqual({ ok: true, message: "No links were added: Search Console answered 403" })
    expect(store.markPublished).toHaveBeenCalledWith("a1", { links: [], auto: false })
  })

  it("refuses a discarded article", async () => {
    store.getArticle.mockResolvedValueOnce({ id: "a1", target: { status: "DISCARDED" } })
    expect((await publishArticle(site, "a1", { auto: false })).ok).toBe(false)
    expect(store.markPublished).not.toHaveBeenCalled()
  })
})
