/**
 * What "Send Document From Template" needs to know about templates, read
 * from GET /api/v1/templates: the dropdown's choices, the fields a chosen
 * template asks for (an email and a name for each role that is not the
 * sender, then one field per blank), and the request body built from what
 * the person filled in. Pure apart from the one request, so tested without
 * HTTP.
 *
 * A saved template is a customised copy of a library template, so its roles
 * and blanks are those of the library template it came from.
 */

/** Dropdown choices: saved templates first, then the library. */
function templateChoices(body) {
  const saved = (body && Array.isArray(body.saved) ? body.saved : []).map((s) => ({ id: `saved:${s.id}`, name: `${s.name} (saved template)` }))
  const library = (body && Array.isArray(body.data) ? body.data : []).map((t) => ({ id: `library:${t.slug}`, name: t.title }))
  return [...saved, ...library]
}

/** How many choices the dropdown shows before "Load more". */
const PAGE_SIZE = 100

/** One page of the choices; `page` is Zapier's bundle.meta.page, counted from 0. */
function pageOf(choices, page) {
  const n = Number.isInteger(page) && page > 0 ? page : 0
  return choices.slice(n * PAGE_SIZE, (n + 1) * PAGE_SIZE)
}

/** "saved:abc" or "library:slug", as the dropdown stores it. */
function parseChoice(value) {
  const match = /^(saved|library):(.+)$/.exec(String(value || "").trim())
  return match ? { kind: match[1], id: match[2] } : null
}

/** The library template behind a choice, from the API's answer. */
function templateFor(choice, body) {
  if (!choice || !body) return null
  const library = Array.isArray(body.data) ? body.data : []
  if (choice.kind === "library") return library.find((t) => t.slug === choice.id) || null
  const saved = (Array.isArray(body.saved) ? body.saved : []).find((s) => s.id === choice.id)
  return saved ? library.find((t) => t.slug === saved.template) || null : null
}

/**
 * Field keys: plain snake_case, because template blanks have spaces and
 * punctuation in their names ("Client legal name") and Zapier treats keys as
 * identifiers. The label keeps the blank's own name.
 */
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")
const roleKey = (id, part) => `role_${slug(id)}_${part}`
const valueKey = (name) => `value_${slug(name)}`

/** The fields a template asks for, in the order people fill them: who signs, then the blanks. */
function templateFields(template) {
  if (!template) return []
  const roles = (template.roles || []).filter((r) => !r.sender)
  const people = roles.flatMap((r) => [
    { key: roleKey(r.id, "email"), label: `${r.label} email`, type: "string", required: true, helpText: `Who signs as ${r.label}.` },
    { key: roleKey(r.id, "name"), label: `${r.label} name`, type: "string", required: false },
  ])
  const blanks = (template.variables || []).map((v) => ({ key: valueKey(v), label: v, type: "string", required: false }))
  return [...people, ...blanks]
}

/** A field's value as trimmed text, whatever type it arrived as. */
const text = (value) => (value === undefined || value === null ? "" : String(value).trim())

/** The POST /api/v1/documents body for a template send. */
function templateBody(inputData, template) {
  const choice = parseChoice(inputData.template)
  const roles = template ? (template.roles || []).filter((r) => !r.sender) : []
  const recipients = roles
    .map((r) => ({ email: text(inputData[roleKey(r.id, "email")]), name: text(inputData[roleKey(r.id, "name")]) || undefined, template_role: r.id }))
    .filter((r) => r.email)
  const values = {}
  for (const v of template ? template.variables || [] : []) {
    const value = inputData[valueKey(v)]
    if (text(value) !== "") values[v] = String(value)
  }
  return {
    ...(choice && choice.kind === "saved" ? { saved_template_id: choice.id } : {}),
    ...(choice && choice.kind === "library" ? { template: choice.id } : {}),
    values,
    recipients,
    ...(inputData.title ? { title: inputData.title } : {}),
    ...(inputData.message ? { message: inputData.message } : {}),
    ...(inputData.expires_in_days ? { expires_in_days: Number(inputData.expires_in_days) } : {}),
  }
}

module.exports = { PAGE_SIZE, pageOf, templateChoices, parseChoice, templateFor, templateFields, templateBody, roleKey, valueKey }
