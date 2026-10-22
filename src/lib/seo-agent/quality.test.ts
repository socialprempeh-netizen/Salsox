import { describe, expect, it } from "vitest"
import { closestPage, DUPLICATE_THRESHOLD, duplicateGate, failures, introGate, introSimilarity, linksGate, maskSubject, requiredFieldProblems, requiredGate, siblingRing, verdict, type Gate } from "./quality"

const boldsign = "BoldSign suits teams that send from their own software: its API plans are priced per document, and its web app adds templates and bulk send. If you mostly need clients to sign and pay on a phone, the trade-offs are different, and this page sets them out plan by plan."
const swapped = boldsign.replaceAll("BoldSign", "Yousign")

describe("maskSubject", () => {
  it("replaces each subject term, longest first, ignoring case", () => {
    expect(maskSubject("Zoho Sign and zoho sign, not Zoho", ["Zoho", "Zoho Sign"])).toBe(" subject  and  subject , not  subject ")
  })
})

describe("introGate", () => {
  it("catches an intro that is a sibling's with the name swapped", () => {
    expect(introSimilarity({ text: swapped, terms: ["Yousign"] }, { text: boldsign, terms: ["BoldSign"] })).toBe(1)
    const { gate, closest } = introGate({ path: "/vs/yousign", text: swapped, terms: ["Yousign"] }, [{ path: "/vs/boldsign", text: boldsign, terms: ["BoldSign"] }])
    expect(gate.ok).toBe(false)
    expect(closest).toBe("/vs/boldsign")
    expect(gate.detail).toMatch(/variable swap/)
  })

  it("passes an intro of its own", () => {
    const own = "Yousign is built around the EU's eIDAS levels, so its plans are worth a look if you need an advanced or qualified signature in Europe. For simple signatures with payment collection and mobile money, the comparison turns on different things."
    const { gate } = introGate({ path: "/vs/yousign", text: own, terms: ["Yousign"] }, [{ path: "/vs/boldsign", text: boldsign, terms: ["BoldSign"] }])
    expect(gate).toMatchObject({ id: "intro", ok: true })
  })

  it("rejects a generic opener, a missing subject and a too-short intro", () => {
    expect(introGate({ path: "/x", text: "In today's world, signing matters. ".repeat(10), terms: ["Yousign"] }, []).gate.detail).toMatch(/generic phrase/)
    expect(introGate({ path: "/x", text: boldsign, terms: ["Yousign"] }, []).gate.detail).toMatch(/never names/)
    expect(introGate({ path: "/x", text: "Yousign is fine.", terms: ["Yousign"] }, []).gate.detail).toMatch(/at least/)
  })
})

describe("duplicateGate", () => {
  const body = "Section one explains how a deposit secures the date. ".repeat(4) + "Then the planner manages the budget and the vendor contracts on the client's behalf, with receipts for every payment."
  it("flags a near-copy of an existing page and names it", () => {
    const { gate, closest, score } = duplicateGate(body, [{ path: "/templates/a", text: body }, { path: "/templates/b", text: "Something else entirely about leases and keys and deposits." }], DUPLICATE_THRESHOLD.template)
    expect(score).toBe(1)
    expect(closest).toBe("/templates/a")
    expect(gate.ok).toBe(false)
    expect(gate.detail).toMatch(/noindexed/)
  })

  it("passes distinct text", () => {
    expect(duplicateGate(body, [{ path: "/b", text: "A lease for a flat with a deposit and a monthly rent paid by transfer." }], DUPLICATE_THRESHOLD.page).gate.ok).toBe(true)
    expect(closestPage(body, [])).toEqual({ score: 0, path: null })
  })
})

describe("requiredFieldProblems", () => {
  it("finds blank fields, placeholders and empty lists by path", () => {
    expect(requiredFieldProblems({ title: "  ", faq: [{ q: "Is it valid?", a: "TBD" }], related: [] })).toEqual(["title is empty", "faq.0.a contains placeholder text", "related is empty"])
  })

  it("finds a heading with nothing under it, but not one with sub-sections", () => {
    expect(requiredFieldProblems({ body: "## One\n\nText.\n\n## Two\n\n## Three\n\nMore." })).toEqual(['body has an empty section "Two"'])
    expect(requiredFieldProblems({ body: "## Parts\n\n### A\n\nText." })).toEqual([])
  })

  it("passes a complete draft", () => {
    expect(requiredGate({ title: "A title", faq: [{ q: "Question?", a: "An answer." }] })).toMatchObject({ ok: true })
  })
})

describe("linksGate", () => {
  const known = new Set(["/compare", "/vs/a", "/vs/b", "/pricing"])
  it("needs three real related pages including a sibling", () => {
    expect(linksGate(["/vs/a", "/pricing", "/compare"], { known, siblings: new Set(["/vs/a", "/vs/b"]), self: "/vs/c" }).ok).toBe(true)
    const noSibling = linksGate(["/pricing", "/compare", "/nowhere"], { known, siblings: new Set(["/vs/a"]), self: "/vs/c" })
    expect(noSibling.ok).toBe(false)
    expect(noSibling.detail).toMatch(/do not exist: \/nowhere/)
    expect(noSibling.detail).toMatch(/needs 3/)
    expect(noSibling.detail).toMatch(/no page in its own hub/)
  })
})

describe("siblingRing", () => {
  it("takes the nearest neighbours on both sides, wrapping round", () => {
    expect(siblingRing(["a", "b", "c", "d", "e", "f"], 0, 4)).toEqual(["b", "f", "c", "e"])
    expect(siblingRing(["a", "b", "c"], 1, 4)).toEqual(["c", "a"])
    expect(siblingRing(["a"], 0)).toEqual([])
    expect(siblingRing(["a", "b"], -1)).toEqual([])
  })

  it("gives every page in a hub incoming links", () => {
    const items = Array.from({ length: 9 }, (_, i) => `p${i}`)
    const incoming = new Map(items.map((p) => [p, 0]))
    items.forEach((_, i) => siblingRing(items, i, 4).forEach((p) => incoming.set(p, incoming.get(p)! + 1)))
    expect([...incoming.values()].every((n) => n >= 2)).toBe(true)
  })
})

describe("verdict", () => {
  const gate = (id: Gate["id"], ok: boolean): Gate => ({ id, ok, detail: ok ? "fine" : `${id} broke` })
  it("fails on any generating gate, flags on the duplicate gate alone, passes otherwise", () => {
    expect(verdict([gate("required", false), gate("duplicate", false)])).toBe("fail")
    expect(verdict([gate("required", true), gate("intro", true), gate("duplicate", false)])).toBe("flag")
    expect(verdict([gate("required", true), gate("duplicate", true)])).toBe("pass")
    expect(failures([gate("intro", false), gate("duplicate", false)])).toEqual(["intro: intro broke"])
  })
})
