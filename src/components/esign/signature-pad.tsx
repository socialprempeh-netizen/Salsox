"use client"

/**
 * Signature capture with three modes: draw (finger, stylus or mouse), type,
 * or upload an image. Built on perfect-freehand (MIT) for natural-looking,
 * pressure-sensitive strokes.
 *
 * Output is either a PNG data URL (draw, upload) or plain text (type), which
 * is exactly what `saveField` accepts. Uploaded images are downscaled to at
 * most 600px wide and re-encoded as PNG in the browser, so a 12 MP phone photo
 * does not become a 5 MB signature.
 *
 * The drawing canvas uses `touch-action: none` so drawing never scrolls the
 * page on phones, the single most common failure of mobile signing pads.
 */
import { useEffect, useRef, useState } from "react"
import { getStroke } from "perfect-freehand"
import { useTranslations } from "next-intl"
import { Eraser, ImageUp, PenLine, Type } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

export type SignatureValue = { imageDataUrl?: string; typedText?: string }

type Mode = "draw" | "type" | "upload"
type Point = [number, number, number]

/** SVG-style path from perfect-freehand's outline points, drawn onto a canvas. */
function strokeToPath(stroke: number[][]): Path2D {
  const path = new Path2D()
  if (stroke.length === 0) return path
  path.moveTo(stroke[0][0], stroke[0][1])
  for (let i = 1; i < stroke.length; i++) {
    const [x0, y0] = stroke[i - 1]
    const [x1, y1] = stroke[i]
    path.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2)
  }
  path.closePath()
  return path
}

async function downscaleImage(file: File, maxWidth = 600): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = reject
      el.src = url
    })
    const scale = Math.min(1, maxWidth / img.width)
    const canvas = document.createElement("canvas")
    canvas.width = Math.round(img.width * scale)
    canvas.height = Math.round(img.height * scale)
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL("image/png")
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function SignaturePad({
  defaultName,
  initials = false,
  onChange,
}: {
  defaultName: string
  initials?: boolean
  onChange: (value: SignatureValue | null) => void
}) {
  const t = useTranslations("esign.signature")
  const [mode, setMode] = useState<Mode>("draw")
  const [typed, setTyped] = useState(
    initials
      ? defaultName
          .split(/\s+/)
          .map((p) => p.charAt(0).toUpperCase())
          .join("")
      : defaultName
  )
  const [uploaded, setUploaded] = useState<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const strokes = useRef<Point[][]>([])
  const current = useRef<Point[] | null>(null)
  const [hasInk, setHasInk] = useState(false)

  // Resize the backing store to the element's size × DPR for crisp strokes.
  useEffect(() => {
    if (mode !== "draw") return
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = canvas.clientWidth * dpr
    canvas.height = canvas.clientHeight * dpr
    redraw()
  }, [mode])

  // Report the current value whenever the source of truth changes. `onChange`
  // is deliberately not a dependency: parents pass an inline setter, and
  // re-running on every render would report the same value in a loop.
  useEffect(() => {
    if (mode === "type") onChange(typed.trim() ? { typedText: typed.trim() } : null)
    if (mode === "upload") onChange(uploaded ? { imageDataUrl: uploaded } : null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, typed, uploaded])

  function redraw() {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = "#0f172a"
    const size = Math.max(3, canvas.width / 110)
    for (const points of [...strokes.current, ...(current.current ? [current.current] : [])]) {
      ctx.fill(strokeToPath(getStroke(points, { size, thinning: 0.6, smoothing: 0.5, streamline: 0.5 })))
    }
  }

  function point(e: React.PointerEvent<HTMLCanvasElement>): Point {
    const canvas = e.currentTarget
    const rect = canvas.getBoundingClientRect()
    return [
      ((e.clientX - rect.left) / rect.width) * canvas.width,
      ((e.clientY - rect.top) / rect.height) * canvas.height,
      e.pressure || 0.5,
    ]
  }

  function exportDrawing() {
    const canvas = canvasRef.current
    if (!canvas || strokes.current.length === 0) return onChange(null)
    onChange({ imageDataUrl: canvas.toDataURL("image/png") })
  }

  const tabs: { mode: Mode; label: string; icon: typeof PenLine }[] = [
    { mode: "draw", label: t("draw"), icon: PenLine },
    { mode: "type", label: t("type"), icon: Type },
    { mode: "upload", label: t("upload"), icon: ImageUp },
  ]

  return (
    <div className="space-y-3">
      <div role="tablist" className="grid grid-cols-3 gap-1 rounded-full bg-muted p-1">
        {tabs.map(({ mode: m, label, icon: Icon }) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={cn(
              "flex min-h-11 items-center justify-center gap-1.5 rounded-full text-sm font-medium transition-colors",
              mode === m ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
            )}
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {mode === "draw" && (
        <div className="space-y-2">
          <canvas
            ref={canvasRef}
            aria-label={t("drawArea")}
            className="h-44 w-full touch-none rounded-xl border-2 border-dashed border-border bg-white sm:h-52"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId)
              current.current = [point(e)]
              redraw()
            }}
            onPointerMove={(e) => {
              if (!current.current) return
              current.current.push(point(e))
              redraw()
            }}
            onPointerUp={() => {
              if (current.current && current.current.length > 0) strokes.current.push(current.current)
              current.current = null
              setHasInk(strokes.current.length > 0)
              redraw()
              exportDrawing()
            }}
          />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{t("drawHint")}</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!hasInk}
              onClick={() => {
                strokes.current = []
                setHasInk(false)
                redraw()
                onChange(null)
              }}
            >
              <Eraser className="h-4 w-4" /> {t("clear")}
            </Button>
          </div>
        </div>
      )}

      {mode === "type" && (
        <div className="space-y-2">
          <Input
            value={typed}
            maxLength={80}
            onChange={(e) => setTyped(e.target.value)}
            aria-label={t("typeLabel")}
            className="h-12 text-base"
          />
          <div className="flex h-24 items-center justify-center overflow-hidden rounded-xl border bg-white px-4 font-serif text-3xl italic text-slate-900">
            {typed || " "}
          </div>
        </div>
      )}

      {mode === "upload" && (
        <div className="space-y-2">
          <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-4 text-sm text-muted-foreground">
            {uploaded ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={uploaded} alt={t("uploadPreview")} className="max-h-24 bg-white object-contain" />
            ) : (
              <>
                <ImageUp className="h-6 w-6" />
                {t("uploadHint")}
              </>
            )}
            <input
              type="file"
              accept="image/png,image/jpeg"
              className="sr-only"
              onChange={async (e) => {
                const file = e.target.files?.[0]
                if (file) setUploaded(await downscaleImage(file))
              }}
            />
          </label>
        </div>
      )}
    </div>
  )
}
