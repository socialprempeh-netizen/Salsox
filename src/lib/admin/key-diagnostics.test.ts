/**
 * Tests for key-diagnostics.ts: each way a pasted service account key can go
 * wrong is named, and nothing of the value itself comes back.
 */
import { describe, expect, it } from "vitest"
import { diagnoseServiceAccountKey } from "./key-diagnostics"

const KEY = { type: "service_account", client_email: "bot@project.iam.gserviceaccount.com", private_key: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n" }
const b64 = (value: string) => Buffer.from(value).toString("base64")
const good = b64(JSON.stringify(KEY))

describe("diagnoseServiceAccountKey", () => {
  it("reports a missing value", () => {
    expect(diagnoseServiceAccountKey(undefined)).toMatchObject({ present: false, length: 0, validBase64: false, decodesToJson: false })
    expect(diagnoseServiceAccountKey("  ").present).toBe(false)
  })

  it("passes a good key on every check", () => {
    expect(diagnoseServiceAccountKey(good)).toEqual({
      present: true,
      length: good.length,
      trimmedLength: good.length,
      quoted: false,
      innerWhitespace: false,
      validBase64: true,
      looksLikeRawJson: false,
      decodesToJson: true,
      doubleEncoded: false,
      hasPrivateKey: true,
      privateKeyIsPem: true,
      hasClientEmail: true,
      isServiceAccount: true,
    })
  })

  it("spots a truncated paste", () => {
    const cut = diagnoseServiceAccountKey(good.slice(0, good.length - 40))
    expect(cut.decodesToJson).toBe(false)
    expect(cut.trimmedLength).toBe(good.length - 40)
  })

  it("spots quotes, line breaks, raw JSON and double encoding", () => {
    expect(diagnoseServiceAccountKey(`"${good}"`)).toMatchObject({ quoted: true, validBase64: false })
    expect(diagnoseServiceAccountKey(`${good.slice(0, 76)}\n${good.slice(76)}`)).toMatchObject({ innerWhitespace: true, validBase64: false })
    expect(diagnoseServiceAccountKey(JSON.stringify(KEY))).toMatchObject({ looksLikeRawJson: true, decodesToJson: false })
    expect(diagnoseServiceAccountKey(b64(good))).toMatchObject({ validBase64: true, doubleEncoded: true, decodesToJson: false })
  })

  it("spots JSON that is not a service account key", () => {
    expect(diagnoseServiceAccountKey(b64(JSON.stringify({ hello: "world" })))).toMatchObject({ decodesToJson: true, hasPrivateKey: false, hasClientEmail: false, isServiceAccount: false })
  })

  it("never returns any part of the value", () => {
    const report = JSON.stringify(diagnoseServiceAccountKey(good))
    for (const secret of ["PRIVATE KEY", "abc", "bot@", good.slice(0, 12)]) expect(report).not.toContain(secret)
  })
})
