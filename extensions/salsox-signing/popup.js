/**
 * Salsox Signing popup: shows one step at a time from what is in
 * chrome.storage.local, and saves every change there, so the popup can close
 * (it does, the moment it loses focus) without losing work.
 *
 *   connect     no key yet: Connect opens the Salsox window (background.js)
 *   upload      choose a PDF; the plan's allowance is shown, and an upgrade
 *               offered when no free documents are left
 *   place       the PDF rendered with pdf.js (bundled), fields placed with a
 *               click and moved by dragging, one colour per signer
 *   recipients  an email for each signer, title, message, signing order and
 *               Sign & Pay (both upgrade prompts on plans without them)
 *   result      sending, sent, or why not (a plan refusal is an upgrade)
 *
 * The rules (placement, validation, the request, when to upgrade) are pure
 * functions in lib/fields.js. The network is only touched by background.js.
 */
import * as pdfjs from "./vendor/pdfjs/pdf.min.mjs"
import { SERVER, UTM } from "./config.js"
import {
  MAX_PDF_BYTES,
  MAX_SIGNERS,
  SIGNER_COLORS,
  allowanceText,
  draftProblems,
  moveField,
  placeField,
  removeSigner,
  titleFromFileName,
  upgradeBeforeSend,
  upgradeFromError,
} from "./lib/fields.js"

pdfjs.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("vendor/pdfjs/pdf.worker.min.mjs")

const $ = (id) => document.getElementById(id)
const TYPE_NAMES = { SIGNATURE: "Signature", DATE: "Date", TEXT: "Text" }
const SECTIONS = ["connect", "upload", "place", "recipients", "result"]

let state = { auth: null, account: null, draft: null, job: null, notice: null }
let pdfDoc = null
let pdfDocFor = null
let selectedId = null
let activeType = "SIGNATURE"

// ─── Storage ──────────────────────────────────────────────────────────────────

let saveTimer = null
function saveDraft(now = false) {
  clearTimeout(saveTimer)
  const write = () => chrome.storage.local.set({ draft: state.draft })
  if (now) return write()
  saveTimer = setTimeout(write, 250)
}

function updateDraft(patch, { now = false } = {}) {
  state.draft = { ...state.draft, ...patch }
  saveDraft(now)
}

const send = (type) => chrome.runtime.sendMessage({ type })
const openTab = (path) => chrome.tabs.create({ url: `${SERVER}${path}${path.includes("?") ? "&" : "?"}${UTM}` })

// ─── Rendering the current step ─────────────────────────────────────────────────

function stepNow() {
  if (!state.auth?.key) return "connect"
  if (state.job && state.job.phase) return "result"
  if (state.draft?.pdf) return state.draft.step === "recipients" ? "recipients" : "place"
  return "upload"
}

function show(step) {
  for (const id of SECTIONS) $(id).hidden = id !== step
  const wide = step === "place" || step === "recipients"
  document.body.classList.toggle("wide", wide)
  document.body.classList.toggle("narrow", !wide)
  $("disconnect").hidden = !state.auth?.key
  $("who").textContent = state.account?.email ?? "Send a PDF for signature"
}

const NOTICES = {
  signed_out: ["Sign in to Salsox in the tab that just opened, then press Connect again.", false],
  setup_required: ["Your organisation requires two-step verification. Set it up in the tab that just opened, then press Connect again.", true],
  cancelled: ["Connection cancelled. Nothing was shared.", false],
  closed: ["The Salsox window closed before you connected.", false],
  limit: ["Your account has the most API keys it can have. Revoke one under Developers on salsox.com, then connect again.", true],
  failed: ["Couldn't connect. Check your internet connection and try again.", true],
  expired: ["You were disconnected. Connect again to keep sending.", false],
}

function renderNotice() {
  const notice = state.notice && NOTICES[state.notice.kind]
  $("notice").hidden = !notice
  if (notice) {
    $("notice").textContent = notice[0]
    $("notice").classList.toggle("bad", notice[1])
  }
}

async function render() {
  const step = stepNow()
  show(step)
  renderNotice()
  if (step === "upload") renderUpload()
  if (step === "place") await renderPlace()
  if (step === "recipients") renderRecipients()
  if (step === "result") renderResult()
}

// ─── Upgrade prompts ──────────────────────────────────────────────────────────

const UPGRADES = {
  limit: (plan) => ["You've used this month's free documents", `The Free plan sends ${plan?.documents_per_month ?? 3} documents a month. Upgrade to Personal for unlimited documents.`],
  sequential: () => ["Signing in order is a Business feature", "Upgrade to Business to have signers sign one after another."],
  payment: () => ["Sign & Pay is a Business feature", "Upgrade to Business to collect a payment as people sign."],
  plan: () => ["This needs a paid plan", "Compare the plans to see what each one includes."],
}

function showUpgrade(container, reason, { dismissable = true } = {}) {
  const [title, body] = UPGRADES[reason](state.account?.plan)
  container.replaceChildren()
  const text = document.createElement("div")
  const h = document.createElement("p")
  h.className = "upgrade-title"
  h.textContent = title
  const p = document.createElement("p")
  p.className = "hint"
  p.textContent = body
  text.append(h, p)
  const actions = document.createElement("div")
  actions.className = "upgrade-actions"
  const go = document.createElement("button")
  go.className = "primary"
  go.type = "button"
  go.textContent = "See plans"
  go.onclick = () => openTab("/pricing")
  actions.append(go)
  if (dismissable) {
    const close = document.createElement("button")
    close.className = "ghost"
    close.type = "button"
    close.textContent = "Not now"
    close.onclick = () => (container.hidden = true)
    actions.append(close)
  }
  container.append(text, actions)
  container.hidden = false
}

// ─── Upload ───────────────────────────────────────────────────────────────────

function renderUpload() {
  const plan = state.account?.plan
  $("allowance").textContent = allowanceText(plan)
  // Out of free documents: say so first, and do not let a document be
  // prepared that cannot be sent this month.
  const out = Boolean(plan && plan.documents_left === 0)
  if (out) showUpgrade($("upload-upgrade"), "limit", { dismissable: false })
  else $("upload-upgrade").hidden = true
  $("file").disabled = out
  $("drop").classList.toggle("disabled", out)
}

function toBase64(bytes) {
  let binary = ""
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}
const fromBase64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))

async function takeFile(file) {
  state.notice = null
  const fail = (text) => {
    $("notice").hidden = false
    $("notice").textContent = text
    $("notice").classList.add("bad")
  }
  if (!file || state.account?.plan?.documents_left === 0) return
  if (file.type !== "application/pdf" && !/\.pdf$/i.test(file.name)) return fail("That file isn't a PDF.")
  if (file.size > MAX_PDF_BYTES) return fail("PDFs can be up to 4 MB.")
  const bytes = new Uint8Array(await file.arrayBuffer())
  let pageCount
  try {
    // A copy: pdf.js takes ownership of the buffer it is given.
    const doc = await pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false }).promise
    pageCount = doc.numPages
    pdfDoc = doc
  } catch (error) {
    return fail(error?.name === "PasswordException" ? "This PDF is password-protected. Remove the password and try again." : "This PDF couldn't be read. Try exporting it again.")
  }
  state.draft = {
    fileName: file.name,
    pdf: toBase64(bytes),
    pageCount,
    page: 1,
    title: titleFromFileName(file.name),
    message: "",
    signers: [{ email: "", name: "" }],
    activeSigner: 0,
    fields: [],
    signingOrder: "PARALLEL",
    step: "place",
  }
  pdfDocFor = state.draft.pdf
  selectedId = null
  await saveDraft(true)
  await render()
}

// ─── Placing fields ───────────────────────────────────────────────────────────

const colorOf = (i) => SIGNER_COLORS[i % SIGNER_COLORS.length]
const signerName = (i) => `Signer ${i + 1}`

async function ensurePdf() {
  if (pdfDoc && pdfDocFor === state.draft.pdf) return pdfDoc
  pdfDoc = await pdfjs.getDocument({ data: fromBase64(state.draft.pdf), isEvalSupported: false }).promise
  pdfDocFor = state.draft.pdf
  return pdfDoc
}

let renderTask = null
async function drawPage() {
  const doc = await ensurePdf()
  const page = await doc.getPage(state.draft.page)
  const viewer = $("viewer")
  const base = page.getViewport({ scale: 1 })
  // Fit the page's width to the viewer, less its padding.
  const width = Math.max(200, viewer.clientWidth - 24)
  const viewport = page.getViewport({ scale: width / base.width })
  const ratio = window.devicePixelRatio || 1
  const canvas = $("canvas")
  canvas.width = Math.floor(viewport.width * ratio)
  canvas.height = Math.floor(viewport.height * ratio)
  canvas.style.width = `${Math.floor(viewport.width)}px`
  canvas.style.height = `${Math.floor(viewport.height)}px`
  renderTask?.cancel()
  renderTask = page.render({ canvas, canvasContext: canvas.getContext("2d"), viewport, transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined })
  await renderTask.promise.catch(() => {})
}

function renderTools() {
  for (const b of document.querySelectorAll(".tool")) b.setAttribute("aria-checked", String(b.dataset.type === activeType))
}

function renderSigners() {
  const box = $("signers")
  box.replaceChildren()
  state.draft.signers.forEach((_, i) => {
    const chip = document.createElement("button")
    chip.type = "button"
    chip.className = "signer-chip"
    chip.style.setProperty("--c", colorOf(i))
    chip.setAttribute("aria-pressed", String(state.draft.activeSigner === i))
    const dot = document.createElement("span")
    dot.className = "dot"
    chip.append(dot, document.createTextNode(signerName(i)))
    chip.onclick = () => {
      updateDraft({ activeSigner: i })
      renderSigners()
    }
    if (state.draft.signers.length > 1) {
      const x = document.createElement("span")
      x.className = "x"
      x.textContent = "×"
      x.title = `Remove ${signerName(i)} and their fields`
      x.setAttribute("role", "button")
      x.onclick = (e) => {
        e.stopPropagation()
        const signers = state.draft.signers.filter((_, j) => j !== i)
        updateDraft({ signers, fields: removeSigner(state.draft.fields, i), activeSigner: Math.min(state.draft.activeSigner, signers.length - 1) })
        selectedId = null
        renderFieldsAndSide()
        renderSigners()
      }
      chip.append(x)
    }
    box.append(chip)
  })
  if (state.draft.signers.length < MAX_SIGNERS) {
    const add = document.createElement("button")
    add.type = "button"
    add.className = "add-signer"
    add.textContent = "+ Add signer"
    add.onclick = () => {
      const signers = [...state.draft.signers, { email: "", name: "" }]
      updateDraft({ signers, activeSigner: signers.length - 1 })
      renderSigners()
      renderFieldsAndSide()
    }
    box.append(add)
  }
}

function renderFields() {
  const layer = $("layer")
  layer.replaceChildren()
  for (const f of state.draft.fields.filter((x) => x.page === state.draft.page)) {
    const el = document.createElement("div")
    el.className = `field${f.id === selectedId ? " selected" : ""}`
    el.dataset.id = f.id
    el.style.setProperty("--c", colorOf(f.signer))
    el.style.left = `${f.x}%`
    el.style.top = `${f.y}%`
    el.style.width = `${f.width}%`
    el.style.height = `${f.height}%`
    el.tabIndex = 0
    el.setAttribute("role", "button")
    el.setAttribute("aria-label", `${TYPE_NAMES[f.type]} for ${signerName(f.signer)}`)
    const n = document.createElement("span")
    n.className = "n"
    n.textContent = String(f.signer + 1)
    const t = document.createElement("span")
    t.className = "t"
    t.textContent = f.type === "TEXT" && f.label ? f.label : TYPE_NAMES[f.type]
    el.append(n, t)
    layer.append(el)
  }
}

function renderSide() {
  const field = state.draft.fields.find((f) => f.id === selectedId)
  $("selected").hidden = !field
  $("howto").hidden = Boolean(field)
  if (field) {
    $("sel-type").textContent = TYPE_NAMES[field.type]
    const select = $("sel-signer")
    select.replaceChildren(...state.draft.signers.map((_, i) => new Option(signerName(i), String(i), false, i === field.signer)))
    $("sel-label-wrap").hidden = field.type !== "TEXT"
    if (field.type === "TEXT" && document.activeElement !== $("sel-label")) $("sel-label").value = field.label ?? ""
  }
  const list = $("summary")
  list.replaceChildren()
  state.draft.signers.forEach((_, i) => {
    const count = state.draft.fields.filter((f) => f.signer === i).length
    const li = document.createElement("li")
    li.style.setProperty("--c", colorOf(i))
    const dot = document.createElement("span")
    dot.className = "dot"
    const text = document.createElement("span")
    text.textContent = count ? `${signerName(i)}: ${count} field${count === 1 ? "" : "s"}` : `${signerName(i)}: no fields yet`
    if (!count) text.className = "missing"
    li.append(dot, text)
    list.append(li)
  })
  const missing = state.draft.signers.findIndex((_, i) => !state.draft.fields.some((f) => f.signer === i))
  $("to-recipients").disabled = missing !== -1
  $("place-hint").textContent = missing === -1 ? "" : `Place at least one field for ${signerName(missing)}.`
}

function renderFieldsAndSide() {
  renderFields()
  renderSide()
}

async function renderPlace() {
  const d = state.draft
  $("page-label").textContent = `Page ${d.page} of ${d.pageCount}`
  $("prev").disabled = d.page <= 1
  $("next").disabled = d.page >= d.pageCount
  renderTools()
  renderSigners()
  renderFieldsAndSide()
  await drawPage()
}

/** Pointer position as page percentages. */
function pagePoint(event) {
  const rect = $("layer").getBoundingClientRect()
  return { x: ((event.clientX - rect.left) / rect.width) * 100, y: ((event.clientY - rect.top) / rect.height) * 100, rect }
}

function setupPlacing() {
  const layer = $("layer")
  let drag = null

  layer.addEventListener("pointerdown", (event) => {
    const el = event.target.closest(".field")
    if (el) {
      const field = state.draft.fields.find((f) => f.id === el.dataset.id)
      if (!field) return
      selectedId = field.id
      const p = pagePoint(event)
      drag = { id: field.id, dx: p.x - field.x, dy: p.y - field.y, el, moved: false }
      el.setPointerCapture(event.pointerId)
      el.classList.add("dragging")
      renderSide()
      for (const other of layer.querySelectorAll(".field")) other.classList.toggle("selected", other === el)
      return
    }
    // An empty spot: a new field there.
    const p = pagePoint(event)
    const field = placeField({ id: crypto.randomUUID(), type: activeType, signer: state.draft.activeSigner, page: state.draft.page, x: p.x, y: p.y })
    selectedId = field.id
    updateDraft({ fields: [...state.draft.fields, field] })
    renderFieldsAndSide()
  })

  layer.addEventListener("pointermove", (event) => {
    if (!drag) return
    const p = pagePoint(event)
    const field = state.draft.fields.find((f) => f.id === drag.id)
    const moved = moveField(field, p.x - drag.dx, p.y - drag.dy)
    drag.moved = true
    drag.el.style.left = `${moved.x}%`
    drag.el.style.top = `${moved.y}%`
    drag.next = moved
  })

  const end = () => {
    if (!drag) return
    drag.el.classList.remove("dragging")
    if (drag.moved && drag.next) updateDraft({ fields: state.draft.fields.map((f) => (f.id === drag.id ? drag.next : f)) })
    drag = null
  }
  layer.addEventListener("pointerup", end)
  layer.addEventListener("pointercancel", end)

  for (const b of document.querySelectorAll(".tool")) {
    b.onclick = () => {
      activeType = b.dataset.type
      renderTools()
    }
  }

  const removeSelected = () => {
    if (!selectedId) return
    updateDraft({ fields: state.draft.fields.filter((f) => f.id !== selectedId) })
    selectedId = null
    renderFieldsAndSide()
  }
  $("sel-delete").onclick = removeSelected
  document.addEventListener("keydown", (event) => {
    const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)
    if (stepNow() === "place" && !typing && (event.key === "Delete" || event.key === "Backspace")) {
      event.preventDefault()
      removeSelected()
    }
  })
  $("sel-signer").onchange = (event) => {
    const signer = Number(event.target.value)
    updateDraft({ fields: state.draft.fields.map((f) => (f.id === selectedId ? { ...f, signer } : f)) })
    renderFieldsAndSide()
  }
  $("sel-label").oninput = (event) => {
    updateDraft({ fields: state.draft.fields.map((f) => (f.id === selectedId ? { ...f, label: event.target.value } : f)) })
    renderFields()
  }

  $("prev").onclick = () => {
    updateDraft({ page: Math.max(1, state.draft.page - 1) })
    renderPlace()
  }
  $("next").onclick = () => {
    updateDraft({ page: Math.min(state.draft.pageCount, state.draft.page + 1) })
    renderPlace()
  }
  $("restart").onclick = async () => {
    state.draft = null
    selectedId = null
    await chrome.storage.local.remove("draft")
    render()
  }
  $("to-recipients").onclick = () => {
    updateDraft({ step: "recipients" }, { now: true })
    render()
  }
}

// ─── Recipients and send ──────────────────────────────────────────────────────

const PROBLEM_TEXT = { email: "Enter a valid email address.", duplicate: "Each signer needs a different email address." }

function renderRecipients(problems = []) {
  const d = state.draft
  // A prompt from an earlier visit to this step no longer applies.
  $("upgrade").hidden = true
  $("info").hidden = true
  const list = $("people")
  list.replaceChildren()
  d.signers.forEach((s, i) => {
    const li = document.createElement("li")
    li.className = "person"
    li.style.setProperty("--c", colorOf(i))
    const who = document.createElement("p")
    who.className = "who"
    who.textContent = signerName(i)
    const email = document.createElement("input")
    email.type = "email"
    email.placeholder = "Email"
    email.autocomplete = "email"
    email.value = s.email
    email.setAttribute("aria-label", `${signerName(i)} email`)
    const name = document.createElement("input")
    name.type = "text"
    name.placeholder = "Name (optional)"
    name.value = s.name
    name.setAttribute("aria-label", `${signerName(i)} name`)
    const update = () => updateDraft({ signers: state.draft.signers.map((x, j) => (j === i ? { email: email.value, name: name.value } : x)) })
    email.oninput = update
    name.oninput = update
    li.append(who, email)
    const problem = problems.find((p) => p.endsWith(`:${i}`) && (p.startsWith("email") || p.startsWith("duplicate")))
    if (problem) {
      email.setAttribute("aria-invalid", "true")
      const err = document.createElement("p")
      err.className = "err"
      err.textContent = PROBLEM_TEXT[problem.split(":")[0]]
      li.append(err)
    }
    li.append(name)
    list.append(li)
  })
  if (document.activeElement !== $("title")) $("title").value = d.title
  if (document.activeElement !== $("message")) $("message").value = d.message ?? ""
  $("title").setAttribute("aria-invalid", String(problems.includes("title")))
  $("in-order").checked = d.signingOrder === "SEQUENTIAL"
  $("in-order").disabled = d.signers.length < 2
  $("in-order").parentElement.title = d.signers.length < 2 ? "Add a second signer to choose an order." : ""
  $("pay").checked = false

  const plan = state.account?.plan
  $("send-allowance").textContent = allowanceText(plan)
  const reason = upgradeBeforeSend(plan, d)
  if (reason === "limit") showUpgrade($("upgrade"), "limit", { dismissable: false })
  $("send").disabled = reason === "limit"
}

function setupRecipients() {
  $("title").oninput = (e) => updateDraft({ title: e.target.value })
  $("message").oninput = (e) => updateDraft({ message: e.target.value })
  $("in-order").onchange = (e) => {
    const plan = state.account?.plan
    if (e.target.checked && plan && !plan.features?.sequential_signing) {
      e.target.checked = false
      showUpgrade($("upgrade"), "sequential")
      return
    }
    updateDraft({ signingOrder: e.target.checked ? "SEQUENTIAL" : "PARALLEL" })
  }
  $("pay").onchange = (e) => {
    e.target.checked = false
    const plan = state.account?.plan
    if (plan && !plan.features?.sign_and_pay) {
      showUpgrade($("upgrade"), "payment")
      return
    }
    // On Business already: the extension does not set up payments yet.
    const info = $("info")
    info.replaceChildren(document.createTextNode("Sign & Pay isn't in the extension yet. Send this document from salsox.com to add a payment. "))
    const link = document.createElement("a")
    link.href = "#"
    link.textContent = "Open Salsox"
    link.onclick = (event) => {
      event.preventDefault()
      openTab("/dashboard/documents")
    }
    info.append(link)
    info.hidden = false
  }
  $("back-to-place").onclick = () => {
    updateDraft({ step: "place" }, { now: true })
    render()
  }
  $("send").onclick = async () => {
    const problems = draftProblems(state.draft)
    if (problems.length) {
      renderRecipients(problems)
      return
    }
    const reason = upgradeBeforeSend(state.account?.plan, state.draft)
    if (reason) {
      showUpgrade($("upgrade"), reason, { dismissable: reason !== "limit" })
      return
    }
    await saveDraft(true)
    state.job = { phase: "sending" }
    render()
    send("send")
  }
}

// ─── Result ───────────────────────────────────────────────────────────────────

function renderResult() {
  const job = state.job
  $("sending").hidden = job.phase !== "sending"
  $("sent").hidden = job.phase !== "sent"
  $("failed").hidden = job.phase !== "error"
  if (job.phase === "sent") {
    const people = job.document.recipients
    $("sent-body").textContent = `“${job.document.title}” is on its way to ${people.join(", ")}. You'll find its progress on salsox.com.`
    const warn = job.undelivered ? `${job.undelivered} invitation email${job.undelivered === 1 ? " was" : "s were"} refused. Resend from the document's page.` : job.notEmailed ? "Email isn't set up on this Salsox server, so no invitation went out. Share the signing links from the document's page." : ""
    $("sent-warn").hidden = !warn
    $("sent-warn").textContent = warn
  }
  if (job.phase === "error") {
    const reason = upgradeFromError(job.code)
    if (reason) {
      // A plan refusal is not an error to fix but a choice: back to the
      // recipients step, with the upgrade shown there.
      state.job = null
      chrome.storage.local.remove("job")
      updateDraft({ step: "recipients" }, { now: true })
      render().then(() => showUpgrade($("upgrade"), reason, { dismissable: reason !== "limit" }))
      return
    }
    $("failed-body").textContent =
      job.code === "network" ? "Couldn't reach Salsox. Check your internet connection and try again." : job.message || "Salsox couldn't send this document. Try again."
  }
}

function setupResult() {
  $("open-doc").onclick = () => chrome.tabs.create({ url: state.job.document.url })
  $("another").onclick = async () => {
    state.job = null
    await chrome.storage.local.remove("job")
    render()
  }
  $("failed-back").onclick = async () => {
    state.job = null
    await chrome.storage.local.remove("job")
    render()
  }
}

// ─── Start ────────────────────────────────────────────────────────────────────

async function init() {
  Object.assign(state, await chrome.storage.local.get(["auth", "account", "draft", "job", "notice"]))
  setupPlacing()
  setupRecipients()
  setupResult()

  $("connect-btn").onclick = async () => {
    $("connect-btn").disabled = true
    $("connect-btn").textContent = "Waiting for Salsox…"
    state.notice = null
    renderNotice()
    await send("connect")
  }
  $("signup-link").onclick = (e) => {
    e.preventDefault()
    openTab("/signup")
  }
  $("disconnect").onclick = async () => {
    await send("disconnect")
  }
  const drop = $("drop")
  $("file").onchange = (e) => takeFile(e.target.files?.[0])
  drop.addEventListener("dragover", (e) => {
    e.preventDefault()
    drop.classList.add("over")
  })
  drop.addEventListener("dragleave", () => drop.classList.remove("over"))
  drop.addEventListener("drop", (e) => {
    e.preventDefault()
    drop.classList.remove("over")
    takeFile(e.dataTransfer?.files?.[0])
  })

  // Whatever the background worker changes (a connect, a send, a refresh)
  // shows here as it happens.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return
    let rerender = false
    for (const key of ["auth", "account", "job", "notice"]) {
      if (changes[key]) {
        state[key] = changes[key].newValue ?? null
        rerender = true
      }
    }
    if (changes.draft && !changes.draft.newValue) {
      state.draft = null
      rerender = true
    }
    // A connect ended, either way: the button is usable again.
    if (changes.auth || changes.notice) {
      $("connect-btn").disabled = false
      $("connect-btn").textContent = "Connect to Salsox"
    }
    if (rerender) render()
  })

  await render()
  // The allowance may have changed since the popup was last open.
  if (state.auth?.key) send("refresh")
}

init()
