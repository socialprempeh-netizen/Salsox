"use client"

/**
 * A PDF picker that works as a drop target on desktop and a big tappable
 * button on phones (where "drag and drop" means nothing). Shows the chosen
 * file's name and rejects non-PDFs and oversize files before any upload.
 */
import { useState } from "react"
import { useTranslations } from "next-intl"
import { FileUp, FileText } from "lucide-react"
import { cn } from "@/lib/utils"

/** Kept in sync with MAX_PDF_BYTES on the server (src/lib/esign/pdf/inspect.ts). */
const MAX_BYTES = 4 * 1024 * 1024

export function PdfDropzone({ name = "file", onFile }: { name?: string; onFile?: (file: File | null) => void }) {
  const t = useTranslations("esign.upload")
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  function accept(candidate: File | null | undefined, input?: HTMLInputElement) {
    setError(null)
    if (!candidate) return
    if (candidate.type !== "application/pdf" && !candidate.name.toLowerCase().endsWith(".pdf")) {
      setError(t("notPdf"))
      if (input) input.value = ""
      return
    }
    if (candidate.size > MAX_BYTES) {
      setError(t("tooLarge"))
      if (input) input.value = ""
      return
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
          const dropped = e.dataTransfer.files?.[0]
          const input = e.currentTarget.querySelector("input")
          if (dropped && input) {
            // Put the dropped file into the real input so the form submits it.
            const dt = new DataTransfer()
            dt.items.add(dropped)
            input.files = dt.files
          }
          accept(dropped)
        }}
        className={cn(
          "flex min-h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-6 text-center transition-colors",
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
            <span className="text-xs text-muted-foreground">{t("limits")}</span>
          </>
        )}
        <input
          type="file"
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
