/**
 * Orphan Page Scanner popup: finds the site in the current tab, asks for
 * access to that one site when Scan is pressed (Chrome's own prompt), starts
 * the scan in the background worker (background.js), and shows its progress
 * and result from chrome.storage.local, so closing and reopening the popup
 * loses nothing. Export is a CSV download; copy puts the orphan list on the
 * clipboard.
 */
import { toCsv } from "./lib/scan.js"

const $ = (id) => document.getElementById(id)
let origin = null

function show(section) {
  for (const id of ["start", "progress", "result"]) $(id).hidden = id !== section
}

function message(text) {
  $("message").hidden = !text
  $("message").textContent = text ?? ""
}

function render(state) {
  if (!state || state.phase === "cancelled") {
    show("start")
    return
  }
  if (state.phase === "error") {
    show("start")
    message(`The scan stopped: ${state.message ?? "an unknown error"}.`)
    return
  }
  if (state.phase === "sitemap" || state.phase === "crawl") {
    show("progress")
    const pct = state.phase === "crawl" && state.listed ? Math.round((state.done / state.listed) * 100) : 4
    $("phase").textContent = state.phase === "sitemap" ? "Reading the sitemap…" : "Checking pages…"
    $("count").textContent = state.phase === "crawl" ? `${state.done} of ${state.listed} pages` : " "
    $("bar-fill").style.width = `${pct}%`
    document.querySelector(".bar").setAttribute("aria-valuenow", String(pct))
    return
  }
  // Done.
  show("result")
  message(null)
  $("t-listed").textContent = String(state.listed)
  $("t-orphans").textContent = String(state.orphans.length)
  $("t-failed").textContent = String(state.failed)
  const when = new Date(state.finished).toLocaleString()
  $("note").textContent = state.noSitemap
    ? "No sitemap was found at robots.txt or /sitemap.xml, so there is nothing to compare links against."
    : `Scanned ${when}.${state.capped ? " The page limit was reached; raise it to check the rest." : ""}${state.failed ? " Pages that did not load still count as listed; their own links are unknown." : ""}`
  const list = $("orphans")
  list.replaceChildren()
  if (state.orphans.length === 0) {
    const li = document.createElement("li")
    li.className = "empty"
    li.textContent = state.noSitemap ? "No sitemap to check." : "None: every page in the sitemap has a link pointing to it."
    list.append(li)
  }
  for (const url of state.orphans) {
    const li = document.createElement("li")
    const a = document.createElement("a")
    a.href = url
    a.target = "_blank"
    a.rel = "noopener"
    a.textContent = url.replace(origin, "") || "/"
    a.title = url
    li.append(a)
    list.append(li)
  }
  $("csv").disabled = state.listed === 0
  $("copy").disabled = state.orphans.length === 0
  $("csv").onclick = () => {
    const blob = new Blob([toCsv(state.rows)], { type: "text/csv" })
    const link = document.createElement("a")
    link.href = URL.createObjectURL(blob)
    link.download = `orphan-pages-${new URL(origin).hostname}.csv`
    link.click()
    setTimeout(() => URL.revokeObjectURL(link.href), 1000)
  }
  $("copy").onclick = async () => {
    await navigator.clipboard.writeText(state.orphans.join("\n"))
    $("copy").textContent = "Copied"
    setTimeout(() => ($("copy").textContent = "Copy list"), 1500)
  }
}

async function start() {
  message(null)
  // Access to this one site, asked for at the moment it is needed.
  const granted = await chrome.permissions.request({ origins: [`${origin}/*`] })
  if (!granted) {
    message("The scan needs permission to read this site's pages. Nothing else is accessed.")
    return
  }
  render({ phase: "sitemap" })
  await chrome.runtime.sendMessage({ type: "scan", origin, maxPages: Number($("limit").value) })
}

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  let url = null
  try {
    url = tab?.url ? new URL(tab.url) : null
  } catch {
    url = null
  }
  if (!url || (url.protocol !== "https:" && url.protocol !== "http:")) {
    $("origin").textContent = "Open a website in this tab, then click the extension again."
    return
  }
  origin = url.origin
  $("origin").textContent = origin
  const key = `scan:${origin}`
  const stored = (await chrome.storage.local.get(key))[key]
  render(stored)
  chrome.storage.onChanged.addListener((changes) => {
    if (changes[key]) render(changes[key].newValue)
  })
  $("scan").onclick = start
  $("again").onclick = start
  $("cancel").onclick = () => chrome.runtime.sendMessage({ type: "cancel", origin })
}

init()
