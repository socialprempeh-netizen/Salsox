import { describe, it, expect, vi } from "vitest"

import {
  changedSince,
  deployPingId,
  INDEXNOW_ENDPOINT,
  INDEXNOW_MAX_URLS,
  indexNowPayloads,
  isAcceptedStatus,
  isKeyFilePath,
  isValidIndexNowKey,
  normalizeUrls,
  pendingUrls,
  resolveIndexNowKey,
  submitToIndexNow,
} from "./indexnow"

const SITE = "https://salsox.com"

describe("resolveIndexNowKey", () => {
  it("prefers an explicit, valid key", () => {
    expect(resolveIndexNowKey({ INDEXNOW_KEY: "abc12345-key", CRON_SECRET: "s" })).toBe("abc12345-key")
  })

  // A malformed explicit key turns IndexNow off rather than silently
  // falling back: the operator asked for that key, so a different one would
  // be a surprise.
  it("is off when the explicit key breaks the protocol's rules", () => {
    expect(resolveIndexNowKey({ INDEXNOW_KEY: "short", CRON_SECRET: "s" })).toBeNull()
  })

  it("derives a stable, valid key from CRON_SECRET", () => {
    const a = resolveIndexNowKey({ CRON_SECRET: "secret-one" })
    expect(a).not.toBeNull()
    expect(isValidIndexNowKey(a!)).toBe(true)
    expect(resolveIndexNowKey({ CRON_SECRET: "secret-one" })).toBe(a)
    expect(resolveIndexNowKey({ CRON_SECRET: "secret-two" })).not.toBe(a)
    // The key is published, so it must not be the secret itself.
    expect(a).not.toContain("secret")
  })

  it("is off with neither variable", () => {
    expect(resolveIndexNowKey({})).toBeNull()
  })
})

describe("normalizeUrls", () => {
  it("makes paths absolute, drops other hosts and duplicates", () => {
    expect(
      normalizeUrls(SITE, ["/pricing", `${SITE}/pricing`, "https://www.salsox.com/blog", "https://evil.example/x", `${SITE}/docs#top`]),
    ).toEqual([`${SITE}/pricing`, `${SITE}/docs`])
  })

  it("ignores schemes that are not web URLs", () => {
    expect(normalizeUrls(SITE, ["mailto:hi@salsox.com", "javascript:alert(1)"])).toEqual([])
  })
})

describe("changedSince", () => {
  it("keeps entries modified on or after the moment, and skips undated ones", () => {
    const since = new Date("2026-09-30T00:00:00Z")
    expect(
      changedSince(
        [
          { url: "a", lastModified: new Date("2026-09-30T00:00:00Z") },
          { url: "b", lastModified: "2026-09-29T00:00:00Z" },
          { url: "c" },
          { url: "d", lastModified: "2026-10-01T06:00:00Z" },
        ],
        since,
      ),
    ).toEqual(["a", "d"])
  })
})

describe("indexNowPayloads", () => {
  it("names the host and the key file on the same origin", () => {
    const [payload] = indexNowPayloads(SITE, "abc12345", ["/pricing"])
    expect(payload).toEqual({
      host: "salsox.com",
      key: "abc12345",
      keyLocation: `${SITE}/abc12345.txt`,
      urlList: [`${SITE}/pricing`],
    })
  })

  it("splits at the protocol's per-request ceiling", () => {
    const urls = Array.from({ length: INDEXNOW_MAX_URLS + 1 }, (_, i) => `/p/${i}`)
    expect(indexNowPayloads(SITE, "abc12345", urls).map((p) => p.urlList.length)).toEqual([INDEXNOW_MAX_URLS, 1])
  })

  it("sends nothing for nothing", () => {
    expect(indexNowPayloads(SITE, "abc12345", [])).toEqual([])
  })
})

describe("submitToIndexNow", () => {
  it("posts JSON to the shared endpoint and reports each status", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 202 }))
    const out = await submitToIndexNow(SITE, "abc12345", ["/a", "/b"], fetchImpl as unknown as typeof fetch)

    expect(out).toEqual({ submitted: 2, statuses: [202] })
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(INDEXNOW_ENDPOINT)
    expect(init.method).toBe("POST")
    expect(JSON.parse(String(init.body)).urlList).toEqual([`${SITE}/a`, `${SITE}/b`])
  })
})

describe("isKeyFilePath", () => {
  it("matches only /{key}.txt for the active key", () => {
    expect(isKeyFilePath("/abc12345.txt", "abc12345")).toBe(true)
    expect(isKeyFilePath("/abc12345.txt", "other123")).toBe(false)
    expect(isKeyFilePath("/abc12345.txt", null)).toBe(false)
    expect(isKeyFilePath("/x/abc12345.txt", "abc12345")).toBe(false)
  })
})

describe("pendingUrls", () => {
  const day = (d: string) => new Date(`${d}T00:00:00Z`)
  it("sends new URLs and URLs changed since their last accepted submission, nothing else", () => {
    const entries = [
      { url: "a", lastModified: day("2026-10-15") },
      { url: "b", lastModified: day("2026-10-15") },
      { url: "c", lastModified: day("2026-10-10") },
      { url: "d" },
      { url: "e" },
    ]
    const submitted = new Map<string, Date | null>([
      ["b", day("2026-10-14")],
      ["c", day("2026-10-10")],
      ["e", null],
    ])
    expect(pendingUrls(entries, submitted).map((p) => p.url)).toEqual(["a", "b", "d"])
  })

  it("sends an undated URL again once it gains a date", () => {
    expect(pendingUrls([{ url: "e", lastModified: day("2026-10-15") }], new Map([["e", null]]))).toEqual([{ url: "e", lastModified: day("2026-10-15") }])
  })
})

describe("isAcceptedStatus", () => {
  it("accepts 200 and 202 only", () => {
    expect([200, 202, 400, 403, 422, 429, 0].map(isAcceptedStatus)).toEqual([true, true, false, false, false, false, false])
  })
})

describe("deployPingId", () => {
  it("is set only on a Vercel production deployment", () => {
    expect(deployPingId({ VERCEL_ENV: "production", VERCEL_DEPLOYMENT_ID: "dpl_1", VERCEL_GIT_COMMIT_SHA: "abc" })).toBe("dpl_1")
    expect(deployPingId({ VERCEL_ENV: "production", VERCEL_GIT_COMMIT_SHA: "abc" })).toBe("abc")
    expect(deployPingId({ VERCEL_ENV: "preview", VERCEL_DEPLOYMENT_ID: "dpl_1" })).toBeNull()
    expect(deployPingId({})).toBeNull()
  })
})
