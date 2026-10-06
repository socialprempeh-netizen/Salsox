"use client"

/**
 * The public "verify a document" form and its answer.
 *
 * A visitor types the verification code (or the document ID) printed on the
 * certificate page, or arrives from its QR code with the code already in the
 * URL. They may also drop the PDF they were given: it is hashed here, in the
 * browser, with SubtleCrypto, and only the SHA-256 fingerprint is sent, so the
 * server can say whether this exact file is the sealed copy without the file
 * ever leaving the device.
 *
 * Everything that decides the answer is on the server
 * (src/app/actions/verify.ts and src/lib/esign/verify.ts); this renders it.
 * Square corners and a single phone-first column, per the design rules. The
 * answer enters with a short framer-motion fade and the signers in a light
 * stagger, without the slide under prefers-reduced-motion.
 */
import { useId, useRef, useState, useTransition } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { useFormatter, useTranslations } from "next-intl"
import { BadgeCheck, FileCheck2, FileWarning, FileUp, SearchX, ShieldCheck, X } from "lucide-react"
import { verifyDocumentAction, type VerifyState } from "@/app/actions/verify"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

/** A sealed copy is a few MB at most; this only stops a wrong file from freezing a phone. */
const MAX_HASH_BYTES = 50 * 1024 * 1024

async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer())
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("")
}

export function VerifyForm({ initialQuery, initialState }: { initialQuery: string; initialState: VerifyState }) {
  const t = useTranslations("verify")
  const format = useFormatter()
  const reduceMotion = useReducedMotion()
  const inputId = useId()
  const fileInput = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState(initialQuery)
  const [file, setFile] = useState<{ name: string; sha256: string } | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [hashing, setHashing] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [state, setState] = useState<VerifyState>(initialState)
  const [pending, startTransition] = useTransition()

  async function chooseFile(candidate: File | null | undefined) {
    setFileError(null)
    if (!candidate) return
    if (candidate.type !== "application/pdf" && !candidate.name.toLowerCase().endsWith(".pdf")) {
      setFileError(t("fileNotPdf"))
      return
    }
    if (candidate.size > MAX_HASH_BYTES) {
      setFileError(t("fileTooLarge"))
      return
    }
    setHashing(true)
    try {
      setFile({ name: candidate.name, sha256: await sha256Hex(candidate) })
    } catch {
      setFileError(t("fileUnreadable"))
    } finally {
      setHashing(false)
    }
  }

  function clearFile() {
    setFile(null)
    setFileError(null)
    if (fileInput.current) fileInput.current.value = ""
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      setState(await verifyDocumentAction(query, file?.sha256))
    })
  }

  const inputError = state.status === "invalid" ? t("invalid") : state.status === "rateLimited" ? t("rateLimited") : null
  const longDate = (iso: string) =>
    format.dateTime(new Date(iso), { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "short" })
  const enter = { opacity: 0, y: reduceMotion ? 0 : 10 }

  return (
    <div className="space-y-8">
      <form onSubmit={submit} className="space-y-5 border border-border bg-card p-5 sm:p-6" noValidate>
        <div className="space-y-2">
          <Label htmlFor={inputId}>{t("inputLabel")}</Label>
          <Input
            id={inputId}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("inputPlaceholder")}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            aria-invalid={Boolean(inputError)}
            aria-describedby={`${inputId}-hint`}
            className="h-12 rounded-none font-mono text-base tracking-wider"
          />
          <p id={`${inputId}-hint`} className={cn("text-xs", inputError ? "text-destructive" : "text-muted-foreground")} role={inputError ? "alert" : undefined}>
            {inputError ?? t("inputHint")}
          </p>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">{t("fileLabel")}</p>
          {file ? (
            <div className="flex items-center gap-3 border border-primary/40 bg-primary/5 p-3">
              <FileCheck2 className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{file.name}</p>
                <p className="truncate font-mono text-[11px] text-muted-foreground">{file.sha256}</p>
              </div>
              <button type="button" onClick={clearFile} className="flex h-9 w-9 shrink-0 items-center justify-center text-muted-foreground hover:bg-secondary hover:text-foreground" aria-label={t("fileRemove")}>
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <label
              onDragOver={(e) => {
                e.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragging(false)
                void chooseFile(e.dataTransfer.files?.[0])
              }}
              className={cn(
                "flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1.5 border-2 border-dashed p-4 text-center transition-colors",
                dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
              )}
            >
              <FileUp className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
              <span className="text-sm font-medium">{hashing ? t("hashing") : t("filePick")}</span>
              <span className="text-xs text-muted-foreground">{t("fileHint")}</span>
              <input ref={fileInput} type="file" accept="application/pdf,.pdf" className="sr-only" onChange={(e) => void chooseFile(e.target.files?.[0])} />
            </label>
          )}
          {fileError && <p className="text-xs text-destructive" role="alert">{fileError}</p>}
        </div>

        <Button type="submit" size="lg" loading={pending} disabled={hashing || !query.trim()} className="w-full rounded-none sm:w-auto">
          <ShieldCheck className="h-4 w-4" /> {pending ? t("checking") : t("submit")}
        </Button>
      </form>

      <div aria-live="polite">
        <AnimatePresence mode="wait">
          {state.status === "notFound" && (
            <motion.div
              key="notFound"
              initial={enter}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="flex gap-3 border border-l-4 border-destructive/40 border-l-destructive bg-destructive/5 p-5"
            >
              <SearchX className="mt-0.5 h-6 w-6 shrink-0 text-destructive" aria-hidden="true" />
              <div className="min-w-0">
                <h2 className="font-semibold">{t("notFoundTitle")}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{t("notFoundBody")}</p>
              </div>
            </motion.div>
          )}

          {state.status === "verified" && (
            <motion.section
              key={`verified-${state.documentId}-${state.fileMatches ?? "none"}`}
              initial={enter}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="border border-border bg-card"
              aria-labelledby="verify-result"
            >
              <div className="flex gap-3 border-b border-l-4 border-border border-l-emerald-500 bg-emerald-500/5 p-5">
                <BadgeCheck className="mt-0.5 h-7 w-7 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                <div className="min-w-0">
                  <h2 id="verify-result" className="text-lg font-semibold">{t("verifiedTitle")}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{t("verifiedBody", { date: longDate(state.completedAt) })}</p>
                </div>
              </div>

              {state.fileMatches !== undefined && (
                <div
                  className={cn(
                    "flex gap-3 border-b border-border p-5",
                    state.fileMatches ? "bg-emerald-500/5" : "bg-amber-500/10"
                  )}
                  role={state.fileMatches ? undefined : "alert"}
                >
                  {state.fileMatches ? (
                    <FileCheck2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                  ) : (
                    <FileWarning className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{state.fileMatches ? t("fileMatchTitle") : t("fileMismatchTitle")}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">{state.fileMatches ? t("fileMatchBody") : t("fileMismatchBody")}</p>
                  </div>
                </div>
              )}

              <dl className="grid gap-4 border-b border-border p-5 text-sm sm:grid-cols-2">
                <div className="min-w-0">
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">{t("status")}</dt>
                  <dd className="mt-1 font-medium">{t("statusCompleted")}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">{t("completed")}</dt>
                  <dd className="mt-1 font-medium">{longDate(state.completedAt)}</dd>
                </div>
                {state.verificationCode && (
                  <div className="min-w-0">
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">{t("code")}</dt>
                    <dd className="mt-1 font-mono font-medium tracking-wider">{state.verificationCode}</dd>
                  </div>
                )}
                <div className="min-w-0">
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">{t("documentId")}</dt>
                  <dd className="mt-1 break-all font-mono text-xs">{state.documentId}</dd>
                </div>
              </dl>

              <div className="border-b border-border p-5">
                <h3 className="text-sm font-semibold">{t("signersTitle", { count: state.signers.length })}</h3>
                <ul className="mt-3 divide-y divide-border border border-border">
                  {state.signers.map((signer, i) => (
                    <motion.li
                      key={`${signer.name}-${i}`}
                      initial={enter}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.25, ease: "easeOut", delay: reduceMotion ? 0 : 0.08 + i * 0.05 }}
                      className="flex flex-col gap-1 p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">{signer.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {signer.email} · {signer.role === "APPROVER" ? t("roleApprover") : t("roleSigner")}
                        </p>
                      </div>
                      {signer.signedAt && (
                        <p className="shrink-0 text-xs text-muted-foreground">{t("signedOn", { date: longDate(signer.signedAt) })}</p>
                      )}
                    </motion.li>
                  ))}
                </ul>
              </div>

              <details className="group p-5 text-sm">
                <summary className="cursor-pointer font-medium marker:text-muted-foreground">{t("fingerprints")}</summary>
                <p className="mt-2 text-xs text-muted-foreground">{t("fingerprintsHint")}</p>
                <dl className="mt-3 space-y-3">
                  <div>
                    <dt className="text-xs text-muted-foreground">{t("sealedFingerprint")}</dt>
                    <dd className="mt-0.5 break-all font-mono text-xs">{state.sealedSha256}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">{t("originalFingerprint")}</dt>
                    <dd className="mt-0.5 break-all font-mono text-xs">{state.originalSha256}</dd>
                  </div>
                </dl>
              </details>
            </motion.section>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
