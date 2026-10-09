import { describe, it, expect } from "vitest"

import {
  documentsLeft,
  FREE_DOCUMENTS_PER_MONTH,
  FREE_REQUEST_TOOL_USES,
  hasFeature,
  monthStartUtc,
  planErrorCode,
  requestToolUsesLeft,
  setupBlocker,
  tierForEntitlement,
  tierForPlanSlug,
} from "./plans"

describe("hasFeature", () => {
  it("gives Business everything", () => {
    for (const f of ["unlimitedDocuments", "signAndPay", "sequentialSigning", "approvers", "auditCertificate"] as const) {
      expect(hasFeature("business", f)).toBe(true)
    }
  })

  // The pricing page: Personal is unlimited documents, without Sign & Pay or
  // sequential signing, and without the sealed certificate.
  it("gives Personal unlimited documents and nothing from Business", () => {
    expect(hasFeature("personal", "unlimitedDocuments")).toBe(true)
    expect(hasFeature("personal", "signAndPay")).toBe(false)
    expect(hasFeature("personal", "sequentialSigning")).toBe(false)
    expect(hasFeature("personal", "auditCertificate")).toBe(false)
  })

  it("gives free none of the gated features", () => {
    expect(hasFeature("free", "unlimitedDocuments")).toBe(false)
    expect(hasFeature("free", "signAndPay")).toBe(false)
  })
})

describe("tierForPlanSlug", () => {
  it("maps the seeded plans", () => {
    expect(tierForPlanSlug("starter-monthly")).toBe("personal")
    expect(tierForPlanSlug("starter-yearly")).toBe("personal")
    expect(tierForPlanSlug("pro-monthly")).toBe("business")
    expect(tierForPlanSlug("pro-yearly")).toBe("business")
    expect(tierForPlanSlug("lifetime")).toBe("business")
  })

  it("treats an unknown paid plan as Personal, never as free", () => {
    expect(tierForPlanSlug("metered-example")).toBe("personal")
  })
})

describe("tierForEntitlement", () => {
  it("reads the plan of a subscription or a lifetime purchase", () => {
    expect(tierForEntitlement({ kind: "subscription", subscription: { plan: { slug: "pro-monthly" } } })).toBe("business")
    expect(tierForEntitlement({ kind: "lifetime", purchase: { plan: { slug: "lifetime" } } })).toBe("business")
    expect(tierForEntitlement({ kind: "free" })).toBe("free")
  })
})

describe("setupBlocker", () => {
  const plain = { signingOrder: "PARALLEL", recipients: [{ role: "SIGNER" }], hasPayment: false }

  it("lets every tier send a plain parallel document", () => {
    expect(setupBlocker("free", plain)).toBeNull()
  })

  it("names the Business feature a lower tier tried to use", () => {
    expect(setupBlocker("personal", { ...plain, hasPayment: true })).toBe("signAndPay")
    expect(setupBlocker("personal", { ...plain, signingOrder: "SEQUENTIAL" })).toBe("sequentialSigning")
    expect(setupBlocker("free", { ...plain, recipients: [{ role: "APPROVER" }] })).toBe("approvers")
  })

  it("allows all of it on Business", () => {
    expect(
      setupBlocker("business", { signingOrder: "SEQUENTIAL", recipients: [{ role: "APPROVER" }], hasPayment: true })
    ).toBeNull()
  })
})

describe("documentsLeft", () => {
  it("is unlimited from Personal up", () => {
    expect(documentsLeft("personal", 500)).toBeNull()
    expect(documentsLeft("business", 0)).toBeNull()
  })

  it("counts down the free allowance and stops at zero", () => {
    expect(documentsLeft("free", 0)).toBe(FREE_DOCUMENTS_PER_MONTH)
    expect(documentsLeft("free", FREE_DOCUMENTS_PER_MONTH - 1)).toBe(1)
    expect(documentsLeft("free", FREE_DOCUMENTS_PER_MONTH + 4)).toBe(0)
  })
})

describe("requestToolUsesLeft", () => {
  it("gives a free account one use of the request tool, then none", () => {
    expect(FREE_REQUEST_TOOL_USES).toBe(1)
    expect(requestToolUsesLeft("free", 0)).toBe(1)
    expect(requestToolUsesLeft("free", 1)).toBe(0)
    // Tool sends made while on a paid plan still count once it ends.
    expect(requestToolUsesLeft("free", 12)).toBe(0)
  })

  it("is unlimited from Personal up", () => {
    expect(requestToolUsesLeft("personal", 50)).toBeNull()
    expect(requestToolUsesLeft("business", 0)).toBeNull()
  })

  it("has its own upgrade error code", () => {
    expect(planErrorCode("requestTool")).toBe("plan_requestTool")
  })
})

describe("monthStartUtc", () => {
  it("is midnight UTC on the first of the month", () => {
    expect(monthStartUtc(new Date("2026-10-31T23:59:59Z")).toISOString()).toBe("2026-10-01T00:00:00.000Z")
  })
})

describe("planErrorCode", () => {
  it("prefixes the feature, matching the keys in esign.errors", () => {
    expect(planErrorCode("signAndPay")).toBe("plan_signAndPay")
  })
})
