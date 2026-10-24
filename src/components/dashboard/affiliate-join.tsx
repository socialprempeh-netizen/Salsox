"use client"

/**
 * Joining the affiliate program (/dashboard/affiliate): pick a link code and
 * accept the promotion rules. React Hook Form and Zod check the code as it is
 * typed and show the link it will make; joinAffiliate checks it all again on
 * the server, which also knows whether the code is taken.
 *
 * Phone-first, square corners. The form enters with framer-motion and the
 * link preview animates its changes; with reduced motion both just appear.
 */
import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { useTranslations } from "next-intl"
import { BarChart3, Link2, MousePointerClick } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { joinAffiliate } from "@/app/actions/affiliates"
import { claimableAffiliateCode } from "@/lib/affiliates"

export function AffiliateJoin({ host, suggestion }: { host: string; suggestion: string }) {
  const t = useTranslations("dashboard.affiliate")
  const reduceMotion = useReducedMotion()
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const schema = z.object({
    code: z.string().trim().toLowerCase().refine(claimableAffiliateCode, t("codeInvalid")),
    terms: z.boolean().refine((v) => v, t("termsRequired")),
  })
  const form = useForm<z.input<typeof schema>, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { code: suggestion, terms: false },
    mode: "onChange",
  })
  const code = (form.watch("code") ?? "").trim().toLowerCase()
  const preview = claimableAffiliateCode(code) ? code : null

  function onSubmit(values: z.output<typeof schema>) {
    startTransition(async () => {
      const result = await joinAffiliate({ code: values.code, terms: values.terms })
      if (result.ok) {
        router.refresh()
        return
      }
      if (result.error === "taken") form.setError("code", { message: t("codeTaken") })
      else if (result.error === "terms") form.setError("terms", { message: t("termsRequired") })
      else if (result.error === "already") router.refresh()
      else form.setError("code", { message: t("codeInvalid") })
    })
  }

  const perks = [
    { icon: Link2, key: "perkLink" },
    { icon: MousePointerClick, key: "perkTracking" },
    { icon: BarChart3, key: "perkDashboard" },
  ] as const

  return (
    <motion.div
      initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="space-y-6"
    >
      <ul className="grid gap-px border bg-border sm:grid-cols-3">
        {perks.map(({ icon: Icon, key }) => (
          <li key={key} className="flex gap-3 bg-card p-4 text-sm sm:flex-col sm:gap-2">
            <Icon className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
            <span className="text-muted-foreground">{t(key)}</span>
          </li>
        ))}
      </ul>

      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-5 border bg-card p-4 sm:p-6">
        <div className="space-y-2">
          <Label htmlFor="affiliate-code">{t("codeLabel")}</Label>
          <Input id="affiliate-code" autoComplete="off" spellCheck={false} maxLength={24} aria-invalid={Boolean(form.formState.errors.code)} aria-describedby="affiliate-code-help" {...form.register("code")} />
          <p id="affiliate-code-help" className="text-xs text-muted-foreground">{t("codeHelp")}</p>
          <div className="min-h-5 break-all font-mono text-sm" aria-live="polite">
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={preview ?? "none"}
                initial={{ opacity: 0, y: reduceMotion ? 0 : 3 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className={preview ? "text-foreground" : "text-muted-foreground"}
              >
                {host}/go/{preview ?? "…"}
              </motion.span>
            </AnimatePresence>
          </div>
          {form.formState.errors.code && <p className="text-sm text-destructive">{form.formState.errors.code.message}</p>}
        </div>

        <div className="space-y-2">
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--primary)]" {...form.register("terms")} />
            <span className="text-muted-foreground">{t("terms")}</span>
          </label>
          {form.formState.errors.terms && <p className="text-sm text-destructive">{form.formState.errors.terms.message}</p>}
        </div>

        <Button type="submit" loading={pending} className="w-full rounded-none sm:w-auto">
          {t("join")}
        </Button>
      </form>
    </motion.div>
  )
}
