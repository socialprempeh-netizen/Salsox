import { describe, expect, it } from "vitest"
import { cronRefusal } from "./cron-auth"

const req = (auth?: string) => new Request("https://x.test/api/cron/outreach-agent", { headers: auth ? { authorization: auth } : {} })

describe("cronRefusal", () => {
  it("refuses when CRON_SECRET is unset", () => {
    expect(cronRefusal(req("Bearer x"), "")).toMatchObject({ status: 500 })
  })

  it("refuses a wrong or missing token", () => {
    expect(cronRefusal(req(), "s")).toMatchObject({ status: 401 })
    expect(cronRefusal(req("Bearer t"), "s")).toMatchObject({ status: 401 })
  })

  it("lets the right token through", () => {
    expect(cronRefusal(req("Bearer s"), "s")).toBeNull()
  })
})
