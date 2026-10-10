"use client"

/**
 * Renders a PDF as a vertical stack of page images, each with an overlay slot
 * for fields, used by both the field editor and the signing view.
 *
 * - pdf.js (Apache-2.0) is loaded lazily in the browser, never on the server.
 * - Pages render at the container's width × devicePixelRatio, so text stays
 *   sharp on phones without rendering a desktop-sized bitmap.
 * - Pages are only rendered when they scroll near the viewport, which keeps a
 *   long contract usable on a low-end phone.
 * - `extraPages` adds blank pages after the PDF's own (Quick Send may place a
 *   signature block on an appended page that only exists after sealing).
 *
 * Overlays are positioned in percentages (see src/lib/esign/pdf/coords.ts), so
 * they line up at any rendered size with no recalculation.
 */
import { useEffect, useRef, useState, type ReactNode } from "react"
import type { PDFDocumentProxy } from "pdfjs-dist"
import { useTranslations } from "next-intl"
import { Spinner } from "@/components/ui/spinner"

type Props = {
  /** Where to fetch the PDF from. Either this or `data`. */
  url?: string
  /**
   * The PDF's bytes, for a file the visitor opened locally (the free tools).
   * Passed straight to pdf.js, so nothing is fetched: a blob: URL would need
   * the Content-Security-Policy to allow blob: connections.
   */
  data?: Uint8Array
  extraPages?: number
  renderOverlay?: (page: number) => ReactNode
  /** Called with the page element so callers can convert pointer positions. */
  onPageRef?: (page: number, el: HTMLDivElement | null) => void
  /**
   * Told when the document has loaded, and when loading it or drawing a page
   * fails. The viewer shows an error text or a blank page either way; these
   * let a caller report it (the signing page sends it to Sentry). Optional,
   * so the free tools and the editor are unchanged.
   */
  onLoaded?: (pages: number) => void
  onLoadError?: (error: unknown) => void
  onRenderError?: (error: unknown, page: number) => void
  className?: string
}

/**
 * Starts loading; the returned task is what gets destroyed on unmount.
 *
 * pdf.js's legacy build, not its default one. The default build calls the
 * newest built-ins (Promise.try, Math.sumPrecise, Map.getOrInsertComputed,
 * URL.parse) with no fallback, and the in-app browsers that open links from
 * email apps (Gmail's above all) run an engine a release or more behind the
 * phone's own browser. There the PDF never loaded: "Promise.try is not a
 * function", and a signing link that opened fine when pasted into Chrome
 * showed only an error when tapped in Gmail. The legacy build carries
 * polyfills for exactly those calls. Was:
 *   const pdfjs = await import("pdfjs-dist")
 *   pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString()
 */
async function loadPdf(source: { url?: string; data?: Uint8Array }) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs")
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString()
  // pdf.js takes ownership of (detaches) the buffer it is given, so it gets a
  // copy and the caller's bytes stay usable for signing.
  return source.data ? pdfjs.getDocument({ data: source.data.slice() }) : pdfjs.getDocument({ url: source.url! })
}

export function PdfPages({ url, data, extraPages = 0, renderOverlay, onPageRef, onLoaded, onLoadError, onRenderError, className }: Props) {
  const t = useTranslations("esign.viewer")
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null)
  const [error, setError] = useState(false)
  // Aspect ratio (height / width) of each page, known before it renders so the
  // stack does not jump as pages come in.
  const [ratios, setRatios] = useState<number[]>([])

  useEffect(() => {
    let cancelled = false
    let task: Awaited<ReturnType<typeof loadPdf>> | null = null
    loadPdf({ url, data })
      .then(async (loadingTask) => {
        task = loadingTask
        const loaded = await loadingTask.promise
        const sizes = await Promise.all(
          Array.from({ length: loaded.numPages }, async (_, i) => {
            const vp = (await loaded.getPage(i + 1)).getViewport({ scale: 1 })
            return vp.height / vp.width
          })
        )
        if (!cancelled) {
          setRatios(sizes)
          setPdf(loaded)
          onLoaded?.(loaded.numPages)
        }
      })
      // Was `.catch(() => !cancelled && setError(true))`: the failure was shown
      // and never reported.
      .catch((reason: unknown) => {
        if (cancelled) return
        setError(true)
        onLoadError?.(reason)
      })
    return () => {
      cancelled = true
      void task?.destroy()
    }
    // The callbacks are reporting hooks; a new one must not reload the PDF.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, data])

  if (error) return <p className="border p-6 text-center text-sm text-destructive">{t("loadError")}</p>
  if (!pdf) {
    return (
      <div className="flex items-center justify-center gap-2 border p-10 text-sm text-muted-foreground">
        <Spinner /> {t("loading")}
      </div>
    )
  }

  const total = pdf.numPages + extraPages
  const lastRatio = ratios[ratios.length - 1] ?? 1.414
  return (
    <div className={className ?? "space-y-4"}>
      {Array.from({ length: total }, (_, i) => (
        <PdfPage
          key={i}
          pdf={pdf}
          pageNumber={i + 1}
          ratio={ratios[i] ?? lastRatio}
          blank={i >= pdf.numPages}
          overlay={renderOverlay?.(i + 1)}
          onRef={(el) => onPageRef?.(i + 1, el)}
          onRenderError={onRenderError}
          label={t("page", { page: i + 1, total })}
        />
      ))}
    </div>
  )
}

function PdfPage({
  pdf,
  pageNumber,
  ratio,
  blank,
  overlay,
  onRef,
  onRenderError,
  label,
}: {
  pdf: PDFDocumentProxy
  pageNumber: number
  ratio: number
  blank: boolean
  overlay?: ReactNode
  onRef: (el: HTMLDivElement | null) => void
  onRenderError?: (error: unknown, page: number) => void
  label: string
}) {
  const wrapper = useRef<HTMLDivElement | null>(null)
  const canvas = useRef<HTMLCanvasElement | null>(null)
  // No IntersectionObserver (an old embedded browser): every page counts as
  // visible from the start, so all are drawn rather than none. Slower on a
  // long document, but never blank. Only effects read this, so the server's
  // value cannot cause a hydration mismatch.
  const [visible, setVisible] = useState(() => typeof IntersectionObserver !== "function")

  // Render only once the page is near the viewport.
  useEffect(() => {
    const el = wrapper.current
    if (!el || blank || typeof IntersectionObserver !== "function") return
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setVisible(true), {
      rootMargin: "600px 0px",
    })
    io.observe(el)
    return () => io.disconnect()
  }, [blank])

  useEffect(() => {
    if (!visible || blank) return
    let task: { cancel: () => void } | null = null
    let cancelled = false
    ;(async () => {
      const page = await pdf.getPage(pageNumber)
      const el = wrapper.current
      const target = canvas.current
      if (!el || !target || cancelled) return
      const cssWidth = el.clientWidth
      const scale = (cssWidth / page.getViewport({ scale: 1 }).width) * Math.min(window.devicePixelRatio || 1, 2)
      const viewport = page.getViewport({ scale })
      target.width = Math.floor(viewport.width)
      target.height = Math.floor(viewport.height)
      const render = page.render({ canvas: target, viewport })
      task = render
      await render.promise
    })().catch((reason: unknown) => {
      // Cancelling a render (scrolled away, unmounted) rejects too: not a
      // failure. Anything else left the page blank and used to go unreported;
      // on iOS that includes running out of canvas memory on a long document.
      // Was: await render.promise.catch(() => undefined)
      if (cancelled || (reason as { name?: string } | null)?.name === "RenderingCancelledException") return
      onRenderError?.(reason, pageNumber)
    })
    return () => {
      cancelled = true
      task?.cancel()
    }
    // onRenderError only reports; a new one must not redraw the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, blank, pdf, pageNumber])

  return (
    <div
      ref={(el) => {
        wrapper.current = el
        onRef(el)
      }}
      role="img"
      aria-label={label}
      data-page={pageNumber}
      className="relative w-full overflow-hidden border bg-white shadow-sm"
      style={{ aspectRatio: `1 / ${ratio}` }}
    >
      {!blank && <canvas ref={canvas} className="absolute inset-0 h-full w-full" />}
      {overlay}
    </div>
  )
}
