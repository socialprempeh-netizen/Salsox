"use client"

/**
 * The free PDF signature generator: draw a signature or type it in a
 * handwriting typeface, choose the ink, and download a transparent PNG
 * trimmed to the signature, at a resolution that prints sharply.
 *
 * Runs entirely in the browser: strokes are smoothed with perfect-freehand
 * (the same library as the signing pad), typed signatures are drawn to a
 * canvas once their typeface has loaded, and the PNG is produced locally.
 * "Use it to sign a PDF" hands the image to the Add signature tool through
 * sessionStorage (HANDOFF_KEY), on this device only.
 *
 * The handwriting typefaces are not preloaded: they are requested when the
 * Type tab is opened, so they cost nothing on any other page.
 */
import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { Caveat, Dancing_Script, Great_Vibes } from "next/font/google"
import { getStroke } from "perfect-freehand"
import { Download, Eraser, FilePen, PenLine, Type } from "lucide-react"
import { trimDataUrl } from "@/lib/image-trim"
import { track } from "@/lib/analytics"
import { cn } from "@/lib/utils"
import { HANDOFF_KEY } from "./handoff"
import { Appear, ToolMotion } from "./tool-motion"

const caveat = Caveat({ subsets: ["latin"], weight: "600", preload: false, display: "swap" })
const dancing = Dancing_Script({ subsets: ["latin"], weight: "600", preload: false, display: "swap" })
const vibes = Great_Vibes({ subsets: ["latin"], weight: "400", preload: false, display: "swap" })
const FONTS = [
  { id: "caveat", font: caveat },
  { id: "dancing", font: dancing },
  { id: "vibes", font: vibes },
] as const

const INKS = [
  { id: "black", value: "#0f172a" },
  { id: "blue", value: "#1e3a8a" },
  { id: "green", value: "#14532d" },
] as const

type Point = [number, number, number]

function strokePath(points: Point[], size: number): Path2D {
  const outline = getStroke(points, { size, thinning: 0.6, smoothing: 0.5, streamline: 0.5 })
  const path = new Path2D()
  if (outline.length === 0) return path
  path.moveTo(outline[0][0], outline[0][1])
  for (let i = 1; i < outline.length; i++) {
    const [x0, y0] = outline[i - 1]
    const [x1, y1] = outline[i]
    path.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2)
  }
  path.closePath()
  return path
}

export function SignatureGeneratorTool() {
  const t = useTranslations("tools")
  const router = useRouter()
  const [mode, setMode] = useState<"draw" | "type">("draw")
  const [ink, setInk] = useState<(typeof INKS)[number]["id"]>("black")
  const [text, setText] = useState("")
  const [fontId, setFontId] = useState<(typeof FONTS)[number]["id"]>("caveat")
  const [hasInk, setHasInk] = useState(false)
  const [png, setPng] = useState<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const strokes = useRef<Point[][]>([])
  const current = useRef<Point[] | null>(null)
  const colour = INKS.find((i) => i.id === ink)!.value

  // Draw at up to 3x the CSS size, so the exported PNG prints sharply.
  useEffect(() => {
    if (mode !== "draw") return
    const canvas = canvasRef.current
    if (!canvas) return
    const scale = Math.max(2, Math.min(window.devicePixelRatio || 1, 3))
    canvas.width = canvas.clientWidth * scale
    canvas.height = canvas.clientHeight * scale
    redraw()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  // The preview PNG is cleared by each handler that changes what it shows.
  useEffect(() => {
    if (mode === "draw") redraw()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ink, mode])

  function redraw() {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = colour
    const size = Math.max(4, canvas.width / 100)
    for (const points of [...strokes.current, ...(current.current ? [current.current] : [])]) ctx.fill(strokePath(points, size))
  }

  function point(e: React.PointerEvent<HTMLCanvasElement>): Point {
    const canvas = e.currentTarget
    const rect = canvas.getBoundingClientRect()
    return [((e.clientX - rect.left) / rect.width) * canvas.width, ((e.clientY - rect.top) / rect.height) * canvas.height, e.pressure || 0.5]
  }

  async function render(): Promise<string | null> {
    if (mode === "draw") {
      if (!canvasRef.current || strokes.current.length === 0) return null
      return trimDataUrl(canvasRef.current.toDataURL("image/png"), 8)
    }
    if (!text.trim()) return null
    const family = FONTS.find((f) => f.id === fontId)!.font.style.fontFamily
    await document.fonts.load(`160px ${family}`)
    const canvas = document.createElement("canvas")
    canvas.width = 2000
    canvas.height = 420
    const ctx = canvas.getContext("2d")!
    ctx.font = `160px ${family}`
    ctx.fillStyle = colour
    ctx.textBaseline = "middle"
    ctx.fillText(text.trim(), 40, 210, 1920)
    return trimDataUrl(canvas.toDataURL("image/png"), 12)
  }

  async function makePng() {
    const out = await render()
    setPng(out)
    return out
  }

  async function download() {
    const out = png ?? (await makePng())
    if (!out) return
    const a = document.createElement("a")
    a.href = out
    a.download = "signature.png"
    a.click()
    track("tool_downloaded", { tool: "pdf-signature-generator" })
  }

  async function sendToPdfTool() {
    const out = png ?? (await makePng())
    if (!out) return
    try {
      sessionStorage.setItem(HANDOFF_KEY, out)
    } catch {
      // Storage full or disabled: the next tool simply asks for a signature.
    }
    track("cta_clicked", { location: "tool:pdf-signature-generator", target: "/add-signature-to-pdf" })
    router.push("/add-signature-to-pdf")
  }

  const ready = mode === "draw" ? hasInk : text.trim().length > 0

  return (
    <ToolMotion>
      <div className="space-y-4 border border-border bg-card p-4">
        <div role="tablist" aria-label={t("generatorMode")} className="grid grid-cols-2 gap-1 bg-muted p-1">
          {(["draw", "type"] as const).map((m) => (
            <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => { setMode(m); setPng(null) }} className={cn("flex min-h-11 items-center justify-center gap-1.5 text-sm font-medium", mode === m ? "bg-background text-foreground shadow-sm" : "text-muted-foreground")}>
              {m === "draw" ? <PenLine className="h-4 w-4" aria-hidden="true" /> : <Type className="h-4 w-4" aria-hidden="true" />}
              {t(m === "draw" ? "draw" : "type")}
            </button>
          ))}
        </div>

        {mode === "draw" ? (
          <div className="space-y-2">
            <canvas
              ref={canvasRef}
              aria-label={t("drawArea")}
              className="h-48 w-full touch-none border-2 border-dashed border-border bg-white sm:h-56"
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
                if (current.current?.length) strokes.current.push(current.current)
                current.current = null
                setHasInk(strokes.current.length > 0)
                setPng(null)
                redraw()
              }}
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{t("drawHint")}</span>
              <button type="button" disabled={!hasInk} onClick={() => { strokes.current = []; setHasInk(false); setPng(null); redraw() }} className="inline-flex h-9 items-center gap-1.5 px-2 disabled:opacity-40">
                <Eraser className="h-4 w-4" aria-hidden="true" /> {t("clear")}
              </button>
            </div>
          </div>
        ) : (
          <Appear id="type" className="space-y-3">
            <label className="block text-sm font-medium" htmlFor="sig-text">{t("yourName")}</label>
            <input id="sig-text" value={text} maxLength={60} onChange={(e) => { setText(e.target.value); setPng(null) }} placeholder={t("namePlaceholder")} className="h-12 w-full border border-border bg-background px-3 text-base" />
            <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label={t("style")}>
              {FONTS.map(({ id, font }) => (
                <button key={id} type="button" role="radio" aria-checked={fontId === id} onClick={() => { setFontId(id); setPng(null) }} className={cn("flex h-20 items-center justify-center overflow-hidden border bg-white px-3 text-3xl", font.className, fontId === id ? "border-primary ring-2 ring-primary/30" : "border-border")} style={{ color: colour }}>
                  <span className="truncate">{text.trim() || t("namePlaceholder")}</span>
                </button>
              ))}
            </div>
          </Appear>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium">{t("ink")}</span>
          {INKS.map((i) => (
            <button key={i.id} type="button" aria-label={t(`inks.${i.id}`)} aria-pressed={ink === i.id} onClick={() => { setInk(i.id); setPng(null) }} className={cn("h-9 w-9 border-2", ink === i.id ? "border-primary" : "border-transparent")}>
              <span className="block h-full w-full" style={{ background: i.value }} />
            </button>
          ))}
        </div>

        {png && (
          <Appear id="png" className="space-y-1">
            <p className="text-xs text-muted-foreground">{t("pngPreview")}</p>
            <div className="flex h-28 items-center justify-center border border-border bg-[length:16px_16px] bg-[conic-gradient(#e5e7eb_25%,#fff_0_50%,#e5e7eb_0_75%,#fff_0)] p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={png} alt={t("pngAlt")} className="max-h-full max-w-full object-contain" />
            </div>
          </Appear>
        )}

        <div className="flex flex-col gap-2 sm:flex-row">
          <button type="button" disabled={!ready} onClick={() => void download()} className="inline-flex h-12 items-center justify-center gap-2 bg-primary px-6 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50">
            <Download className="h-4 w-4" aria-hidden="true" /> {t("downloadPng")}
          </button>
          <button type="button" disabled={!ready} onClick={() => void sendToPdfTool()} className="inline-flex h-12 items-center justify-center gap-2 border border-border px-6 text-sm font-semibold transition-colors hover:bg-secondary disabled:opacity-50">
            <FilePen className="h-4 w-4" aria-hidden="true" /> {t("useOnPdf")}
          </button>
        </div>
      </div>
    </ToolMotion>
  )
}
