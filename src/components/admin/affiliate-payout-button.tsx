"use client"

/**
 * "Mark paid" for one affiliate's cleared balance in one currency, on the
 * admin's payouts tab (/admin/revenue/affiliates). Two steps, because the
 * write records that money has left: the first press asks, the second
 * records (recordAffiliatePayoutAction). The money itself is sent by hand
 * before this is pressed; see AFFILIATE_PAYOUT in src/lib/affiliates.ts.
 *
 * The confirm row slides in with framer-motion; plain under reduced motion.
 * Square corners.
 */
import { useState, useTransition } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { useTranslations } from "next-intl"
import { Check } from "lucide-react"
import { toast } from "@/components/ui/sonner"
import { Button } from "@/components/ui/button"
import { recordAffiliatePayoutAction } from "@/app/actions/affiliates"

export function AffiliatePayoutButton({ affiliateId, currency, amount }: { affiliateId: string; currency: string; amount: string }) {
  const t = useTranslations("adminConsole.affiliatePayouts")
  const reduceMotion = useReducedMotion()
  const [asking, setAsking] = useState(false)
  const [pending, start] = useTransition()

  const record = () =>
    start(async () => {
      const result = await recordAffiliatePayoutAction(affiliateId, currency)
      setAsking(false)
      if (!result.ok) toast.error(t("recordFailed"))
      else if (result.rows === 0) toast.message(t("nothingLeft"))
      else toast.success(t("recorded", { amount }))
    })

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <AnimatePresence initial={false} mode="wait">
        {asking ? (
          <motion.div
            key="ask"
            initial={{ opacity: 0, x: reduceMotion ? 0 : 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.15 }}
            className="flex flex-wrap items-center justify-end gap-2"
          >
            <Button type="button" size="sm" disabled={pending} onClick={record} className="rounded-none">
              <Check className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              {t("confirm", { amount })}
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setAsking(false)} className="rounded-none">
              {t("cancel")}
            </Button>
          </motion.div>
        ) : (
          <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduceMotion ? 0 : 0.15 }}>
            <Button type="button" size="sm" variant="outline" onClick={() => setAsking(true)} className="rounded-none">
              {t("markPaid")}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
