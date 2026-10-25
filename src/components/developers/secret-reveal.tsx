"use client"

/**
 * Shows a new webhook signing secret or API key, once. It lives only in this
 * component's state: it is not in the page, the URL or any later response, so
 * closing it is final, which the panel says before the person has to find
 * out. Copy puts it on the clipboard; the text is selectable too.
 *
 * Enters with framer-motion (plain with reduced motion). Square corners;
 * the value wraps on a phone instead of widening the page.
 */
import { useState } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { useTranslations } from "next-intl"
import { Check, Copy, KeyRound } from "lucide-react"
import { Button } from "@/components/ui/button"

export function SecretReveal({ label, value, onDone }: { label: string; value: string; onDone: () => void }) {
  const t = useTranslations("dashboard.developers")
  const reduceMotion = useReducedMotion()
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard can be refused; the value is on screen to select.
    }
  }

  return (
    <motion.div
      role="status"
      initial={{ opacity: 0, y: reduceMotion ? 0 : -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="border border-l-4 border-primary/30 border-l-primary bg-primary/5 p-4"
    >
      <div className="flex items-start gap-3">
        <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{label}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{t("shownOnce")}</p>
          <code className="mt-3 block break-all border bg-background px-3 py-2 font-mono text-xs">{value}</code>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={copy} className="rounded-none">
              {copied ? <Check className="mr-1.5 h-4 w-4" aria-hidden="true" /> : <Copy className="mr-1.5 h-4 w-4" aria-hidden="true" />}
              {copied ? t("copied") : t("copy")}
            </Button>
            <Button type="button" size="sm" onClick={onDone} className="rounded-none">{t("savedIt")}</Button>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
