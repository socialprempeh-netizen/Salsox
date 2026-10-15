/**
 * Tests for the admin overview's alert rules (alerts.ts).
 */
import { describe, expect, it } from "vitest"
import { buildAlerts, type AlertInput } from "./alerts"

const quiet: AlertInput = {
  pendingMigrations: 0,
  stripeConfigured: true,
  paystackConfigured: false,
  emailConfigured: true,
  stuckPayments: 0,
  failedPayments7d: 0,
  disputes30d: 0,
  pastDueSubscriptions: 0,
  undeliveredInvites: 0,
}

describe("buildAlerts", () => {
  it("shows nothing when nothing needs a look", () => {
    expect(buildAlerts(quiet)).toEqual([])
    expect(buildAlerts({ ...quiet, pendingMigrations: null })).toEqual([])
  })

  it("orders critical before warning before info, each linked to its section", () => {
    const alerts = buildAlerts({ ...quiet, undeliveredInvites: 3, failedPayments7d: 2, pendingMigrations: 1 })
    expect(alerts.map((a) => [a.key, a.severity, a.count, a.href])).toEqual([
      ["pendingMigrations", "critical", 1, "/admin/health"],
      ["failedPayments", "warning", 2, "/admin/revenue"],
      ["undeliveredInvites", "info", 3, "/admin/health"],
    ])
  })

  it("asks for a payment provider only when neither is configured", () => {
    expect(buildAlerts({ ...quiet, stripeConfigured: false, paystackConfigured: true })).toEqual([])
    expect(buildAlerts({ ...quiet, stripeConfigured: false }).map((a) => a.key)).toEqual(["paymentsNotConfigured"])
  })
})
