/** Tests for which webhook URLs the server may call (url-safety.ts). */
import { describe, expect, it } from "vitest"
import { checkWebhookUrl, isPrivateAddress } from "./url-safety"

describe("checkWebhookUrl", () => {
  it("takes a public https URL, without its fragment", () => {
    expect(checkWebhookUrl("https://hooks.zapier.com/hooks/catch/1/abc/#x")).toEqual({ ok: true, url: "https://hooks.zapier.com/hooks/catch/1/abc/" })
    expect(checkWebhookUrl("https://example.com:8443/in").ok).toBe(true)
  })

  it("refuses plain http, credentials, odd ports and garbage", () => {
    expect(checkWebhookUrl("http://example.com/in")).toEqual({ ok: false, problem: "https" })
    expect(checkWebhookUrl("ftp://example.com/in")).toEqual({ ok: false, problem: "https" })
    expect(checkWebhookUrl("https://user:pw@example.com/")).toEqual({ ok: false, problem: "credentials" })
    expect(checkWebhookUrl("https://example.com:22/")).toEqual({ ok: false, problem: "port" })
    expect(checkWebhookUrl("not a url")).toEqual({ ok: false, problem: "invalid" })
  })

  it("refuses this machine and private networks", () => {
    for (const u of ["https://localhost/x", "https://127.0.0.1/x", "https://10.1.2.3/x", "https://169.254.169.254/latest", "https://[::1]/x", "https://db.internal/x", "https://printer.local/x"]) {
      expect(checkWebhookUrl(u), u).toEqual({ ok: false, problem: "private" })
    }
  })

  it("allows http to localhost only when asked (development)", () => {
    expect(checkWebhookUrl("http://localhost:4000/hook", { allowLocalHttp: true }).ok).toBe(true)
    expect(checkWebhookUrl("http://example.com/hook", { allowLocalHttp: true }).ok).toBe(false)
  })
})

describe("isPrivateAddress", () => {
  it("knows the private, loopback, link-local and reserved ranges", () => {
    for (const ip of ["0.0.0.0", "10.0.0.1", "100.64.0.1", "127.0.0.1", "169.254.169.254", "172.16.0.1", "172.31.255.255", "192.168.1.1", "224.0.0.1", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1"]) {
      expect(isPrivateAddress(ip), ip).toBe(true)
    }
  })

  it("lets public addresses through", () => {
    for (const ip of ["8.8.8.8", "172.32.0.1", "100.128.0.1", "2606:4700::1111", "::ffff:8.8.8.8"]) {
      expect(isPrivateAddress(ip), ip).toBe(false)
    }
  })
})
