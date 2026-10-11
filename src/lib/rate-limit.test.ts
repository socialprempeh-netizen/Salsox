import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { betterAuthRateLimitStorage, checkRateLimit } from "@/lib/rate-limit"

// The limiter keeps its counters in a module-level Map, so every test needs
// its own key or it would inherit the previous test's count.
let n = 0
const freshKey = () => `test-key-${++n}`

describe("checkRateLimit, in memory", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("allows the first attempt on an unseen key", async () => {
    expect(await checkRateLimit(freshKey(), 5, 1000)).toBe(true)
  })

  it("allows exactly max attempts, then blocks", async () => {
    const key = freshKey()
    expect(await checkRateLimit(key, 3, 1000)).toBe(true)
    expect(await checkRateLimit(key, 3, 1000)).toBe(true)
    expect(await checkRateLimit(key, 3, 1000)).toBe(true)
    expect(await checkRateLimit(key, 3, 1000)).toBe(false)
  })

  it("keeps blocking while the window is open", async () => {
    const key = freshKey()
    await checkRateLimit(key, 1, 10_000)
    expect(await checkRateLimit(key, 1, 10_000)).toBe(false)
    vi.advanceTimersByTime(9_999)
    expect(await checkRateLimit(key, 1, 10_000)).toBe(false)
  })

  it("starts a new window once the old one has expired", async () => {
    const key = freshKey()
    await checkRateLimit(key, 1, 1000)
    expect(await checkRateLimit(key, 1, 1000)).toBe(false)
    vi.advanceTimersByTime(1001)
    expect(await checkRateLimit(key, 1, 1000)).toBe(true)
  })

  it("counts each key separately", async () => {
    const a = freshKey()
    const b = freshKey()
    await checkRateLimit(a, 1, 1000)
    expect(await checkRateLimit(a, 1, 1000)).toBe(false)
    // b must be untouched by a's exhausted budget.
    expect(await checkRateLimit(b, 1, 1000)).toBe(true)
  })

  it("defaults to 5 attempts per 15 minutes", async () => {
    const key = freshKey()
    for (let i = 0; i < 5; i++) expect(await checkRateLimit(key)).toBe(true)
    expect(await checkRateLimit(key)).toBe(false)
    vi.advanceTimersByTime(15 * 60 * 1000 + 1)
    expect(await checkRateLimit(key)).toBe(true)
  })
})

/**
 * The shared store, which only exists when two environment variables are set.
 *
 * These tests never reach Upstash: they stand in for it with `fetch`, because
 * what has to be right is not their REST API but the three things this project
 * decided — that the counters go there when configured, that the window does
 * not slide, and that an outage falls back instead of failing in either
 * direction.
 */
describe("checkRateLimit, shared store", () => {
  const env = { url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN }

  beforeEach(() => {
    process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io"
    process.env.UPSTASH_REDIS_REST_TOKEN = "test-token"
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    if (env.url === undefined) delete process.env.UPSTASH_REDIS_REST_URL
    else process.env.UPSTASH_REDIS_REST_URL = env.url
    if (env.token === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN
    else process.env.UPSTASH_REDIS_REST_TOKEN = env.token
  })

  const respondWith = (count: number) => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ result: count }, { result: 1 }],
    })
    vi.stubGlobal("fetch", fetchMock)
    return fetchMock
  }

  it("counts in the shared store rather than in memory", async () => {
    const fetchMock = respondWith(1)
    expect(await checkRateLimit(freshKey(), 5, 1000)).toBe(true)
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it("blocks once the shared count passes the limit", async () => {
    respondWith(6)
    expect(await checkRateLimit(freshKey(), 5, 1000)).toBe(false)
  })

  /**
   * The bug this prevents is silent and nasty: with a plain PEXPIRE, every hit
   * pushes the expiry forward, so somebody who keeps knocking is never let
   * back in. NX means the window starts at the first hit and ends on time.
   */
  it("sets the expiry only if the key does not have one", async () => {
    const fetchMock = respondWith(1)
    await checkRateLimit("window-key", 5, 60_000)
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    expect(body).toEqual([
      ["INCR", "window-key"],
      ["PEXPIRE", "window-key", "60000", "NX"],
    ])
  })

  it("sends the token, and nothing else, as the credential", async () => {
    const fetchMock = respondWith(1)
    await checkRateLimit(freshKey(), 5, 1000)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("https://example.upstash.io/pipeline")
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-token")
  })

  /**
   * An unreachable Redis must not take the site with it, and must not silently
   * remove the protection either. What is left is the in-memory speed bump —
   * which is what the kit had before anybody configured a store.
   */
  it("falls back to memory when the store is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")))
    const key = freshKey()
    expect(await checkRateLimit(key, 2, 60_000)).toBe(true)
    expect(await checkRateLimit(key, 2, 60_000)).toBe(true)
    // Still counting, locally: the third one is over the limit.
    expect(await checkRateLimit(key, 2, 60_000)).toBe(false)
  })

  it("treats a non-200 the same way as a network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }))
    expect(await checkRateLimit(freshKey(), 1, 60_000)).toBe(true)
  })
})

/**
 * Better Auth's limiter on the same counters. What matters: its window is in
 * seconds, its keys cannot collide with the app's, and it is shared through
 * Upstash like the rest.
 */
describe("betterAuthRateLimitStorage", () => {
  it("allows exactly max requests per window, then refuses with a retry delay", async () => {
    const key = freshKey()
    const rule = { window: 60, max: 2 }
    expect(await betterAuthRateLimitStorage.consume(key, rule)).toEqual({ allowed: true, retryAfter: null })
    expect(await betterAuthRateLimitStorage.consume(key, rule)).toEqual({ allowed: true, retryAfter: null })
    expect(await betterAuthRateLimitStorage.consume(key, rule)).toEqual({ allowed: false, retryAfter: 60 })
  })

  it("does not share counters with the app's own limits", async () => {
    const key = freshKey()
    expect(await checkRateLimit(key, 1, 60_000)).toBe(true)
    expect(await checkRateLimit(key, 1, 60_000)).toBe(false)
    expect((await betterAuthRateLimitStorage.consume(key, { window: 60, max: 1 })).allowed).toBe(true)
  })

  describe("with Upstash configured", () => {
    const env = { url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN }

    beforeEach(() => {
      process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io"
      process.env.UPSTASH_REDIS_REST_TOKEN = "test-token"
    })

    afterEach(() => {
      vi.unstubAllGlobals()
      if (env.url === undefined) delete process.env.UPSTASH_REDIS_REST_URL
      else process.env.UPSTASH_REDIS_REST_URL = env.url
      if (env.token === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN
      else process.env.UPSTASH_REDIS_REST_TOKEN = env.token
    })

    it("counts in the shared store, with the window converted to milliseconds", async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [{ result: 4 }, { result: 1 }] })
      vi.stubGlobal("fetch", fetchMock)
      expect(await betterAuthRateLimitStorage.consume("1.2.3.4|/sign-in/email", { window: 10, max: 3 })).toEqual({ allowed: false, retryAfter: 10 })
      expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toEqual([
        ["INCR", "better-auth:1.2.3.4|/sign-in/email"],
        ["PEXPIRE", "better-auth:1.2.3.4|/sign-in/email", "10000", "NX"],
      ])
    })
  })
})
