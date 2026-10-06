"use client"

/**
 * The shared engine of three free tools: Sign PDF, Add signature to PDF and
 * Fill and sign PDF. Each is this component with a different configuration
 * (which marks it offers, whether it repeats marks on every page, whether it
 * reads the PDF's own form fields), so they share one well-tested way of
 * placing things on a page instead of three slightly different ones.
 *
 * Everything happens on the visitor's device. The PDF is read into memory,
 * rendered with pdf.js, and the signed copy is built by
 * src/lib/pdf-tools.ts (the signing engine's own stamper) and downloaded.
 * Nothing is uploaded; pdf-lib loads only when a file has been chosen, so the
 * tool's first paint stays light.
 *
 * Interaction is tap-to-place, the same model as the document editor: choose
 * a mark, tap the page. Marks drag to move and resize from the corner, with
 * pointer events so a finger and a mouse share one path. Text is edited in a
 * bar under the toolbar rather than inside a tiny box, which is what works on
 * a phone. Square corners; panels appear with a short framer-motion fade.
 */
import { useMemo, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { CalendarDays, Check, Download, FileText, PenLine, RefreshCcw, Trash2, Type, X } from "lucide-react"
import { PdfPages } from "@/components/esign/pdf-pages"
import { SignaturePad, type SignatureValue } from "@/components/esign/signature-pad"
import { DEFAULT_PLACEMENT_SIZE, MAX_TOOL_PDF_BYTES, signedFileName, toolFileProblem, type FormFieldInfo, type FormValues, type Placement, type PlacementKind } from "@/lib/pdf-tools"
import { clampPercent } from "@/lib/esign/pdf/coords"
import { trimDataUrl } from "@/lib/image-trim"
import { track } from "@/lib/analytics"
import { cn } from "@/lib/utils"
import { PdfDrop, type PickedPdf } from "./pdf-drop"
import { HANDOFF_KEY } from "./handoff"
import { AnimatePresence, Appear, ToolMotion } from "./tool-motion"

export type StampToolConfig = {
  id: "sign-pdf" | "add-signature-to-pdf" | "fill-and-sign-pdf"
  palette: PlacementKind[]
  everyPageOption?: boolean
  formFields?: boolean
}

const KIND_ICON: Partial<Record<PlacementKind, typeof PenLine>> = { signature: PenLine, date: CalendarDays, text: Type, name: Type, check: Check }

const today = () => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date())

let counter = 0
const newId = () => `m${Date.now().toString(36)}${(counter++).toString(36)}`


export function PdfStampTool({ config }: { config: StampToolConfig }) {
  const t = useTranslations("tools")
  const [pdf, setPdf] = useState<PickedPdf | null>(null)
  const [placements, setPlacements] = useState<Placement[]>([])
  const [armed, setArmed] = useState<PlacementKind | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [signature, setSignature] = useState<SignatureValue | null>(null)
  const [draft, setDraft] = useState<SignatureValue | null>(null)
  const [padOpen, setPadOpen] = useState(false)
  const [everyPage, setEveryPage] = useState(false)
  const [formFields, setFormFields] = useState<FormFieldInfo[]>([])
  const [formValues, setFormValues] = useState<FormValues>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const pageEls = useRef(new Map<number, HTMLDivElement>())
  const drag = useRef<{ id: string; mode: "move" | "resize"; startX: number; startY: number; orig: Placement } | null>(null)

  const selectedMark = placements.find((p) => p.id === selected) ?? null
  const data = useMemo(() => pdf?.bytes, [pdf])

  function fileCheck(file: File): string | null {
    const problem = toolFileProblem(file)
    if (problem === "notPdf") return t("notPdf")
    if (problem === "tooLarge") return t("tooLarge", { mb: MAX_TOOL_PDF_BYTES / 1024 / 1024 })
    return null
  }

  async function picked(file: PickedPdf) {
    setError(null)
    setDone(false)
    setPlacements([])
    setFormFields([])
    setFormValues({})
    // Read the PDF once with pdf-lib now (loaded only at this point): it is
    // how an encrypted or broken file is caught before anyone places marks.
    try {
      const { readFormFields } = await import("@/lib/pdf-tools")
      const fields = await readFormFields(file.bytes)
      if (config.formFields) setFormFields(fields)
    } catch {
      setError(t("protected"))
      return
    }
    setPdf(file)
    try {
      const handed = sessionStorage.getItem(HANDOFF_KEY)
      if (handed && !signature) {
        setSignature({ imageDataUrl: handed })
        sessionStorage.removeItem(HANDOFF_KEY)
      }
    } catch {
      // Storage disabled: the visitor creates a signature here instead.
    }
    track("tool_opened", { tool: config.id })
  }

  async function applyDraftSignature() {
    if (!draft) return
    const value = draft.imageDataUrl ? { imageDataUrl: await trimDataUrl(draft.imageDataUrl) } : draft
    setSignature(value)
    setPadOpen(false)
    setArmed("signature")
  }

  function arm(kind: PlacementKind) {
    if (kind === "signature" && !signature) {
      setPadOpen(true)
      return
    }
    setArmed(armed === kind ? null : kind)
  }

  function placeAt(page: number, e: React.PointerEvent<HTMLDivElement>) {
    if (!armed) return setSelected(null)
    const rect = e.currentTarget.getBoundingClientRect()
    const size = DEFAULT_PLACEMENT_SIZE[armed]
    const x = clampPercent(((e.clientX - rect.left) / rect.width) * 100 - size.width / 2)
    const y = clampPercent(((e.clientY - rect.top) / rect.height) * 100 - size.height / 2)
    const mark: Placement = {
      id: newId(),
      kind: armed,
      page,
      x: Math.min(x, 100 - size.width),
      y: Math.min(y, 100 - size.height),
      ...size,
      value: armed === "date" ? today() : armed === "text" || armed === "name" ? "" : undefined,
    }
    setPlacements((prev) => [...prev, mark])
    setSelected(mark.id)
    // Text needs typing next; signatures and dates are often placed several times.
    if (armed === "text" || armed === "name") setArmed(null)
  }

  function onMarkPointerDown(e: React.PointerEvent, mark: Placement, mode: "move" | "resize") {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    setSelected(mark.id)
    drag.current = { id: mark.id, mode, startX: e.clientX, startY: e.clientY, orig: mark }
  }

  function onMarkPointerMove(e: React.PointerEvent) {
    const d = drag.current
    const el = d && pageEls.current.get(d.orig.page)
    if (!d || !el) return
    const rect = el.getBoundingClientRect()
    const dx = ((e.clientX - d.startX) / rect.width) * 100
    const dy = ((e.clientY - d.startY) / rect.height) * 100
    setPlacements((prev) =>
      prev.map((p) => {
        if (p.id !== d.id) return p
        if (d.mode === "move") {
          return { ...p, x: Math.max(0, Math.min(100 - p.width, d.orig.x + dx)), y: Math.max(0, Math.min(100 - p.height, d.orig.y + dy)) }
        }
        return { ...p, width: Math.max(2, Math.min(100 - p.x, d.orig.width + dx)), height: Math.max(1.5, Math.min(100 - p.y, d.orig.height + dy)) }
      })
    )
  }

  function update(id: string, patch: Partial<Placement>) {
    setPlacements((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)))
  }

  async function download() {
    if (!pdf) return
    const hasForm = Object.keys(formValues).length > 0
    if (placements.length === 0 && !hasForm) return setError(t("nothingToSave"))
    setBusy(true)
    setError(null)
    try {
      const { buildSignedPdf } = await import("@/lib/pdf-tools")
      const marks = placements.map((p) => (p.kind === "signature" ? { ...p, imageDataUrl: signature?.imageDataUrl, typedText: signature?.typedText } : p))
      const out = await buildSignedPdf(pdf.bytes, marks, { everyPage, formValues, title: pdf.name.replace(/\.pdf$/i, "") })
      const url = URL.createObjectURL(new Blob([out as BlobPart], { type: "application/pdf" }))
      const a = document.createElement("a")
      a.href = url
      a.download = signedFileName(pdf.name)
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
      setDone(true)
      track("tool_downloaded", { tool: config.id })
    } catch {
      setError(t("saveFailed"))
    } finally {
      setBusy(false)
    }
  }

  function preview(mark: Placement) {
    if (mark.kind === "signature") {
      if (signature?.imageDataUrl) {
        // eslint-disable-next-line @next/next/no-img-element
        return <img src={signature.imageDataUrl} alt="" className="h-full w-full object-contain" draggable={false} />
      }
      return <span className="truncate font-serif text-lg italic text-slate-900">{signature?.typedText}</span>
    }
    if (mark.kind === "check") return <span className="text-sm font-bold text-slate-900">X</span>
    return <span className="truncate px-1 text-xs text-slate-900">{mark.value || t(`kinds.${mark.kind}`)}</span>
  }

  if (!pdf) {
    return (
      <ToolMotion>
        <PdfDrop onPicked={picked} check={fileCheck} hint={t("hintLocal", { mb: MAX_TOOL_PDF_BYTES / 1024 / 1024 })} />
        {error && <p className="mt-2 text-sm text-destructive" role="alert">{error}</p>}
      </ToolMotion>
    )
  }

  return (
    <ToolMotion>
      <div className="space-y-3">
        <div className="sticky top-[calc(var(--header-h,4.5rem)+0.5rem)] z-20 space-y-2 border border-border bg-background/95 p-3 shadow-sm backdrop-blur">
          <div className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
              <FileText className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              <span className="truncate">{pdf.name}</span>
            </span>
            <button type="button" onClick={() => setPdf(null)} className="inline-flex h-9 shrink-0 items-center gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground">
              <RefreshCcw className="h-3.5 w-3.5" aria-hidden="true" /> {t("changeFile")}
            </button>
          </div>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5" role="toolbar" aria-label={t("marks")}>
            {config.palette.map((kind) => {
              const Icon = KIND_ICON[kind] ?? Type
              return (
                <button
                  key={kind}
                  type="button"
                  aria-pressed={armed === kind}
                  onClick={() => arm(kind)}
                  className={cn("inline-flex min-h-10 shrink-0 items-center gap-1.5 border px-3 text-sm", armed === kind ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-secondary")}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" /> {t(`kinds.${kind}`)}
                </button>
              )
            })}
            {config.palette.includes("signature") && signature && (
              <button type="button" onClick={() => setPadOpen(true)} className="inline-flex min-h-10 shrink-0 items-center px-3 text-sm text-primary underline-offset-4 hover:underline">
                {t("editSignature")}
              </button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{armed ? t("tapToPlace") : t("pickMark")}</p>

          {selectedMark && (selectedMark.kind === "text" || selectedMark.kind === "name" || selectedMark.kind === "date") && (
            <div className="flex items-center gap-2 border-t border-border pt-2">
              <label className="sr-only" htmlFor="mark-text">{t("textLabel")}</label>
              <input
                id="mark-text"
                autoFocus
                value={selectedMark.value ?? ""}
                onChange={(e) => update(selectedMark.id, { value: e.target.value.slice(0, 120) })}
                placeholder={t("textPlaceholder")}
                className="h-10 min-w-0 flex-1 border border-border bg-background px-3 text-base"
              />
              <button type="button" aria-label={t("remove")} onClick={() => { setPlacements((p) => p.filter((m) => m.id !== selectedMark.id)); setSelected(null) }} className="inline-flex h-10 w-10 items-center justify-center border border-border text-destructive">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          )}
          {selectedMark && !(selectedMark.kind === "text" || selectedMark.kind === "name" || selectedMark.kind === "date") && (
            <div className="flex items-center justify-between gap-2 border-t border-border pt-2 text-sm">
              <span>{t(`kinds.${selectedMark.kind}`)}</span>
              <button type="button" onClick={() => { setPlacements((p) => p.filter((m) => m.id !== selectedMark.id)); setSelected(null) }} className="inline-flex h-9 items-center gap-1.5 px-2 text-destructive">
                <Trash2 className="h-4 w-4" aria-hidden="true" /> {t("remove")}
              </button>
            </div>
          )}
        </div>

        <AnimatePresence>
          {padOpen && (
            <Appear id="pad" className="space-y-3 border border-primary/40 bg-card p-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">{t("createSignature")}</h3>
                <button type="button" aria-label={t("cancel")} onClick={() => setPadOpen(false)} className="inline-flex h-9 w-9 items-center justify-center text-muted-foreground">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <SignaturePad defaultName="" onChange={setDraft} />
              <button type="button" disabled={!draft} onClick={() => void applyDraftSignature()} className="inline-flex h-11 w-full items-center justify-center gap-2 bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50 sm:w-auto">
                <Check className="h-4 w-4" aria-hidden="true" /> {t("useSignature")}
              </button>
            </Appear>
          )}
        </AnimatePresence>

        {config.formFields && formFields.length > 0 && (
          <Appear id="form" className="space-y-3 border border-border bg-card p-4">
            <div>
              <h3 className="font-semibold">{t("formTitle", { count: formFields.length })}</h3>
              <p className="text-xs text-muted-foreground">{t("formHint")}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {formFields.map((field) => (
                <div key={field.name} className="min-w-0">
                  {field.type === "checkbox" ? (
                    <label className="flex min-h-10 items-center gap-2 text-sm">
                      <input type="checkbox" className="h-5 w-5" checked={formValues[field.name] === true} onChange={(e) => setFormValues((v) => ({ ...v, [field.name]: e.target.checked }))} />
                      <span className="truncate">{field.name}</span>
                    </label>
                  ) : (
                    <label className="block text-sm">
                      <span className="mb-1 block truncate text-xs text-muted-foreground">{field.name}</span>
                      {field.type === "choice" ? (
                        <select value={String(formValues[field.name] ?? field.value)} onChange={(e) => setFormValues((v) => ({ ...v, [field.name]: e.target.value }))} className="h-10 w-full border border-border bg-background px-2 text-base">
                          <option value="">{t("choose")}</option>
                          {field.options.map((o) => (
                            <option key={o} value={o}>{o}</option>
                          ))}
                        </select>
                      ) : (
                        <input value={String(formValues[field.name] ?? field.value)} onChange={(e) => setFormValues((v) => ({ ...v, [field.name]: e.target.value }))} className="h-10 w-full border border-border bg-background px-3 text-base" />
                      )}
                    </label>
                  )}
                </div>
              ))}
            </div>
          </Appear>
        )}

        {config.everyPageOption && (
          <label className="flex min-h-11 items-start gap-3 border border-border p-3 text-sm">
            <input type="checkbox" className="mt-0.5 h-5 w-5" checked={everyPage} onChange={(e) => setEveryPage(e.target.checked)} />
            <span>
              <span className="font-medium">{t("everyPage")}</span>
              <span className="block text-xs text-muted-foreground">{t("everyPageHint")}</span>
            </span>
          </label>
        )}

        <PdfPages
          data={data}
          onPageRef={(page, el) => (el ? pageEls.current.set(page, el) : pageEls.current.delete(page))}
          renderOverlay={(page) => (
            <div className={cn("absolute inset-0", armed && "cursor-crosshair")} onPointerDown={(e) => placeAt(page, e)}>
              {placements
                .filter((p) => p.page === page || (everyPage && p.page === 1))
                .map((p) => (
                  <div
                    key={`${p.id}-${page}`}
                    role="button"
                    tabIndex={0}
                    aria-label={t(`kinds.${p.kind}`)}
                    onPointerDown={(e) => (p.page === page ? onMarkPointerDown(e, p, "move") : e.stopPropagation())}
                    onPointerMove={onMarkPointerMove}
                    onPointerUp={() => (drag.current = null)}
                    onKeyDown={(e) => {
                      if (e.key === "Delete" || e.key === "Backspace") setPlacements((prev) => prev.filter((m) => m.id !== p.id))
                    }}
                    className={cn(
                      "absolute flex touch-none select-none items-center justify-center overflow-hidden border-2 bg-primary/10",
                      p.page === page ? "cursor-move" : "opacity-60",
                      selected === p.id ? "border-primary" : "border-primary/50 border-dashed"
                    )}
                    style={{ left: `${p.x}%`, top: `${p.y}%`, width: `${p.width}%`, height: `${p.height}%` }}
                  >
                    {preview(p)}
                    {selected === p.id && p.page === page && (
                      <span onPointerDown={(e) => onMarkPointerDown(e, p, "resize")} className="absolute bottom-0 right-0 h-4 w-4 cursor-se-resize bg-primary" aria-hidden="true" />
                    )}
                  </div>
                ))}
            </div>
          )}
        />

        <div className="sticky bottom-0 z-20 -mx-1 border-t border-border bg-background/95 px-1 py-3 backdrop-blur">
          {error && <p className="mb-2 text-sm text-destructive" role="alert">{error}</p>}
          {done && !error && <p className="mb-2 text-sm text-emerald-700 dark:text-emerald-400" role="status">{t("downloaded")}</p>}
          <button type="button" onClick={() => void download()} disabled={busy} className="inline-flex h-12 w-full items-center justify-center gap-2 bg-primary px-6 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60 sm:w-auto">
            <Download className="h-4 w-4" aria-hidden="true" /> {busy ? t("saving") : t("download")}
          </button>
        </div>
      </div>
    </ToolMotion>
  )
}
