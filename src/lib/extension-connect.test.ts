/**
 * Tests for the extension connect rules (extension-connect.ts): only a
 * chromiumapp.org address of a listed extension may receive a key, any id
 * only in development, and the result travels in the fragment.
 */
import { describe, expect, it } from "vitest"
import { allowedExtensionIds, checkConnectRedirect, connectResult, extensionIdFromRedirect } from "./extension-connect"

const ID = "abcdefghijklmnopabcdefghijklmnop"
const OTHER = "ponmlkjihgfedcbaponmlkjihgfedcba"
const redirect = `https://${ID}.chromiumapp.org/connected`

describe("extensionIdFromRedirect", () => {
  it("reads the id from a launchWebAuthFlow address", () => {
    expect(extensionIdFromRedirect(redirect)).toBe(ID)
    expect(extensionIdFromRedirect(`https://${ID}.chromiumapp.org/`)).toBe(ID)
  })

  it("refuses anything that Chrome would not hand to an extension", () => {
    expect(extensionIdFromRedirect(`http://${ID}.chromiumapp.org/`)).toBeNull()
    expect(extensionIdFromRedirect(`https://${ID}.chromiumapp.org.evil.com/`)).toBeNull()
    expect(extensionIdFromRedirect(`https://evil.com/${ID}.chromiumapp.org/`)).toBeNull()
    expect(extensionIdFromRedirect(`https://x.${ID}.chromiumapp.org/`)).toBeNull()
    expect(extensionIdFromRedirect(`https://user@${ID}.chromiumapp.org/`)).toBeNull()
    expect(extensionIdFromRedirect(`https://${ID}.chromiumapp.org/?a=1`)).toBeNull()
    expect(extensionIdFromRedirect(`https://${ID}.chromiumapp.org/#a`)).toBeNull()
    expect(extensionIdFromRedirect("https://abcdefghijklmnopqrstuvwxyzabcdef.chromiumapp.org/")).toBeNull()
    expect(extensionIdFromRedirect(42)).toBeNull()
    expect(extensionIdFromRedirect("not a url")).toBeNull()
  })
})

describe("checkConnectRedirect", () => {
  it("lets a listed extension connect, and no other outside development", () => {
    const allowed = allowedExtensionIds(`${ID}, nonsense`)
    expect(allowed).toEqual([ID])
    expect(checkConnectRedirect(redirect, allowed, false)).toBe(redirect)
    expect(checkConnectRedirect(`https://${OTHER}.chromiumapp.org/connected`, allowed, false)).toBeNull()
    expect(checkConnectRedirect(redirect, [], false)).toBeNull()
  })

  it("accepts any extension in development, but still only a chromiumapp.org address", () => {
    expect(checkConnectRedirect(`https://${OTHER}.chromiumapp.org/connected`, [], true)).not.toBeNull()
    expect(checkConnectRedirect("https://evil.com/connected", [], true)).toBeNull()
  })
})

describe("connectResult", () => {
  it("puts the key or the error in the fragment, never the query", () => {
    expect(connectResult(redirect, { key: "ak_abc" })).toBe(`${redirect}#key=ak_abc`)
    expect(connectResult(redirect, { error: "signed_out" })).toBe(`${redirect}#error=signed_out`)
  })
})
