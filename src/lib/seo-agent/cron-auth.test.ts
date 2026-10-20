/** The cron routes refuse without CRON_SECRET, and without its bearer token. */
import { describe, expect, it } from "vitest"
import { cronRefusal } from "./cron-auth"

const request = (auth?: string) => new Request("https://site.test/api/cron/seo-agent", { headers: auth ? { authorization: auth } : {} })

describe("cronRefusal", () => {
  it("refuses to run open when the secret is unset", () => {
    expect(cronRefusal(request("Bearer x"), undefined)?.status).toBe(500)
  })

  it("rejects a missing or wrong token", () => {
    expect(cronRefusal(request(), "s3cret")?.status).toBe(401)
    expect(cronRefusal(request("Bearer nope"), "s3cret")?.status).toBe(401)
  })

  it("lets the right token through", () => {
    expect(cronRefusal(request("Bearer s3cret"), "s3cret")).toBeNull()
  })
})
