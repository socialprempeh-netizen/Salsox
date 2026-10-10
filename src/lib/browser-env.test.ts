/**
 * Tests for browser-env.ts: telling app-embedded browsers apart from real
 * ones by user agent, and listing the features a browser lacks.
 */
import { describe, expect, it } from "vitest"
import { inAppBrowser, missingFeatures } from "./browser-env"

const UA = {
  iosSafari: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  iosWebView: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
  iosGoogleApp: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) GSA/321.0.646712497 Mobile/15E148 Safari/604.1",
  androidChrome: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36",
  androidWebView: "Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.0.0 Mobile Safari/537.36",
  facebook: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/470.0.0]",
  desktopChrome: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
}

describe("inAppBrowser", () => {
  it("tells embedded browsers apart from the phone's own", () => {
    expect(inAppBrowser(UA.iosWebView)).toBe("ios-webview")
    expect(inAppBrowser(UA.iosGoogleApp)).toBe("google-app")
    expect(inAppBrowser(UA.androidWebView)).toBe("android-webview")
    expect(inAppBrowser(UA.facebook)).toBe("facebook")
  })

  it("is null for regular browsers", () => {
    expect(inAppBrowser(UA.iosSafari)).toBeNull()
    expect(inAppBrowser(UA.androidChrome)).toBeNull()
    expect(inAppBrowser(UA.desktopChrome)).toBeNull()
    expect(inAppBrowser("")).toBeNull()
  })
})

describe("missingFeatures", () => {
  it("lists nothing for a scope that has everything", () => {
    const fn = function () {}
    const modern = { IntersectionObserver: fn, ResizeObserver: fn, structuredClone: fn, Worker: fn, PointerEvent: fn, Promise: { withResolvers: fn, try: fn } }
    expect(missingFeatures(modern)).toEqual([])
  })

  it("names what an older engine lacks", () => {
    const old = { IntersectionObserver: function () {}, Worker: function () {}, Promise: { resolve() {} } }
    expect(missingFeatures(old)).toEqual(["ResizeObserver", "structuredClone", "PointerEvent", "Promise.withResolvers", "Promise.try"])
  })
})
