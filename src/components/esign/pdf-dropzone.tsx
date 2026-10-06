"use client"

/**
 * A PDF picker that works as a drop target on desktop and a big tappable
 * button on phones (where "drag and drop" means nothing). Shows the chosen
 * file's name and rejects non-PDFs and oversize files before any upload.
 */
import { useEffect, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { FileUp, FileText } from "lucide-react"
import { cn } from "@/lib/utils"
import { MAX_PDF_MB, pdfFileProblem } from "@/lib/esign/limits"

// Replaced by MAX_PDF_BYTES from src/lib/esign/limits.ts, the value the
// server checks, instead of a copy kept equal by hand.
// /** Kept in sync with MAX_PDF_BYTES on the server (src/lib/esign/pdf/inspect.ts). */
// const MAX_BYTES = 4 * 1024 * 1024

export function PdfDropzone({
  name = "file",
  onFile,
  initialFile,
}: {
  name?: string
  onFile?: (file: File | null) => void
  /**
   * A file to start with: a request prepared on the public request-a-signature
   * tool and handed to Quick Send (src/lib/request-draft.ts). Goes through the
   * same checks as a chosen file, and into the real input, so the form submits it.
   */
  initialFile?: File | null
}) {
  const t = useTranslations("esign.upload")
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (initialFile) accept(initialFile, inputRef.current)
    // Once per handed-over file; `accept` is stable in behaviour.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFile])

  // Replaced: a dropped file was copied into the input before this ran, and
  // the rejection paths cleared the input only when one was passed, which
  // the drop handler never did. An oversize drop stayed in the form, the
  // message showed, and submitting sent it anyway: past the server-action
  // body limit, Next throws a raw error instead of returning ours. A
  // rejection also left the previously chosen file on screen while the input
  // held nothing, or something else.
  // function accept(candidate: File | null | undefined, input?: HTMLInputElement) {
  //   setError(null)
  //   if (!candidate) return
  //   if (candidate.type !== "application/pdf" && !candidate.name.toLowerCase().endsWith(".pdf")) {
  //     setError(t("notPdf"))
  //     if (input) input.value = ""
  //     return
  //   }
  //   if (candidate.size > MAX_PDF_BYTES) {
  //     setError(t("tooLarge", { maxMb: MAX_PDF_MB }))
  //     if (input) input.value = ""
  //     return
  //   }
  //   setFile(candidate)
  //   onFile?.(candidate)
  // }

  /**
   * The one way a file gets into the form, for both the picker and a drop.
   * A rejected file never reaches the input, and the input, what the box
   * shows and the parent's `onFile` are cleared together, so the form cannot
   * submit a file the screen says was refused.
   */
  function accept(candidate: File | null | undefined, input: HTMLInputElement | null) {
    setError(null)
    if (!candidate) return
    const problem = pdfFileProblem(candidate)
    if (problem) {
      setError(problem === "tooLarge" ? t("tooLarge", { maxMb: MAX_PDF_MB }) : t("notPdf"))
      if (input) input.value = ""
      setFile(null)
      onFile?.(null)
      return
    }
    if (input && input.files?.[0] !== candidate) {
      // A dropped file: put it into the real input so the form submits it.
      const dt = new DataTransfer()
      dt.items.add(candidate)
      input.files = dt.files
    }
    setFile(candidate)
    onFile?.(candidate)
  }

  return (
    <div className="space-y-2">
      <label
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          // Validated first: the file only reaches the input if accepted
          // (it used to be copied in here, before any check).
          accept(e.dataTransfer.files?.[0], e.currentTarget.querySelector("input"))
        }}
        className={cn(
          // Square, per the design rules (was rounded-2xl).
          "flex min-h-40 cursor-pointer flex-col items-center justify-center gap-2 border-2 border-dashed p-6 text-center transition-colors",
          dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
        )}
      >
        {file ? (
          <>
            <FileText className="h-8 w-8 text-primary" />
            <span className="max-w-full truncate font-medium">{file.name}</span>
            <span className="text-xs text-muted-foreground">{t("replace")}</span>
          </>
        ) : (
          <>
            <FileUp className="h-8 w-8 text-muted-foreground" />
            <span className="font-medium">{t("pick")}</span>
            <span className="text-xs text-muted-foreground">{t("limits", { maxMb: MAX_PDF_MB })}</span>
          </>
        )}
        <input
          type="file"
          ref={inputRef}
          name={name}
          accept="application/pdf,.pdf"
          required
          className="sr-only"
          onChange={(e) => accept(e.target.files?.[0], e.target)}
        />
      </label>
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
    </div>
  )
}
