"use client"

/**
 * The full document editor: recipients → fields → review & send.
 *
 * Field placement is tap-to-place rather than drag-from-a-palette: pick a
 * recipient, pick a field type, tap the page. That works identically with a
 * mouse and a finger (drag-and-drop from a sidebar does not exist on a phone).
 * Placed fields can then be dragged to move and resized from the corner
 * handle, with pointer events so touch and mouse share one code path.
 *
 * Everything is kept in local state and sent to the server in one payload
 * (`documentSetupSchema`), which re-validates it in full.
 */
import { useMemo, useRef, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { ArrowDown, ArrowUp, MessageSquareText, Plus, Trash2, X } from "lucide-react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { saveAndSendAction, saveSetupAction } from "@/app/actions/documents"
import { clampPercent, clientToPercent } from "@/lib/esign/pdf/coords"
import { SIGN_AND_PAY_CURRENCIES } from "@/lib/esign/payments/select"
import { MAX_RECIPIENTS } from "@/lib/esign/email-list"
import type { DocumentSetup } from "@/lib/esign/schemas"
import { toE164 } from "@/lib/esign/phone"
import { isStepRole, joinFlagsFromOrders, ordersFromSteps, signingSteps } from "@/lib/esign/signing-steps"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/sonner"
import { cn } from "@/lib/utils"
import { PdfPages } from "./pdf-pages"
import { PlanLock, useActionErrorToast } from "./plan-upsell"
import { SigningStepList } from "./signing-step-list"
import { PlacementDebugPanel, usePlacementDiagnostics } from "./placement-diagnostics"
import * as Sentry from "@sentry/nextjs"
import { track } from "@/lib/analytics"

type FieldType = DocumentSetup["fields"][number]["type"]
type Role = DocumentSetup["recipients"][number]["role"]
// `joinPrevious`: in a sequential document, signs at the same step as the
// nearest signer or approver above (signing-steps.ts). Derived from the saved
// orders when a draft opens, so it is not part of what the page passes in.
type EditorRecipient = { key: string; name: string; email: string; phone: string; role: Role; order: number; joinPrevious: boolean }
type EditorField = { id: string; recipientKey: string; type: FieldType; page: number; x: number; y: number; width: number; height: number; required: boolean }

const FIELD_TYPES: FieldType[] = ["SIGNATURE", "INITIALS", "NAME", "DATE", "EMAIL", "TEXT", "CHECKBOX"]

/** Default size of a new field, in % of the page. */
const DEFAULT_SIZE: Record<FieldType, { width: number; height: number }> = {
  SIGNATURE: { width: 26, height: 6 },
  INITIALS: { width: 10, height: 5 },
  NAME: { width: 24, height: 3.5 },
  EMAIL: { width: 28, height: 3.5 },
  DATE: { width: 16, height: 3.5 },
  TEXT: { width: 28, height: 3.5 },
  CHECKBOX: { width: 3.5, height: 2.5 },
}

/** One colour per recipient, so whose field is whose is visible at a glance. */
const COLORS = ["#0d9488", "#2563eb", "#c026d3", "#ea580c", "#16a34a", "#dc2626", "#7c3aed", "#0891b2"]

type Props = {
  documentId: string
  fileUrl: string
  pageCount: number
  initial: {
    title: string
    signingOrder: "PARALLEL" | "SEQUENTIAL"
    subject: string
    message: string
    expiresInDays: number | null
    recipients: Omit<EditorRecipient, "joinPrevious">[]
    fields: EditorField[]
    payment: { amount: string; currency: string; recipientKey: string } | null
    smsReminders: boolean
  }
  readyProviders: ("STRIPE" | "PAYSTACK")[]
  /**
   * The Business features this sender's plan includes (src/lib/esign/plans.ts).
   * A locked control is disabled with an upgrade note; one already switched
   * on (a draft saved before a downgrade) can still be switched off. The
   * server refuses the setup either way.
   */
  plan: { signAndPay: boolean; sequentialSigning: boolean; approvers: boolean }
  /**
   * Whether this deployment can send SMS (src/lib/esign/sms.ts). Without a
   * provider the option is not shown at all; a draft that had it switched on
   * keeps the setting, which simply sends nothing.
   */
  smsAvailable: boolean
}

let counter = 0
const localId = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${(counter++).toString(36)}`

export function DocumentEditor({ documentId, fileUrl, pageCount, initial, readyProviders, plan, smsAvailable }: Props) {
  const t = useTranslations("esign.editor")
  const tSteps = useTranslations("esign.steps")
  const tPlans = useTranslations("esign.plans")
  const showError = useActionErrorToast()
  const router = useRouter()
  // Was `initial.recipients.length > 0 ? 1 : 0`. A draft made from a template
  // (src/lib/esign/templates.ts) arrives with a recipient per role and no
  // email for the ones still to be named: it opens on Recipients so that is
  // the first thing the sender sees, not a Fields step they cannot leave.
  const [step, setStep] = useState<0 | 1 | 2>(initial.recipients.length > 0 && initial.recipients.every((r) => r.email.trim()) ? 1 : 0)
  const [title, setTitle] = useState(initial.title)
  const [signingOrder, setSigningOrder] = useState(initial.signingOrder)
  const [subject, setSubject] = useState(initial.subject)
  const [message, setMessage] = useState(initial.message)
  const [expiry, setExpiry] = useState<string>(initial.expiresInDays === null ? "never" : String(initial.expiresInDays))
  // Was: initial.recipients as they came, every recipient its own position.
  // Shared steps are read back from the saved orders (joinFlagsFromOrders).
  const [recipients, setRecipients] = useState<EditorRecipient[]>(() => {
    if (initial.recipients.length === 0) return [{ key: localId("r"), name: "", email: "", phone: "", role: "SIGNER", order: 0, joinPrevious: false }]
    const joins = joinFlagsFromOrders(initial.recipients)
    return initial.recipients.map((r, i) => ({ ...r, joinPrevious: joins[i] }))
  })
  const [fields, setFields] = useState<EditorField[]>(initial.fields)
  const [activeRecipient, setActiveRecipient] = useState<string>(initial.recipients[0]?.key ?? "")
  const [armed, setArmed] = useState<FieldType | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [payOn, setPayOn] = useState(initial.payment !== null)
  const [payment, setPayment] = useState(initial.payment ?? { amount: "", currency: "USD", recipientKey: "" })
  const [smsOn, setSmsOn] = useState(initial.smsReminders)
  const reduceMotion = useReducedMotion()
  const [pending, startTransition] = useTransition()
  const pageEls = useRef(new Map<number, HTMLDivElement>())
  const drag = useRef<{ id: string; mode: "move" | "resize"; startX: number; startY: number; orig: EditorField } | null>(null)

  const colorOf = useMemo(() => {
    const map = new Map(recipients.map((r, i) => [r.key, COLORS[i % COLORS.length]]))
    return (key: string) => map.get(key) ?? "#64748b"
  }, [recipients])
  const actionable = recipients.filter((r) => r.role === "SIGNER" || r.role === "APPROVER")
  // Who an SMS reminder could reach: signers and approvers with a number in
  // international form. The same rule the sender applies (toE164).
  const smsReach = actionable.filter((r) => toE164(r.phone) !== null).length
  const currentRecipient = actionable.find((r) => r.key === activeRecipient) ?? actionable[0]
  // The order each recipient is saved with, and the steps they make, for the
  // labels and the preview. In a parallel document every order is ignored.
  const orders = ordersFromSteps(recipients)
  const steps = signingSteps(recipients.map((r, i) => ({ ...r, order: orders[i], signingStatus: "NOT_SIGNED" as const })), "SEQUENTIAL")
  const stepOf = new Map(steps.flatMap((s) => s.recipients.map((r) => [r.key, s.number] as const)))
  const displayName = (r: EditorRecipient) => r.name.trim() || r.email.trim() || tSteps("unnamed")
  // Field-placement diagnostics (placement-diagnostics.tsx): reports a click
  // that should have placed a field and did not. Facts only, no names.
  const placement = usePlacementDiagnostics({
    armed,
    fieldCount: fields.length,
    recipientFacts: () => ({
      recipients: recipients.length,
      actionable: actionable.length,
      activeFound: actionable.some((r) => r.key === activeRecipient),
      hasCurrent: !!currentRecipient,
      step,
    }),
  })

  // ── Recipients ───────────────────────────────────────────────────────────
  function updateRecipient(key: string, patch: Partial<EditorRecipient>) {
    setRecipients((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }
  function addRecipient() {
    setRecipients((prev) => [...prev, { key: localId("r"), name: "", email: "", phone: "", role: "SIGNER", order: prev.length, joinPrevious: false }])
  }
  function removeRecipient(key: string) {
    setRecipients((prev) => prev.filter((r) => r.key !== key).map((r, i) => ({ ...r, order: i })))
    setFields((prev) => prev.filter((f) => f.recipientKey !== key))
  }
  function move(key: string, dir: -1 | 1) {
    setRecipients((prev) => {
      const i = prev.findIndex((r) => r.key === key)
      const j = i + dir
      if (j < 0 || j >= prev.length) return prev
      const next = [...prev]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next.map((r, idx) => ({ ...r, order: idx }))
    })
  }
  const recipientsValid =
    recipients.length > 0 &&
    recipients.every((r) => r.name.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email.trim())) &&
    actionable.length > 0

  // ── Fields ───────────────────────────────────────────────────────────────
  function placeAt(page: number, e: React.PointerEvent<HTMLDivElement>) {
    // Was a silent return in both cases below, which left the "tap the page"
    // prompt up with nothing placed. Now nothing fails without saying so.
    // if (!armed || !currentRecipient) return
    // const el = pageEls.current.get(page)
    // if (!el) return
    if (!armed) return void placement.handlerRan("not armed")
    if (!currentRecipient) {
      placement.handlerRan("no recipient")
      toast.error(t("placeNoRecipient"))
      return
    }
    placement.handlerRan(`placing ${armed} on page ${page}`)
    // Measured from the overlay that was clicked, which covers the page
    // exactly, rather than from the page refs: the click itself always has
    // its box, a ref lookup can come back empty.
    const { x, y } = clientToPercent(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect())
    const size = DEFAULT_SIZE[armed]
    const field: EditorField = {
      id: localId("f"),
      recipientKey: currentRecipient.key,
      type: armed,
      page,
      // Centre the new field on the tap, kept inside the page.
      x: clampPercent(Math.min(x - size.width / 2, 100 - size.width)),
      y: clampPercent(Math.min(y - size.height / 2, 100 - size.height)),
      ...size,
      required: armed !== "CHECKBOX",
    }
    setFields((prev) => [...prev, field])
    setSelected(field.id)
    setArmed(null)
  }

  function onFieldPointerDown(e: React.PointerEvent, field: EditorField, mode: "move" | "resize") {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    setSelected(field.id)
    drag.current = { id: field.id, mode, startX: e.clientX, startY: e.clientY, orig: field }
  }
  function onFieldPointerMove(e: React.PointerEvent) {
    const d = drag.current
    if (!d) return
    const el = pageEls.current.get(d.orig.page)
    if (!el) return
    const box = el.getBoundingClientRect()
    const dx = ((e.clientX - d.startX) / box.width) * 100
    const dy = ((e.clientY - d.startY) / box.height) * 100
    setFields((prev) =>
      prev.map((f) => {
        if (f.id !== d.id) return f
        if (d.mode === "move") {
          return { ...f, x: clampPercent(Math.min(d.orig.x + dx, 100 - f.width)), y: clampPercent(Math.min(d.orig.y + dy, 100 - f.height)) }
        }
        return {
          ...f,
          width: Math.max(2, Math.min(d.orig.width + dx, 100 - f.x)),
          height: Math.max(1.5, Math.min(d.orig.height + dy, 100 - f.y)),
        }
      })
    )
  }
  const selectedField = fields.find((f) => f.id === selected) ?? null

  // ── Save / send ──────────────────────────────────────────────────────────
  function payload(): DocumentSetup {
    return {
      title: title.trim() || "Untitled document",
      signingOrder,
      subject: subject.trim() || undefined,
      message: message.trim() || undefined,
      expiresInDays: expiry === "never" ? null : Number(expiry),
      recipients: recipients.map((r, i) => ({
        key: r.key,
        name: r.name.trim(),
        email: r.email.trim().toLowerCase(),
        phone: r.phone.trim() || undefined,
        role: r.role,
        // Was `order: i`: one recipient per position, so nobody could share
        // a step. Now recipients marked "at the same time" share one.
        // order: i,
        order: orders[i],
      })),
      fields: fields.map(({ recipientKey, type, page, x, y, width, height, required }) => ({ recipientKey, type, page, x, y, width, height, required })),
      payment:
        payOn && payment.amount
          ? { amount: payment.amount, currency: payment.currency, recipientKey: payment.recipientKey || actionable[0]?.key || "" }
          : null,
      smsReminders: smsOn,
    }
  }

  function submit(send: boolean) {
    const missing = actionable.filter((r) => r.role === "SIGNER" && !fields.some((f) => f.recipientKey === r.key))
    if (send && missing.length > 0) {
      // What the editor held when it refused: tells "nothing was ever placed"
      // from "fields exist, but under another recipient's key".
      Sentry.captureMessage("Send blocked: signer has no fields", {
        level: "warning",
        tags: { area: "editor" },
        contexts: {
          placement: {
            fields: fields.length,
            fieldsForKnownRecipients: fields.filter((f) => recipients.some((r) => r.key === f.recipientKey)).length,
            signersMissing: missing.length,
            signers: actionable.filter((r) => r.role === "SIGNER").length,
            recipients: recipients.length,
          },
        },
      })
      toast.error(t("signerNeedsField", { name: missing[0].name || missing[0].email }))
      setStep(1)
      return
    }
    startTransition(async () => {
      const result = send ? await saveAndSendAction(documentId, payload()) : await saveSetupAction(documentId, payload())
      if (result.error) return void showError(result.error, result.upgrade)
      // The end of the signup-to-first-document funnel (analytics.ts).
      if (send) track("document_sent", { via: "editor" })
      if (send && result.undelivered) {
        // The provider refused some invitations: say so, and let the document
        // page show who was not reached instead of its "Sent!" banner.
        toast.error(t("sentUndelivered", { count: result.undelivered }))
        router.push(`/dashboard/documents/${documentId}`)
      } else if (send && result.notEmailed) {
        // No email provider: the document is live but nobody was emailed, so
        // this is a warning, never "Sent!".
        toast.warning(t("sentNotEmailed"))
        // ?sent=1 opens the page on its "email isn't configured" notice.
        router.push(`/dashboard/documents/${documentId}?sent=1`)
      } else if (send) {
        toast.success(t("sent"))
        router.push(`/dashboard/documents/${documentId}?sent=1`)
      } else {
        toast.success(t("saved"))
        router.refresh()
      }
    })
  }

  const wizardSteps = [t("stepRecipients"), t("stepFields"), t("stepReview")]

  return (
    <div className="space-y-4">
      <ol className="grid grid-cols-3 gap-2" aria-label={t("steps")}>
        {wizardSteps.map((label, i) => (
          <li key={label}>
            <button
              type="button"
              disabled={i > 0 && !recipientsValid}
              onClick={() => setStep(i as 0 | 1 | 2)}
              aria-current={step === i ? "step" : undefined}
              className={cn(
                "flex min-h-11 w-full items-center justify-center gap-2 border px-2 text-sm font-medium disabled:opacity-50",
                step === i ? "border-primary bg-primary/10 text-primary-hover" : "text-muted-foreground"
              )}
            >
              <span className="hidden sm:inline">{i + 1}.</span> {label}
            </button>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div className="space-y-4">
          <div className="space-y-3">
            {recipients.map((r, i) => (
              <div key={r.key} className="space-y-3 border p-3" style={{ borderLeft: `4px solid ${colorOf(r.key)}` }}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor={`n-${r.key}`}>{t("name")}</Label>
                    <Input id={`n-${r.key}`} value={r.name} onChange={(e) => updateRecipient(r.key, { name: e.target.value })} maxLength={120} autoComplete="off" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`e-${r.key}`}>{t("email")}</Label>
                    <Input id={`e-${r.key}`} type="email" inputMode="email" value={r.email} onChange={(e) => updateRecipient(r.key, { email: e.target.value })} autoComplete="off" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`p-${r.key}`}>{t("phone")}</Label>
                    <Input id={`p-${r.key}`} type="tel" inputMode="tel" value={r.phone} onChange={(e) => updateRecipient(r.key, { phone: e.target.value })} placeholder="+233 20 123 4567" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`r-${r.key}`}>{t("role")}</Label>
                    <select
                      id={`r-${r.key}`}
                      value={r.role}
                      onChange={(e) => updateRecipient(r.key, { role: e.target.value as Role })}
                      className="h-11 w-full border bg-background px-3 text-sm"
                    >
                      {(["SIGNER", "APPROVER", "VIEWER", "CC"] as const).map((role) =>
                        // Approvers are a Business feature: offered, but not
                        // selectable on a lower plan, and named as such.
                        role === "APPROVER" && !plan.approvers ? (
                          <option key={role} value={role} disabled>{tPlans("approverOption", { plan: "Business" })}</option>
                        ) : (
                          <option key={role} value={role}>{t(`roles.${role}`)}</option>
                        )
                      )}
                    </select>
                  </div>
                </div>
                {/* Sharing a step: only in a sequential document, and only for a
                    signer or approver with another one above it. */}
                {signingOrder === "SEQUENTIAL" && isStepRole(r.role) && recipients.slice(0, i).some((x) => isStepRole(x.role)) && (
                  <label className="flex min-h-11 items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="h-5 w-5"
                      checked={r.joinPrevious}
                      onChange={(e) => updateRecipient(r.key, { joinPrevious: e.target.checked })}
                    />
                    {t("sameStep", { n: stepOf.get(recipients.slice(0, i).findLast((x) => isStepRole(x.role))!.key) ?? 1 })}
                  </label>
                )}
                <div className="flex items-center justify-between">
                  {/* Was the orderN message with i + 1 ("Signs 1st") for everyone,
                      approvers, viewers and copy recipients included, and
                      counting them all. Now the step, for those who have one. */}
                  <span className="text-xs text-muted-foreground">
                    {signingOrder === "SEQUENTIAL" ? (isStepRole(r.role) ? tSteps("step", { n: stepOf.get(r.key) ?? 1 }) : t("notInOrder")) : ""}
                  </span>
                  <div className="flex gap-1">
                    {signingOrder === "SEQUENTIAL" && (
                      <>
                        <Button type="button" size="sm" variant="ghost" aria-label={t("moveUp")} disabled={i === 0} onClick={() => move(r.key, -1)}><ArrowUp className="h-4 w-4" /></Button>
                        <Button type="button" size="sm" variant="ghost" aria-label={t("moveDown")} disabled={i === recipients.length - 1} onClick={() => move(r.key, 1)}><ArrowDown className="h-4 w-4" /></Button>
                      </>
                    )}
                    <Button type="button" size="sm" variant="ghost" aria-label={t("remove")} disabled={recipients.length === 1} onClick={() => removeRecipient(r.key)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <AnimatePresence initial={false}>
            {signingOrder === "SEQUENTIAL" && steps.length > 0 && (
              <motion.div
                key="order-preview"
                initial={reduceMotion ? false : { opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={reduceMotion ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, height: 0 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="overflow-hidden"
              >
                <div className="space-y-3 border bg-muted/30 p-4">
                  <p className="text-sm font-medium">{tSteps("title")}</p>
                  <SigningStepList steps={steps.map((s) => ({ key: s.recipients[0].key, number: s.number, names: s.recipients.map(displayName) }))} />
                  {recipients.some((r) => !isStepRole(r.role)) && <p className="text-xs text-muted-foreground">{tSteps("outside")}</p>}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Button type="button" variant="outline" onClick={addRecipient} disabled={recipients.length >= MAX_RECIPIENTS}><Plus className="h-4 w-4" /> {t("addRecipient")}</Button>
            <label className={cn("flex min-h-11 items-center gap-2 text-sm", !plan.sequentialSigning && signingOrder !== "SEQUENTIAL" && "text-muted-foreground")}>
              <input
                type="checkbox"
                className="h-5 w-5"
                checked={signingOrder === "SEQUENTIAL"}
                disabled={!plan.sequentialSigning && signingOrder !== "SEQUENTIAL"}
                onChange={(e) => setSigningOrder(e.target.checked ? "SEQUENTIAL" : "PARALLEL")}
              />
              {t("sequential")}
            </label>
          </div>
          {(!plan.sequentialSigning || !plan.approvers) && <PlanLock plan="Business" />}
          <Button type="button" size="lg" className="w-full sm:w-auto" disabled={!recipientsValid} onClick={() => { setActiveRecipient(actionable[0]?.key ?? ""); setStep(1) }}>
            {t("next")}
          </Button>
          {!recipientsValid && <p className="text-sm text-muted-foreground">{t("recipientsIncomplete")}</p>}
        </div>
      )}

      {step === 1 && (
        <div className="space-y-3">
          {/* Toolbar: sticky so it stays reachable while scrolling a long PDF. */}
          <div className="sticky top-16 z-10 space-y-2 border bg-background/95 p-3 backdrop-blur">
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              {actionable.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => setActiveRecipient(r.key)}
                  className={cn("flex min-h-9 shrink-0 items-center gap-2  border px-3 text-sm", currentRecipient?.key === r.key && "border-foreground font-medium")}
                >
                  <span className="h-3 w-3 rounded-full" style={{ background: colorOf(r.key) }} />
                  {r.name || r.email}
                </button>
              ))}
            </div>
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              {FIELD_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setArmed(armed === type ? null : type)}
                  aria-pressed={armed === type}
                  className={cn(
                    "min-h-9 shrink-0 border px-3 text-sm",
                    armed === type ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"
                  )}
                >
                  {t(`fieldTypes.${type}`)}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">{armed ? t("tapToPlace") : t("pickFieldType")}</p>
            {placement.debug && <PlacementDebugPanel entries={placement.entries} />}
            {selectedField && (
              <div className="flex flex-wrap items-center gap-2 border-t pt-2 text-sm">
                <span className="font-medium">{t(`fieldTypes.${selectedField.type}`)}</span>
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={selectedField.required}
                    onChange={(e) => setFields((prev) => prev.map((f) => (f.id === selectedField.id ? { ...f, required: e.target.checked } : f)))}
                  />
                  {t("required")}
                </label>
                <Button type="button" size="sm" variant="ghost" className="text-destructive" onClick={() => { setFields((prev) => prev.filter((f) => f.id !== selectedField.id)); setSelected(null) }}>
                  <Trash2 className="h-4 w-4" /> {t("remove")}
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setSelected(null)} aria-label={t("deselect")}><X className="h-4 w-4" /></Button>
              </div>
            )}
          </div>

          <PdfPages
            url={fileUrl}
            onPageRef={(page, el) => (el ? pageEls.current.set(page, el) : pageEls.current.delete(page))}
            renderOverlay={(page) => (
              <div
                data-field-overlay=""
                className={cn("absolute inset-0", armed && "cursor-crosshair")}
                onPointerDown={(e) => (armed ? placeAt(page, e) : setSelected(null))}
              >
                {fields
                  .filter((f) => f.page === page)
                  .map((f) => (
                    <div
                      key={f.id}
                      data-field-id={f.id}
                      role="button"
                      tabIndex={0}
                      aria-label={t(`fieldTypes.${f.type}`)}
                      onPointerDown={(e) => onFieldPointerDown(e, f, "move")}
                      onPointerMove={onFieldPointerMove}
                      onPointerUp={() => (drag.current = null)}
                      onKeyDown={(e) => {
                        if (e.key === "Delete" || e.key === "Backspace") setFields((prev) => prev.filter((x) => x.id !== f.id))
                      }}
                      className={cn(
                        "absolute flex touch-none select-none items-center justify-center overflow-hidden border-2 text-[10px] font-medium sm:text-xs",
                        selected === f.id && "ring-2 ring-offset-1"
                      )}
                      style={{
                        left: `${f.x}%`,
                        top: `${f.y}%`,
                        width: `${f.width}%`,
                        height: `${f.height}%`,
                        borderColor: colorOf(f.recipientKey),
                        background: `${colorOf(f.recipientKey)}22`,
                        color: colorOf(f.recipientKey),
                      }}
                    >
                      <span className="truncate px-1">{t(`fieldTypes.${f.type}`)}{f.required ? " *" : ""}</span>
                      <span
                        aria-hidden
                        onPointerDown={(e) => onFieldPointerDown(e, f, "resize")}
                        onPointerMove={onFieldPointerMove}
                        onPointerUp={() => (drag.current = null)}
                        className="absolute bottom-0 right-0 h-3 w-3 cursor-se-resize"
                        style={{ background: colorOf(f.recipientKey) }}
                      />
                    </div>
                  ))}
              </div>
            )}
          />
          <p className="text-center text-xs text-muted-foreground">{t("pageCount", { count: pageCount })}</p>
          <div className="sticky bottom-0 flex gap-2 border-t bg-background/95 py-3 backdrop-blur">
            <Button type="button" variant="outline" className="flex-1 sm:flex-none" onClick={() => setStep(0)}>{t("back")}</Button>
            <Button type="button" className="flex-1 sm:flex-none" onClick={() => setStep(2)}>{t("next")}</Button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="doc-title">{t("title")}</Label>
            <Input id="doc-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="doc-subject">{t("subject")}</Label>
            <Input id="doc-subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} placeholder={t("subjectPlaceholder")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="doc-message">{t("message")}</Label>
            <Textarea id="doc-message" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={2000} rows={3} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="doc-expiry">{t("expiry")}</Label>
            <select id="doc-expiry" value={expiry} onChange={(e) => setExpiry(e.target.value)} className="h-11 w-full border bg-background px-3 text-sm">
              {["7", "14", "30", "90"].map((d) => (
                <option key={d} value={d}>{t("expiryDays", { days: Number(d) })}</option>
              ))}
              <option value="never">{t("expiryNever")}</option>
            </select>
          </div>

          {/* Squared when the plan gate was added (was rounded-xl). */}
          <div className="space-y-3 border p-4">
            <label className={cn("flex min-h-11 items-center gap-3 font-medium", !plan.signAndPay && !payOn && "text-muted-foreground")}>
              <input type="checkbox" className="h-5 w-5" checked={payOn} disabled={!plan.signAndPay && !payOn} onChange={(e) => setPayOn(e.target.checked)} />
              {t("signAndPay")}
            </label>
            <p className="text-sm text-muted-foreground">{t("signAndPayHint")}</p>
            {/* What the sender pays for Sign & Pay, said before it is switched on:
                the provider's fee at cost, nothing added (payments/fee-passthrough.ts). */}
            <p className="text-xs text-muted-foreground">{t("signAndPayFee")}</p>
            {!plan.signAndPay && <PlanLock plan="Business" />}
            {payOn && (
              readyProviders.length === 0 ? (
                <p className="bg-amber-500/10 p-3 text-sm">
                  {t("noPayout")}{" "}
                  <Link href="/dashboard/payouts" className="font-medium text-primary underline">{t("connectPayout")}</Link>
                </p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1">
                    <Label htmlFor="pay-amount">{t("amount")}</Label>
                    <Input id="pay-amount" inputMode="decimal" value={payment.amount} onChange={(e) => setPayment({ ...payment, amount: e.target.value })} placeholder="250.00" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="pay-currency">{t("currency")}</Label>
                    <select id="pay-currency" value={payment.currency} onChange={(e) => setPayment({ ...payment, currency: e.target.value })} className="h-11 w-full border bg-background px-3 text-sm">
                      {SIGN_AND_PAY_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="pay-who">{t("payer")}</Label>
                    <select id="pay-who" value={payment.recipientKey || actionable[0]?.key} onChange={(e) => setPayment({ ...payment, recipientKey: e.target.value })} className="h-11 w-full border bg-background px-3 text-sm">
                      {actionable.map((r) => <option key={r.key} value={r.key}>{r.name || r.email}</option>)}
                    </select>
                  </div>
                </div>
              )
            )}
          </div>

          {/* SMS reminders: opt-in, and only offered when the deployment has
              an SMS provider. Square like the Sign & Pay block above. */}
          {smsAvailable && (
            <div className="space-y-2 border p-4">
              <label className="flex min-h-11 items-center gap-3 font-medium">
                <input type="checkbox" className="h-5 w-5" checked={smsOn} onChange={(e) => setSmsOn(e.target.checked)} />
                <MessageSquareText className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                {t("smsReminders")}
              </label>
              <p className="text-sm text-muted-foreground">{t("smsRemindersHint")}</p>
              <AnimatePresence initial={false}>
                {smsOn && (
                  <motion.p
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: reduceMotion ? 0 : 0.2, ease: "easeOut" }}
                    className={cn("overflow-hidden text-sm", smsReach === 0 ? "text-amber-700 dark:text-amber-400" : "text-foreground")}
                  >
                    {smsReach === 0 ? t("smsNoPhones") : t("smsReach", { count: smsReach, total: actionable.length })}
                  </motion.p>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Squared as part of the SMS edit (was rounded-xl). */}
          <div className="bg-muted/60 p-4 text-sm">
            {t("summary", { recipients: recipients.length, fields: fields.length })}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="button" size="lg" loading={pending} onClick={() => submit(true)}>{t("send")}</Button>
            <Button type="button" size="lg" variant="outline" loading={pending} onClick={() => submit(false)}>{t("saveDraft")}</Button>
            <Button type="button" size="lg" variant="ghost" onClick={() => setStep(1)}>{t("back")}</Button>
          </div>
        </div>
      )}
    </div>
  )
}
