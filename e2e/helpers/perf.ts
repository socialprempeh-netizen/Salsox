import type { CDPSession, Page } from "@playwright/test"

/**
 * The measuring tools shared by the performance specs (perf.spec.ts for
 * Salsox, perf-competitors.spec.ts for other sites), so every site is
 * measured with exactly the same throttling, observers and arithmetic.
 *
 * Why this exists: a comparison is only fair when the yardstick is the same
 * code. These were inside perf.spec.ts; they moved here unchanged apart from
 * `measureLoad` taking where to record its result and an idle timeout.
 */

export type Profile = "mobile" | "desktop"
export type Result = Record<string, number | string>

/**
 * Network and CPU conditions for `profile`. `cold` turns the browser cache
 * off, for first-visit page loads; the in-app interactions keep it on, as a
 * real visit does (the scripts it already loaded stay loaded).
 */
export async function throttle(cdp: CDPSession, profile: Profile, cold = true) {
  await cdp.send("Network.enable")
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: cold })
  if (profile === "mobile") {
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 150,
      downloadThroughput: (1.6 * 1024 * 1024) / 8,
      uploadThroughput: (750 * 1024) / 8,
    })
  }
}

/** Starts observers before the page's own scripts, so nothing is missed. */
export const OBSERVE = () => {
  const w = window as unknown as { __perf: { lcp: number; cls: number; tbt: number; longTasks: number } }
  w.__perf = { lcp: 0, cls: 0, tbt: 0, longTasks: 0 }
  new PerformanceObserver((l) => l.getEntries().forEach((e) => (w.__perf.lcp = e.startTime))).observe({ type: "largest-contentful-paint", buffered: true })
  new PerformanceObserver((l) =>
    l.getEntries().forEach((e) => {
      const shift = e as PerformanceEntry & { value: number; hadRecentInput: boolean }
      if (!shift.hadRecentInput) w.__perf.cls += shift.value
    })
  ).observe({ type: "layout-shift", buffered: true })
  new PerformanceObserver((l) =>
    l.getEntries().forEach((e) => {
      w.__perf.longTasks++
      w.__perf.tbt += Math.max(0, e.duration - 50)
    })
  ).observe({ type: "longtask", buffered: true })
}

/** Loads `path` cold and records its metrics. */
export async function measureLoad(
  page: Page,
  cdp: CDPSession,
  label: string,
  path: string,
  profile: Profile,
  record: (result: Result) => void,
  { idleTimeout = 60_000 }: { idleTimeout?: number } = {}
) {
  let js = 0
  let total = 0
  let requests = 0
  const sizes = new Map<string, { type: string }>()
  const types = (e: { requestId: string; type?: string }) => sizes.set(e.requestId, { type: e.type ?? "" })
  const finished = (e: { requestId: string; encodedDataLength: number }) => {
    requests++
    total += e.encodedDataLength
    if (sizes.get(e.requestId)?.type === "Script") js += e.encodedDataLength
  }
  cdp.on("Network.responseReceived", types)
  cdp.on("Network.loadingFinished", finished)

  const started = Date.now()
  await page.goto(path, { waitUntil: "load", timeout: 120_000 })
  const loadMs = Date.now() - started
  // Third-party sites keep analytics connections open and may never go
  // idle; they get a shorter wait (idleTimeout), the same for every site.
  await page.waitForLoadState("networkidle", { timeout: idleTimeout }).catch(() => {})
  await page.waitForTimeout(1500)
  const metrics = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming
    const fcp = performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? 0
    const w = window as unknown as { __perf: { lcp: number; cls: number; tbt: number; longTasks: number } }
    return { ttfb: nav.responseStart, fcp, lcp: w.__perf.lcp, cls: w.__perf.cls, tbt: w.__perf.tbt, longTasks: w.__perf.longTasks, domContentLoaded: nav.domContentLoadedEventEnd }
  })
  cdp.off("Network.responseReceived", types)
  cdp.off("Network.loadingFinished", finished)

  record({
    profile,
    page: label,
    ttfbMs: Math.round(metrics.ttfb),
    fcpMs: Math.round(metrics.fcp),
    lcpMs: Math.round(metrics.lcp),
    cls: Number(metrics.cls.toFixed(3)),
    tbtMs: Math.round(metrics.tbt),
    loadMs,
    jsKB: Math.round(js / 1024),
    totalKB: Math.round(total / 1024),
    requests,
  })
}

