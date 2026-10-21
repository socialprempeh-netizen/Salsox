import { describe, expect, it } from "vitest"
import { isAllowed } from "./robots"

const AGENT = "SalsoxOutreachBot/1.0"

describe("isAllowed", () => {
  it("allows everything when the file is empty or has no matching group", () => {
    expect(isAllowed("", AGENT, "/anything")).toBe(true)
    expect(isAllowed("User-agent: Googlebot\nDisallow: /", AGENT, "/x")).toBe(true)
  })

  it("applies the * group", () => {
    const txt = "User-agent: *\nDisallow: /private\n"
    expect(isAllowed(txt, AGENT, "/private/page")).toBe(false)
    expect(isAllowed(txt, AGENT, "/public")).toBe(true)
  })

  it("prefers a group naming our agent over *", () => {
    const txt = "User-agent: *\nDisallow: /\n\nUser-agent: SalsoxOutreachBot\nAllow: /\n"
    expect(isAllowed(txt, AGENT, "/review/x")).toBe(true)
  })

  it("lets the longest match win, Allow on a tie", () => {
    const txt = "User-agent: *\nDisallow: /review\nAllow: /review/public\n"
    expect(isAllowed(txt, AGENT, "/review/public/1")).toBe(true)
    expect(isAllowed(txt, AGENT, "/review/other")).toBe(false)
    expect(isAllowed("User-agent: *\nDisallow: /a\nAllow: /a\n", AGENT, "/a")).toBe(true)
  })

  it("supports * wildcards and the $ anchor", () => {
    const txt = "User-agent: *\nDisallow: /*?stars=\nDisallow: /*.pdf$\n"
    expect(isAllowed(txt, AGENT, "/review/x?stars=1")).toBe(false)
    expect(isAllowed(txt, AGENT, "/file.pdf")).toBe(false)
    expect(isAllowed(txt, AGENT, "/file.pdf?x=1")).toBe(true)
  })

  it("treats an empty Disallow as allowing everything", () => {
    expect(isAllowed("User-agent: *\nDisallow:\n", AGENT, "/x")).toBe(true)
  })

  it("matches our product token whole, not as a substring", () => {
    const txt = "User-agent: a\nDisallow: /\n"
    expect(isAllowed(txt, AGENT, "/x")).toBe(true)
  })

  it("groups consecutive user-agent lines and ignores comments", () => {
    const txt = "# hi\nUser-agent: a\nUser-agent: *\nDisallow: /x # no\n"
    expect(isAllowed(txt, AGENT, "/x/y")).toBe(false)
  })
})
