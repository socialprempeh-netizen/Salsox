"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/sonner"

// Opens the Stripe Customer Portal. A failure used to do nothing at all: the
// button stopped spinning and the page stayed put, with the reason only in the
// network tab. It now says so, the way the upgrade button does; the route's own
// message goes to the console, since it is written for whoever runs billing.
export function ManageBillingButton({ className }: { className?: string }) {
  const t = useTranslations("billing.manage")
  const [loading, setLoading] = useState(false)

  async function handleClick() {
    setLoading(true)
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.url) {
        console.error("[billing portal] failed:", data.error ?? res.status)
        toast.error(t("error"))
        return
      }
      window.location.href = data.url
    } catch {
      toast.error(t("error"))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button variant="outline" onClick={handleClick} loading={loading} className={className}>
      {/* Was the literal "Manage Billing". */}
      {t("label")}
    </Button>
  )
}
