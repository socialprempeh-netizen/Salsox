/**
 * Account problems in social publishing: refusals that are about the
 * platform account (no X API credit, LinkedIn's missing company-page
 * permission) rather than the post, how they are said, which platforms they
 * mark as failing, and LinkedIn's person-author fallback (LINKEDIN_AUTHOR).
 */
import { describe, expect, it } from "vitest"
import { ACCOUNT_PROBLEMS, accountProblem, buildRequest, failingPlatforms, isAccountProblem, linkedinAuthorMode, linkedinAuthorUrn, platformConfigured } from "./social"

const orgRefusal = ": Organization Id (Events permissions) must be used when using organization as author"

describe("accountProblem", () => {
  it("says an empty X credit balance plainly", () => {
    expect(accountProblem("X", 403, ": credits depleted")).toBe("X API credit is empty, add credit in the X Developer Console.")
    expect(accountProblem("X", 402, ": Credits Depleted")).toBe(ACCOUNT_PROBLEMS.xCredits)
  })

  it("names LinkedIn's missing company-page permission and the fallback", () => {
    const message = accountProblem("LINKEDIN", 403, orgRefusal)!
    expect(message).toMatch(/w_organization_social/)
    expect(message).toMatch(/Community Management API/)
    expect(message).toMatch(/LINKEDIN_AUTHOR=person/)
    expect(accountProblem("LINKEDIN", 401, "")).toBe(ACCOUNT_PROBLEMS.linkedinToken)
  })

  it("leaves refusals about the post itself alone", () => {
    expect(accountProblem("X", 403, ": You are not allowed to create a Tweet with duplicate content.")).toBeNull()
    expect(accountProblem("FACEBOOK", 400, ": (#100) Invalid parameter")).toBeNull()
  })
})

describe("failingPlatforms", () => {
  const xDown = { platform: "X" as const, error: ACCOUNT_PROBLEMS.xCredits, published: false }
  const liDown = { platform: "LINKEDIN" as const, error: ACCOUNT_PROBLEMS.linkedinOrganization, published: false }
  const fbOk = { platform: "FACEBOOK" as const, error: null, published: true }

  it("marks a platform failing when its last attempt was an account problem", () => {
    expect([...failingPlatforms([xDown, liDown, fbOk], {}).keys()]).toEqual(["X", "LINKEDIN"])
  })

  it("lets a platform back in once a post gets through, or for a post-level failure", () => {
    expect(failingPlatforms([{ ...xDown, published: true }, { platform: "LINKEDIN", error: "LINKEDIN refused the post (HTTP 422)", published: false }], {}).size).toBe(0)
  })

  it("stops counting LinkedIn's company-page refusal once posts go out as a person", () => {
    expect(failingPlatforms([liDown], { LINKEDIN_AUTHOR: "person" }).has("LINKEDIN")).toBe(false)
  })

  it("recognises its own messages in a stored error", () => {
    expect(isAccountProblem(ACCOUNT_PROBLEMS.xCredits)).toBe(true)
    expect(isAccountProblem("Publishing failed: timeout")).toBe(false)
    expect(isAccountProblem(null)).toBe(false)
  })
})

describe("LinkedIn author", () => {
  const org = { LINKEDIN_ACCESS_TOKEN: "tok", LINKEDIN_ORGANIZATION_ID: "123456789" }

  it("posts as the organization by default, with its numeric URN", () => {
    expect(linkedinAuthorMode(org)).toBe("organization")
    expect(linkedinAuthorUrn(org)).toBe("urn:li:organization:123456789")
    const body = JSON.parse(String(buildRequest("LINKEDIN", "Hello", org).init.body))
    expect(body.author).toBe("urn:li:organization:123456789")
  })

  it("posts as the person with LINKEDIN_AUTHOR=person", () => {
    const person = { ...org, LINKEDIN_AUTHOR: "person", LINKEDIN_PERSON_ID: "AbC123" }
    expect(linkedinAuthorUrn(person)).toBe("urn:li:person:AbC123")
    expect(JSON.parse(String(buildRequest("LINKEDIN", "Hello", person).init.body)).author).toBe("urn:li:person:AbC123")
  })

  it("counts as connected as a person with only a token, the id being looked up at publish", () => {
    expect(platformConfigured("LINKEDIN", { LINKEDIN_ACCESS_TOKEN: "tok", LINKEDIN_AUTHOR: "person" })).toBe(true)
    expect(linkedinAuthorUrn({ LINKEDIN_AUTHOR: "person" })).toBeNull()
    expect(platformConfigured("LINKEDIN", { LINKEDIN_ACCESS_TOKEN: "tok" })).toBe(false)
  })
})
