import { describe, expect, it } from "vitest"
import { buildRequest, platformConfigured, postProblem, readPostId } from "./social"

const env = { META_PAGE_ID: "123", META_PAGE_ACCESS_TOKEN: "page-tok", LINKEDIN_ORGANIZATION_ID: "456", LINKEDIN_ACCESS_TOKEN: "li-tok", X_ACCESS_TOKEN: "x-tok" }

describe("platformConfigured", () => {
  it("needs each platform's own credentials", () => {
    expect(platformConfigured("FACEBOOK", { META_PAGE_ID: "1" })).toBe(false)
    expect(platformConfigured("LINKEDIN", env)).toBe(true)
    expect(platformConfigured("X", {})).toBe(false)
  })
})

describe("postProblem", () => {
  it("rejects empty and over-long posts", () => {
    expect(postProblem("X", "  ")).toBe("empty")
    expect(postProblem("X", "a".repeat(281))).toBe("tooLong")
    expect(postProblem("X", "a".repeat(280))).toBeNull()
    expect(postProblem("LINKEDIN", "a".repeat(281))).toBeNull()
  })
})

describe("buildRequest", () => {
  it("posts to the Facebook Page feed with the Page token in the body", () => {
    const { url, init } = buildRequest("FACEBOOK", " Hello ", env)
    expect(url).toBe("https://graph.facebook.com/v23.0/123/feed")
    expect(new URLSearchParams(init.body as string).get("message")).toBe("Hello")
    expect(new URLSearchParams(init.body as string).get("access_token")).toBe("page-tok")
  })

  it("posts to LinkedIn as the organization with the versioned headers", () => {
    const { url, init } = buildRequest("LINKEDIN", "Hello", { ...env, LINKEDIN_API_VERSION: "202601" })
    expect(url).toBe("https://api.linkedin.com/rest/posts")
    const headers = init.headers as Record<string, string>
    expect(headers["linkedin-version"]).toBe("202601")
    expect(headers.authorization).toBe("Bearer li-tok")
    expect(JSON.parse(init.body as string)).toMatchObject({ author: "urn:li:organization:456", commentary: "Hello", lifecycleState: "PUBLISHED" })
  })

  it("posts a tweet with the user token", () => {
    const { url, init } = buildRequest("X", "Hello", env)
    expect(url).toBe("https://api.x.com/2/tweets")
    expect(JSON.parse(init.body as string)).toEqual({ text: "Hello" })
  })
})

describe("readPostId", () => {
  it("reads each platform's id from its answer", async () => {
    expect(await readPostId("X", new Response(JSON.stringify({ data: { id: "9" } })))).toBe("9")
    expect(await readPostId("FACEBOOK", new Response(JSON.stringify({ id: "123_9" })))).toBe("123_9")
    expect(await readPostId("LINKEDIN", new Response(null, { headers: { "x-restli-id": "urn:li:share:9" } }))).toBe("urn:li:share:9")
  })
})

describe("the manual platforms (Reddit, TikTok, YouTube)", () => {
  it("are never auto-published and have no API connection", async () => {
    const { isAutoPlatform, MANUAL_PLATFORMS, PLATFORMS, publish } = await import("./social")
    for (const p of MANUAL_PLATFORMS) {
      expect(isAutoPlatform(p)).toBe(false)
      expect(platformConfigured(p, env)).toBe(false)
      await expect(publish(p, "A post.", env)).rejects.toThrow(/posted by hand/)
    }
    expect(PLATFORMS).toEqual(["LINKEDIN", "X", "FACEBOOK"])
  })

  it("need a title (and TikTok and YouTube a description) within limits", async () => {
    const { draftProblems } = await import("./social")
    expect(draftProblems("REDDIT", { body: "A useful finding.", title: "A question?" })).toEqual([])
    expect(draftProblems("REDDIT", { body: "A useful finding.", title: "" })).toEqual([{ field: "title", problem: "empty" }])
    expect(draftProblems("YOUTUBE", { body: "Caption", title: "t".repeat(101), description: "" })).toEqual([
      { field: "title", problem: "tooLong" },
      { field: "description", problem: "empty" },
    ])
    expect(draftProblems("TIKTOK", { body: "Hook", title: "Title", description: "What the video shows." })).toEqual([])
    // X, LinkedIn and Facebook are still the body alone.
    expect(draftProblems("X", { body: "a".repeat(281) })).toEqual([{ field: "body", problem: "tooLong" }])
  })

  it("open reddit.com's own submit page pre-filled, cutting a very long body", async () => {
    const { redditSubmitUrl, REDDIT_URL_BODY_MAX } = await import("./social")
    const url = new URL(redditSubmitUrl({ title: " How do you collect signatures? ", body: "We tried three ways & one stuck." }))
    expect(url.origin + url.pathname).toBe("https://www.reddit.com/submit")
    expect(url.searchParams.get("type")).toBe("TEXT")
    expect(url.searchParams.get("title")).toBe("How do you collect signatures?")
    expect(url.searchParams.get("text")).toBe("We tried three ways & one stuck.")
    const long = new URL(redditSubmitUrl({ title: "T", body: "x".repeat(REDDIT_URL_BODY_MAX + 50) }))
    expect(long.searchParams.get("text")).toHaveLength(REDDIT_URL_BODY_MAX)
  })
})
