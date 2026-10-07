"use client"

/**
 * The mobile-first signing experience.
 *
 * Designed for a phone first and a desktop second:
 *   1. A short intro with the electronic-signature consent (one tap).
 *   2. The document, with this signer's fields highlighted. A sticky bottom
 *      bar always says what to do next ("Next field", "Finish", "Pay and
 *      finish") and jumps to the next empty required field, so nobody hunts
 *      through a 12-page PDF for the one box they missed.
 *   3. Each field opens in a bottom sheet sized for a thumb: signature pad,
 *      text, date or checkbox. The first signature is remembered and applied
 *      to later signature fields with one tap.
 *   4. Finish, or pay then finish (Sign & Pay), in the same flow.
 *
 * Every field is saved as soon as it is filled, so a phone that loses signal
 * or a tab that is closed loses nothing; reopening the link resumes.
 */
import { useMemo, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { Check, ChevronLeft, ChevronRight, PenLine } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { toast } from "@/components/ui/sonner"
import { cn } from "@/lib/utils"
import { PdfPages } from "./pdf-pages"
import { SignaturePad, type SignatureValue } from "./signature-pad"
import {
  completeSigningAction,
  rejectSigningAction,
  saveFieldAction,
  startPaymentAction,
} from "@/app/actions/signing"

export type WizardField = {
  id: string
  type: "SIGNATURE" | "INITIALS" | "NAME" | "EMAIL" | "DATE" | "TEXT" | "CHECKBOX"
  page: number
  x: number
  y: number
  width: number
  height: number
  required: boolean
  label: string | null
  value: string | null
  inserted: boolean
  preview: string | null // image data URL or typed text of a saved signature
}

type Props = {
  token: string
  title: string
  senderName: string
  recipientName: string
  recipientEmail: string
  fileUrl: string
  extraPages: number
  fields: WizardField[]
  payment: { due: boolean; amountLabel: string | null }
  alreadyViewedIntro: boolean
}

function todayLabel(): string {
  return new Date().toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
}

export function SigningWizard(props: Props) {
  const t = useTranslations("esign.sign")
  const router = useRouter()
  const [started, setStarted] = useState(props.alreadyViewedIntro)
  const [consent, setConsent] = useState(false)
  const [fields, setFields] = useState(props.fields)
  const [active, setActive] = useState<WizardField | null>(null)
  const [adopted, setAdopted] = useState<SignatureValue | null>(null)
  const [draft, setDraft] = useState<SignatureValue | null>(null)
  const [text, setText] = useState("")
  const [declineOpen, setDeclineOpen] = useState(false)
  const [reason, setReason] = useState("")
  const [pending, startTransition] = useTransition()
  const pageEls = useRef(new Map<number, HTMLDivElement>())

  const required = useMemo(() => fields.filter((f) => f.required), [fields])
  const doneCount = required.filter((f) => f.inserted).length
  const nextEmpty = required.find((f) => !f.inserted) ?? null
  const allDone = nextEmpty === null

  function scrollToField(field: WizardField) {
    const el = document.getElementById(`field-${field.id}`)
    el?.scrollIntoView({ behavior: "smooth", block: "center" })
  }

  function open(field: WizardField) {
    setActive(field)
    setDraft(null)
    // Prefill what we already know: the signer's name, email, today's date.
    setText(
      field.value ??
        (field.type === "NAME"
          ? props.recipientName
          : field.type === "EMAIL"
            ? props.recipientEmail
            : field.type === "DATE"
              ? todayLabel()
              : "")
    )
  }

  function goNext() {
    if (!nextEmpty) return
    scrollToField(nextEmpty)
    // Give the scroll a moment so the sheet opens over the right spot.
    window.setTimeout(() => open(nextEmpty), 250)
  }

  function save(field: WizardField, input: { value?: string; imageDataUrl?: string; typedText?: string }) {
    startTransition(async () => {
      const result = await saveFieldAction(props.token, field.id, input)
      if (result.error) {
        toast.error(result.error)
        return
      }
      const preview = input.imageDataUrl ?? input.typedText ?? null
      setFields((prev) =>
        prev.map((f) => (f.id === field.id ? { ...f, inserted: true, value: input.value ?? f.value, preview: preview ?? f.preview } : f))
      )
      // Remember a full signature for one-tap reuse (initials are kept apart).
      if (field.type === "SIGNATURE") {
        setAdopted({ imageDataUrl: input.imageDataUrl, typedText: input.typedText })
      }
      setActive(null)
    })
  }

  function finish() {
    startTransition(async () => {
      if (props.payment.due) {
        const pay = await startPaymentAction(props.token)
        if (pay.url) {
          window.location.href = pay.url
          return
        }
        toast.error(pay.error ?? t("genericError"))
        return
      }
      const result = await completeSigningAction(props.token)
      if (result.error) {
        toast.error(result.error)
        return
      }
      router.refresh()
    })
  }

  function decline() {
    startTransition(async () => {
      const result = await rejectSigningAction(props.token, reason)
      if (result.error) {
        toast.error(result.error)
        return
      }
      setDeclineOpen(false)
      router.refresh()
    })
  }

  // ── Intro ────────────────────────────────────────────────────────────────
  if (!started) {
    return (
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
        <div className="space-y-2">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary-hover">
            <PenLine className="h-6 w-6" />
          </span>
          <h1 className="text-2xl font-bold leading-tight">{props.title}</h1>
          <p className="text-muted-foreground">{t("introBody", { sender: props.senderName })}</p>
        </div>
        <ol className="space-y-2 text-sm">
          <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />{t("introStep1", { count: required.length })}</li>
          {props.payment.due && props.payment.amountLabel && (
            <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />{t("introStepPay", { amount: props.payment.amountLabel })}</li>
          )}
          <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />{t("introStep2")}</li>
        </ol>
        <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--primary)]"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />
          <span>{t("consent")}</span>
        </label>
        <Button size="lg" className="w-full" disabled={!consent} onClick={() => setStarted(true)}>
          {t("start")}
        </Button>
        <button type="button" className="min-h-11 text-sm text-muted-foreground underline" onClick={() => setDeclineOpen(true)}>
          {t("decline")}
        </button>
        {declineDialog()}
      </div>
    )
  }

  // ── Document + fields ────────────────────────────────────────────────────
  return (
    <div className="min-h-[100dvh] bg-muted/40">
      <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{props.title}</p>
            <p className="text-xs text-muted-foreground">{t("progress", { done: doneCount, total: required.length })}</p>
          </div>
          <button type="button" className="min-h-11 shrink-0 px-2 text-xs text-muted-foreground underline" onClick={() => setDeclineOpen(true)}>
            {t("decline")}
          </button>
        </div>
        <div className="h-1 bg-muted" aria-hidden>
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${required.length ? (doneCount / required.length) * 100 : 100}%` }}
          />
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-2 pb-32 pt-4 sm:px-4">
        <PdfPages
          url={props.fileUrl}
          extraPages={props.extraPages}
          onPageRef={(page, el) => (el ? pageEls.current.set(page, el) : pageEls.current.delete(page))}
          renderOverlay={(page) =>
            fields
              .filter((f) => f.page === page)
              .map((f) => (
                <button
                  key={f.id}
                  id={`field-${f.id}`}
                  type="button"
                  onClick={() => open(f)}
                  aria-label={t(`fieldType.${f.type}`)}
                  className={cn(
                    "absolute flex items-center justify-center overflow-hidden rounded-sm border-2 text-[10px] font-medium transition-colors sm:text-xs",
                    f.inserted
                      ? "border-primary/40 bg-primary/5 text-foreground"
                      : "animate-pulse border-amber-500 bg-amber-300/30 text-amber-900",
                    nextEmpty?.id === f.id && "ring-2 ring-amber-500 ring-offset-1"
                  )}
                  style={{ left: `${f.x}%`, top: `${f.y}%`, width: `${f.width}%`, height: `${f.height}%` }}
                >
                  {f.inserted ? <FieldPreview field={f} /> : <span className="truncate px-1">{f.label || t(`fieldType.${f.type}`)}{f.required ? " *" : ""}</span>}
                </button>
              ))
          }
        />
      </main>

      {/* The one control that always says what to do next. Sits above the
          phone's home indicator via the safe-area inset. */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          {allDone ? (
            <Button size="lg" className="w-full" loading={pending} onClick={finish}>
              {props.payment.due && props.payment.amountLabel ? t("payAndFinish", { amount: props.payment.amountLabel }) : t("finish")}
            </Button>
          ) : (
            <>
              <p className="hidden flex-1 text-sm text-muted-foreground sm:block">{t("remaining", { count: required.length - doneCount })}</p>
              <Button size="lg" className="w-full sm:w-auto" onClick={goNext}>
                {doneCount === 0 ? t("startSigning") : t("nextField")} <ChevronRight className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </div>

      <Sheet open={active !== null} onOpenChange={(o) => !o && setActive(null)}>
        <SheetContent side="bottom" className="max-h-[90dvh] overflow-y-auto rounded-t-2xl pb-[max(1rem,env(safe-area-inset-bottom))]">
          {active && (
            <div className="mx-auto w-full max-w-lg space-y-4">
              <SheetHeader>
                <SheetTitle>{active.label || t(`fieldType.${active.type}`)}</SheetTitle>
                <SheetDescription>{t(`fieldHint.${active.type}`)}</SheetDescription>
              </SheetHeader>
              {fieldEditor(active)}
            </div>
          )}
        </SheetContent>
      </Sheet>
      {declineDialog()}
    </div>
  )

  function fieldEditor(field: WizardField) {
    if (field.type === "SIGNATURE" || field.type === "INITIALS") {
      const canReuse = field.type === "SIGNATURE" && adopted && !draft
      return (
        <div className="space-y-4">
          {canReuse && (
            <div className="space-y-2 rounded-xl border p-3">
              <p className="text-sm text-muted-foreground">{t("reuseSignature")}</p>
              <div className="flex h-20 items-center justify-center rounded-lg bg-white">
                <SignaturePreview value={adopted!} />
              </div>
              <Button className="w-full" size="lg" loading={pending} onClick={() => save(field, adopted as { imageDataUrl?: string; typedText?: string })}>
                {t("applySignature")}
              </Button>
            </div>
          )}
          <SignaturePad defaultName={props.recipientName} initials={field.type === "INITIALS"} onChange={setDraft} />
          <Button className="w-full" size="lg" disabled={!draft} loading={pending} onClick={() => draft && save(field, draft as { imageDataUrl?: string; typedText?: string })}>
            {t("adopt")}
          </Button>
          <p className="text-center text-xs text-muted-foreground">{t("adoptLegal")}</p>
        </div>
      )
    }
    if (field.type === "CHECKBOX") {
      return (
        <div className="grid grid-cols-2 gap-3">
          <Button size="lg" variant="outline" loading={pending} onClick={() => save(field, { value: "false" })}>{t("uncheck")}</Button>
          <Button size="lg" loading={pending} onClick={() => save(field, { value: "true" })}>{t("check")}</Button>
        </div>
      )
    }
    return (
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (text.trim()) save(field, { value: text.trim() })
        }}
      >
        <Input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          type={field.type === "EMAIL" ? "email" : "text"}
          inputMode={field.type === "EMAIL" ? "email" : "text"}
          maxLength={field.type === "TEXT" ? 500 : 200}
          className="h-12 text-base"
          aria-label={field.label || t(`fieldType.${field.type}`)}
        />
        <Button type="submit" size="lg" className="w-full" disabled={!text.trim()} loading={pending}>
          {t("save")}
        </Button>
      </form>
    )
  }

  function declineDialog() {
    return (
      <Dialog open={declineOpen} onOpenChange={setDeclineOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("declineTitle")}</DialogTitle>
            <DialogDescription>{t("declineBody", { sender: props.senderName })}</DialogDescription>
          </DialogHeader>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder={t("declinePlaceholder")} />
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeclineOpen(false)}>
              <ChevronLeft className="h-4 w-4" /> {t("declineCancel")}
            </Button>
            <Button variant="destructive" loading={pending} onClick={decline}>{t("declineConfirm")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }
}

function SignaturePreview({ value }: { value: SignatureValue }) {
  if (value.imageDataUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={value.imageDataUrl} alt="" className="max-h-full max-w-full object-contain" />
  }
  return <span className="font-serif text-2xl italic text-slate-900">{value.typedText}</span>
}

function FieldPreview({ field }: { field: WizardField }) {
  if (field.type === "SIGNATURE" || field.type === "INITIALS") {
    if (field.preview?.startsWith("data:")) {
      // eslint-disable-next-line @next/next/no-img-element
      return <img src={field.preview} alt="" className="h-full w-full object-contain" />
    }
    return <span className="truncate px-1 font-serif italic text-slate-900">{field.preview}</span>
  }
  if (field.type === "CHECKBOX") return <span className="text-slate-900">{field.value === "true" ? "✕" : ""}</span>
  return <span className="truncate px-1 text-slate-900">{field.value}</span>
}
