"use client"

/**
 * The free PDF tools' "Create your signature" pad, as a dialog over the page:
 * a bottom sheet on phones, a centred panel from sm up.
 *
 * It used to open inline, between the tool's toolbar and the PDF. The
 * toolbar is sticky, so the usual moment to press Signature is while
 * scrolled down to the page being signed, and the pad then opened far above
 * the screen: nothing visible happened, and the signature looked broken. On
 * a phone, even at the top, the drawing area and "Use this signature" sat
 * under the sticky download bar, where a finger hit the bar instead. As a
 * dialog it is always on screen and above both bars.
 *
 * Escape, the close button or a tap on the backdrop closes it; focus moves
 * into it on open and back to the button that opened it on close; the page
 * behind does not scroll while it is open. Animated with framer-motion (the
 * tools' LazyMotion, tool-motion.tsx): a slide up on phones, a fade
 * otherwise, neither under prefers-reduced-motion.
 */
import { useEffect, useId, useRef } from "react"
import { createPortal } from "react-dom"
import { m, useReducedMotion } from "framer-motion"
import { useTranslations } from "next-intl"
import { Check, X } from "lucide-react"
import { SignaturePad, type SignatureValue } from "@/components/esign/signature-pad"

export function SignaturePadDialog({
  canUse,
  onDraft,
  onUse,
  onClose,
}: {
  /** A signature has been drawn, typed or uploaded. */
  canUse: boolean
  onDraft: (value: SignatureValue | null) => void
  onUse: () => void
  onClose: () => void
}) {
  const t = useTranslations("tools")
  const reduce = useReducedMotion()
  const titleId = useId()
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    panel.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus()
    const overflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = overflow
      document.removeEventListener("keydown", onKey)
      opener?.focus()
    }
    // Once per opening: onClose is an inline callback from the parent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return createPortal(
    <m.div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 sm:items-center sm:p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <m.div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-[100dvh] w-full space-y-3 overflow-y-auto overscroll-contain border border-border bg-card p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-xl sm:max-w-lg"
        initial={{ y: reduce ? 0 : 24, opacity: reduce ? 0 : 1 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: reduce ? 0 : 24, opacity: 0 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
      >
        <div className="flex items-center justify-between">
          <h3 id={titleId} className="font-semibold">{t("createSignature")}</h3>
          <button type="button" aria-label={t("cancel")} onClick={onClose} className="inline-flex h-11 w-11 items-center justify-center text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>
        <SignaturePad defaultName="" onChange={onDraft} />
        <button type="button" disabled={!canUse} onClick={onUse} className="inline-flex h-12 w-full items-center justify-center gap-2 bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">
          <Check className="h-4 w-4" aria-hidden="true" /> {t("useSignature")}
        </button>
      </m.div>
    </m.div>,
    document.body
  )
}
