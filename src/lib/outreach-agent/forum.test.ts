import { describe, expect, it } from "vitest"
import { forumCandidates, type ForumItem } from "./forum"

const item = (over: Partial<ForumItem>): ForumItem => ({ kind: "comment", id: "t1_x", title: "Contract tools?", text: "", author: "a", url: "u", createdAt: new Date(1_000), ...over })
const ids = (picked: ReturnType<typeof forumCandidates>) => picked.map(({ item, competitor }) => `${item.id}:${competitor.id}`)

describe("forumCandidates", () => {
  it("keeps posts naming one tool, and comments with a pain point naming one", () => {
    const items = [
      item({ kind: "post", id: "p1", title: "Leaving PandaDoc", text: "", createdAt: new Date(3_000) }),
      item({ id: "t1_a", text: "Dropbox Sign raised our pricing again", createdAt: new Date(2_000) }),
      item({ id: "t1_b", text: "We love DocuSign" }),
      item({ id: "t1_c", text: "their pricing is absurd", title: "Anyone else leaving DocuSign?" }),
      item({ id: "t1_d", text: "Adobe Sign cancelled on us" }),
    ]
    expect(ids(forumCandidates(items, { max: 10 }))).toEqual(["p1:pandadoc", "t1_a:dropbox-sign", "t1_c:docusign"])
  })

  it("asks posts for a pain point too, when told to", () => {
    const items = [item({ kind: "post", id: "launch", title: "Show HN: a DocuSign integration" }), item({ kind: "post", id: "ask", title: "Ask HN: DocuSign alternative that is not expensive?" })]
    expect(ids(forumCandidates(items, { max: 10, pain: "all" }))).toEqual(["ask:docusign"])
  })

  it("skips what is known and keeps the newest", () => {
    const items = [item({ id: "t1_old", text: "DocuSign pricing", createdAt: new Date(1) }), item({ id: "t1_new", text: "DocuSign pricing", createdAt: new Date(2) }), item({ id: "t1_seen", text: "DocuSign pricing", createdAt: new Date(3) })]
    expect(forumCandidates(items, { max: 1, known: (_, i) => i.id === "t1_seen" }).map(({ item }) => item.id)).toEqual(["t1_new"])
  })
})
