"use client"

/**
 * Live diagnostics for field placement in the editor's Fields step.
 *
 * Why: a sender reported that choosing a field type and tapping the page
 * placed nothing, and it would not reproduce anywhere else (see
 * src/lib/esign/placement-diagnostics.ts for what was ruled out). This
 * catches it where it happens.
 *
 * While a field type is armed, every pointerdown on the window is recorded in
 * the capture phase, before anything can stop it. Shortly after, it checks
 * whether a field appeared and classifies the click. A click that should have
 * placed a field and did not is sent to Sentry as a warning, with the stack
 * of elements under the pointer, whether the editor's handler ran and why it
 * stopped, the viewport, zoom and pointer type. No names, emails or document
 * text: only element tags and classes, counts and sizes.
 *
 * Adding `?placementDebug=1` to the editor URL also shows the same records on
 * screen, so a sender can screenshot them. Without a Sentry DSN the reporting
 * is a no-op; the panel works either way.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react"
import * as Sentry from "@sentry/nextjs"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { useTranslations } from "next-intl"
import { classifyPlacement, describeElement, isPlacementMiss, pointInRects, type PlacementOutcome } from "@/lib/esign/placement-diagnostics"

const noSubscribe = () => () => {}

/** How long after the pointerdown a placed field must have appeared by. */
const CHECK_AFTER_MS = 400

type Entry = {
  id: number
  outcome: PlacementOutcome
  armed: string
  pointer: string
  at: string
  stack: string[]
  handler: string
}

type Options = {
  armed: string | null
  fieldCount: number
  /** PII-free facts about the recipients, read when a click is recorded. */
  recipientFacts: () => Record<string, string | number | boolean>
}

export function usePlacementDiagnostics({ armed, fieldCount, recipientFacts }: Options) {
  const armedRef = useRef(armed)
  const fieldCountRef = useRef(fieldCount)
  const factsRef = useRef(recipientFacts)
  // What the editor's placement handler did for the latest click.
  const handlerRef = useRef<{ seq: number; result: string } | null>(null)
  const seqRef = useRef(0)
  // The URL flag, read on the client only: false on the server and during
  // hydration, so both renders agree. Nothing to subscribe to, as the editor
  // does not change its own query string.
  const debug = useSyncExternalStore(
    noSubscribe,
    () => new URLSearchParams(window.location.search).get("placementDebug") === "1",
    () => false
  )
  const [entries, setEntries] = useState<Entry[]>([])

  useEffect(() => {
    armedRef.current = armed
    fieldCountRef.current = fieldCount
    factsRef.current = recipientFacts
  })

  useEffect(() => {
    if (!armed) return
    function onDown(e: PointerEvent) {
      const seq = ++seqRef.current
      const before = fieldCountRef.current
      const armedType = armedRef.current ?? "none"
      const target = e.target instanceof Element ? e.target : null
      const pages = Array.from(document.querySelectorAll<HTMLElement>("[data-page]"))
      const rects = pages.map((p) => p.getBoundingClientRect())
      const pageIndex = rects.findIndex((r) => pointInRects(e.clientX, e.clientY, [r]))
      const stack = document.elementsFromPoint(e.clientX, e.clientY).slice(0, 5).map(describeElement)
      const onOverlay = !!target?.closest("[data-field-overlay]")
      const onField = !!target?.closest("[data-field-id]")
      const pointer = `${e.pointerType || "unknown"} button=${e.button} primary=${e.isPrimary}`
      const at = `${Math.round(e.clientX)},${Math.round(e.clientY)}`
      window.setTimeout(() => {
        const handler = handlerRef.current?.seq === seq ? handlerRef.current.result : "not called"
        const outcome = classifyPlacement({
          insidePage: pageIndex >= 0,
          onOverlay,
          onField,
          handlerRan: handler !== "not called",
          placed: fieldCountRef.current > before,
        })
        const data = {
          outcome,
          armed: armedType,
          pointer,
          at,
          page: pageIndex + 1,
          pageBox: pageIndex >= 0 ? `${Math.round(rects[pageIndex].width)}x${Math.round(rects[pageIndex].height)}@${Math.round(rects[pageIndex].left)},${Math.round(rects[pageIndex].top)}` : "none",
          pages: pages.length,
          target: describeElement(target),
          stack: stack.join(" > "),
          handler,
          fieldsBefore: before,
          fieldsAfter: fieldCountRef.current,
          viewport: `${window.innerWidth}x${window.innerHeight}@${window.devicePixelRatio || 1}`,
          zoom: window.visualViewport?.scale ?? 1,
          ...factsRef.current(),
        }
        Sentry.addBreadcrumb({ category: "editor.placement", message: outcome, data, level: isPlacementMiss(outcome) ? "warning" : "info" })
        if (isPlacementMiss(outcome)) {
          Sentry.captureMessage(`Field placement missed: ${outcome}`, {
            level: "warning",
            tags: { area: "editor", "placement.outcome": outcome, "placement.pointer": e.pointerType || "unknown" },
            contexts: { placement: data },
          })
        }
        setEntries((prev) => [{ id: seq, outcome, armed: armedType, pointer, at, stack, handler }, ...prev].slice(0, 6))
      }, CHECK_AFTER_MS)
    }
    window.addEventListener("pointerdown", onDown, true)
    return () => window.removeEventListener("pointerdown", onDown, true)
  }, [armed])

  /** Called by the editor's placement handler with what it decided. */
  const handlerRan = useCallback((result: string) => {
    handlerRef.current = { seq: seqRef.current, result }
  }, [])

  return { handlerRan, debug, entries }
}

/** The on-screen record, shown only with ?placementDebug=1. */
export function PlacementDebugPanel({ entries }: { entries: Entry[] }) {
  const t = useTranslations("esign.editor")
  const reduceMotion = useReducedMotion()
  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="max-h-40 overflow-y-auto border border-amber-500/50 bg-amber-500/5 p-3 text-xs"
      data-testid="placement-debug"
    >
      <p className="font-medium">{t("placementDebugTitle")}</p>
      <p className="text-muted-foreground">{t("placementDebugHint")}</p>
      <ol className="mt-2 space-y-2">
        <AnimatePresence initial={false}>
          {entries.map((e) => (
            <motion.li
              key={e.id}
              initial={reduceMotion ? false : { opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              transition={{ duration: 0.15 }}
              className="overflow-hidden break-all font-mono"
            >
              <span className={isPlacementMiss(e.outcome) ? "font-semibold text-destructive" : "font-semibold text-primary"}>{e.outcome}</span>
              {` ${e.armed} ${e.pointer} at ${e.at} handler: ${e.handler}`}
              <br />
              <span className="text-muted-foreground">{e.stack.join(" > ")}</span>
            </motion.li>
          ))}
        </AnimatePresence>
      </ol>
    </motion.div>
  )
}
