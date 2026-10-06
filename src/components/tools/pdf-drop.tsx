"use client"

/**
 * The first thing every free tool shows: a large target to choose or drop a
 * PDF, sized to sit above the fold on a phone. The file is read into memory
 * here and handed to the tool; nothing is uploaded.
 *
 * `check` decides what is acceptable (local tools allow 25 MB, the request
 * tool the 4 MB a sent document may be), and its problem is shown in place.
 */
import { useEffect, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { FileUp } from "lucide-react"
import { cn } from "@/lib/utils"

export type PickedPdf = { name: string; bytes: Uint8Array }

export function PdfDrop({
  onPicked,
  check,
  hint,
}: {
  onPicked: (pdf: PickedPdf) => void
  check: (file: File) => string | null
  hint: string
}) {
  const t = useTranslations("tools")
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reading, setReading] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)

  // The picker is in the server-rendered HTML, so on a slow phone someone can
  // choose a file before the page has hydrated, and that change event is never
  // delivered. Pick up a file already sitting in the input once it has.
  useEffect(() => {
    const pending = inputRef.current?.files?.[0]
    if (pending) void accept(pending)
    // Once, on hydration.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function accept(file: File | undefined) {
    setError(null)
    if (!file) return
    const problem = check(file)
    if (problem) return setError(problem)
    setReading(true)
    try {
      onPicked({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) })
    } catch {
      setError(t("unreadable"))
    } finally {
      setReading(false)
    }
  }

  return (
    <div>
      <label
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          void accept(e.dataTransfer.files?.[0])
        }}
        className={cn(
          "flex min-h-44 cursor-pointer flex-col items-center justify-center gap-2 border-2 border-dashed bg-card p-6 text-center transition-colors sm:min-h-52",
          dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
        )}
      >
        <FileUp className="h-9 w-9 text-primary" aria-hidden="true" />
        <span className="text-base font-semibold">{reading ? t("reading") : t("choosePdf")}</span>
        <span className="text-sm text-muted-foreground">{hint}</span>
        <input ref={inputRef} type="file" accept="application/pdf,.pdf" className="sr-only" onChange={(e) => void accept(e.target.files?.[0])} />
      </label>
      {error && (
        <p className="mt-2 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
