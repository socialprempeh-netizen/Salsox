/** Tests for the webhook event list and its mapping from engine events (events.ts). */
import { describe, expect, it } from "vitest"
import { isWebhookEvent, normalizeEvents, webhookEventFor, WEBHOOK_EVENTS } from "./events"

describe("webhook events", () => {
  it("are the seven public events", () => {
    expect([...WEBHOOK_EVENTS]).toEqual(["document.sent", "document.viewed", "document.signed", "document.completed", "payment.sent", "document.declined", "document.expired"])
  })

  it("come from the engine's audit events, and only those seven", () => {
    expect(webhookEventFor("DOCUMENT_SENT")).toBe("document.sent")
    expect(webhookEventFor("DOCUMENT_VIEWED")).toBe("document.viewed")
    expect(webhookEventFor("RECIPIENT_SIGNED")).toBe("document.signed")
    expect(webhookEventFor("DOCUMENT_COMPLETED")).toBe("document.completed")
    expect(webhookEventFor("PAYMENT_RECEIVED")).toBe("payment.sent")
    expect(webhookEventFor("RECIPIENT_REJECTED")).toBe("document.declined")
    expect(webhookEventFor("DOCUMENT_EXPIRED")).toBe("document.expired")
    expect(webhookEventFor("FIELD_SIGNED")).toBeNull()
    expect(webhookEventFor("PAYMENT_REFUNDED")).toBeNull()
  })

  it("normalises a subscription list", () => {
    expect(normalizeEvents(["payment.sent", "document.sent", "nope", "document.sent"])).toEqual(["document.sent", "payment.sent"])
    expect(isWebhookEvent("document.viewed")).toBe(true)
    expect(isWebhookEvent("document.deleted")).toBe(false)
  })
})
