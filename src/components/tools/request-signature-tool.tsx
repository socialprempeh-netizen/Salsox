"use client"

/**
 * The free "request a signature" tool: prepare a signature request on the
 * public site, then send it with an account.
 *
 * The preparing half is real and local: the PDF is checked against the same
 * rules a sent document must meet (src/lib/esign/limits.ts), the signers'
 * addresses are parsed by the same function Quick Send uses
 * (parseEmailList), and the preview places fields with Quick Send's own
 * layout (autoPlaceFields), so what is shown is what will be sent.
 *
 * Sending needs an account, because a request is links, reminders and an
 * audit trail kept under the sender's name. The prepared request is saved on
 * this device (src/lib/request-draft.ts) and opened in Quick Send: directly
 * for a signed-in visitor, after signup for a new one (`next`, validated by
 * src/lib/safe-next.ts). The PDF is uploaded only when they press Send there.
 *
 * A free account sends one request from this tool in its lifetime
 * (FREE_REQUEST_TOOL_USES in plans.ts); Quick Send keeps its own monthly
 * allowance. A signed-in visitor who has used the tool sees the upgrade here,
 * before preparing anything, instead of a "Continue to send" that would end
 * at a refusal. A new visitor's first request is the free one.
 */
import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { ArrowRight, FileText, Lock, RefreshCcw, UserPlus } from "lucide-react"
import { PdfPages } from "@/components/esign/pdf-pages"
import { useSignedIn } from "@/components/landing/session-aware"
import { MAX_PDF_MB, pdfFileProblem } from "@/lib/esign/limits"
import { MAX_RECIPIENTS, parseEmailList } from "@/lib/esign/schemas"
import { autoPlaceFields, needsSignaturePage } from "@/lib/esign/quick-send"
import { saveRequestDraft } from "@/lib/request-draft"
import { track } from "@/lib/analytics"
import { requestToolUsesLeft } from "@/app/actions/documents"
import { PdfDrop, type PickedPdf } from "./pdf-drop"
import { Appear, ToolMotion } from "./tool-motion"

const QUICK_SEND_DRAFT = "/dashboard/documents/quick-send?draft=1"
const BILLING = "/dashboard/billing"

export function RequestSignatureTool() {
  const t = useTranslations("tools")
  const router = useRouter()
  const signedIn = useSignedIn()
  // Requests the signed-in visitor may still send from this tool: undefined until known
  // (or when signed out), null when their plan is unlimited.
  const [requestsLeft, setRequestsLeft] = useState<number | null | undefined>(undefined)
  useEffect(() => {
    if (!signedIn) return
    let live = true
    requestToolUsesLeft()
      .then((result) => live && setRequestsLeft(result ? result.left : undefined))
      // Unknown is treated as allowed: Quick Send and the engine still check.
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [signedIn])
  const limitReached = Boolean(signedIn) && requestsLeft === 0
  const [pdf, setPdf] = useState<PickedPdf | null>(null)
  const [pageCount, setPageCount] = useState(0)
  const [emails, setEmails] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const parsed = useMemo(() => parseEmailList(emails), [emails])
  const tooMany = parsed.emails.length > MAX_RECIPIENTS
  const fields = useMemo(() => (pageCount ? autoPlaceFields(pageCount, Math.min(parsed.emails.length, MAX_RECIPIENTS)) : []), [pageCount, parsed.emails.length])
  const ready = Boolean(pdf) && parsed.emails.length > 0 && parsed.invalid.length === 0 && !tooMany

  function fileCheck(file: File): string | null {
    const problem = pdfFileProblem(file)
    if (problem === "notPdf") return t("notPdf")
    if (problem === "tooLarge") return t("tooLarge", { mb: MAX_PDF_MB })
    return null
  }

  async function picked(file: PickedPdf) {
    setError(null)
    try {
      const { PDFDocument } = await import("pdf-lib")
      const doc = await PDFDocument.load(file.bytes)
      setPageCount(doc.getPageCount())
      setPdf(file)
      track("tool_opened", { tool: "request-signature" })
    } catch {
      setError(t("protected"))
    }
  }

  async function continueToSend() {
    if (!pdf || !ready) return
    setBusy(true)
    try {
      await saveRequestDraft({ name: pdf.name, bytes: pdf.bytes, emails: parsed.emails.map((e) => e.email).join("\n"), title: pdf.name.replace(/\.pdf$/i, "") })
      track("cta_clicked", { location: "tool:request-signature", target: signedIn ? "quick-send" : "signup" })
      router.push(signedIn ? QUICK_SEND_DRAFT : `/signup?next=${encodeURIComponent(QUICK_SEND_DRAFT)}`)
    } catch {
      setError(t("draftFailed"))
      setBusy(false)
    }
  }

  return (
    <ToolMotion>
      <div className="space-y-4">
        {limitReached && (
          <Appear id="limit">
            {/* A border colour accent again, now that globals.css's default
                border colour sits in @layer base. Was a bar while that rule
                outranked the utilities:
                className="relative flex ... border bg-card p-4 pl-5 ... sm:pl-6"
                <span aria-hidden="true" className="absolute inset-y-0 -left-px w-1 bg-primary" /> */}
            <div role="alert" className="flex flex-col gap-4 border border-l-4 border-l-primary bg-card p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
              <div className="flex min-w-0 gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center border border-primary/30 bg-primary/10 text-primary">
                  <Lock className="h-4 w-4" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">{t("limitTitle")}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{t("limitBody")}</p>
                </div>
              </div>
              <Link
                href={BILLING}
                onClick={() => track("cta_clicked", { location: "tool:request-signature", target: "billing" })}
                className="inline-flex h-11 shrink-0 items-center justify-center gap-1.5 bg-primary px-5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
              >
                {t("limitCta")}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </Appear>
        )}
        {!pdf ? (
          <PdfDrop onPicked={picked} check={fileCheck} hint={t("hintSend", { mb: MAX_PDF_MB })} />
        ) : (
          <div className="flex items-center justify-between gap-2 border border-border bg-card p-3">
            <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
              <FileText className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              <span className="truncate">{pdf.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{t("pages", { count: pageCount })}</span>
            </span>
            <button type="button" onClick={() => { setPdf(null); setPageCount(0) }} className="inline-flex h-9 shrink-0 items-center gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground">
              <RefreshCcw className="h-3.5 w-3.5" aria-hidden="true" /> {t("changeFile")}
            </button>
          </div>
        )}

        <div className="space-y-2">
          <label htmlFor="signers" className="text-sm font-medium">{t("signersLabel")}</label>
          <textarea
            id="signers"
            rows={3}
            inputMode="email"
            autoComplete="off"
            value={emails}
            onChange={(e) => setEmails(e.target.value)}
            placeholder={t("signersPlaceholder")}
            className="w-full border border-border bg-background px-3 py-2 text-base"
            aria-describedby="signers-hint"
          />
          <p id="signers-hint" className="text-xs text-muted-foreground" role={parsed.invalid.length || tooMany ? "alert" : undefined}>
            {parsed.invalid.length > 0 ? (
              <span className="text-destructive">{t("invalidEmails", { list: parsed.invalid.join(", ") })}</span>
            ) : tooMany ? (
              <span className="text-destructive">{t("tooManySigners", { max: MAX_RECIPIENTS })}</span>
            ) : (
              t("signersHint", { count: parsed.emails.length, max: MAX_RECIPIENTS })
            )}
          </p>
        </div>

        {pdf && fields.length > 0 && (
          <Appear id="preview" className="space-y-2">
            <p className="text-sm font-medium">{t("previewTitle")}</p>
            <p className="text-xs text-muted-foreground">{needsSignaturePage(parsed.emails.length) ? t("previewOwnPage") : t("previewLastPage")}</p>
            <div className="max-h-[70vh] overflow-y-auto border border-border p-2">
              <PdfPages
                data={pdf.bytes}
                extraPages={needsSignaturePage(parsed.emails.length) ? 1 : 0}
                renderOverlay={(page) => (
                  <div className="absolute inset-0">
                    {fields
                      .filter((f) => f.page === page)
                      .map((f, i) => (
                        <div
                          key={i}
                          className="absolute flex items-center overflow-hidden border-2 border-dashed border-primary bg-primary/10 px-1 text-[10px] font-medium text-primary-hover sm:text-xs"
                          style={{ left: `${f.x}%`, top: `${f.y}%`, width: `${f.width}%`, height: `${f.height}%` }}
                        >
                          <span className="truncate">
                            {f.type === "SIGNATURE" ? t("previewSignature", { who: parsed.emails[f.recipientIndex]?.email ?? "" }) : t("previewDate")}
                          </span>
                        </div>
                      ))}
                  </div>
                )}
              />
            </div>
          </Appear>
        )}

        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}

        {/* Hidden once the free request is used: the upgrade above is the way on. */}
        {!limitReached && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <button type="button" disabled={!ready || busy} onClick={() => void continueToSend()} className="inline-flex h-12 w-full items-center justify-center gap-2 bg-primary px-6 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50 sm:w-auto">
              {signedIn ? <ArrowRight className="h-4 w-4" aria-hidden="true" /> : <UserPlus className="h-4 w-4" aria-hidden="true" />}
              {signedIn ? t("continueToSend") : t("signUpToSend")}
            </button>
            {!signedIn && <p className="text-xs text-muted-foreground">{t("freeSends")}</p>}
          </div>
        )}
      </div>
    </ToolMotion>
  )
}
