"use client"

/**
 * The interactive part of the referrals page (/dashboard/referrals): the
 * invite link with copy and share buttons, the free Pro time banked so far
 * as a bar against the cap, what counts as an active invite (and what does
 * not), and the people who joined through the link.
 *
 * Shows what the server decided and nothing more: rewards are granted by
 * rewardReferrer (src/lib/referrals-store.ts) when an invited account sends
 * its first document.
 *
 * Phone-first: everything stacks, and the link and its button sit side by
 * side from `sm` up. Square corners throughout. The bar fills and the list
 * enters with framer-motion; with reduced motion both simply appear.
 */
import { useState } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { useTranslations } from "next-intl"
import { Check, CircleCheck, CircleX, Copy, Mail, Send, UserCheck, UserPlus, Gift } from "lucide-react"
import { toast } from "@/components/ui/sonner"
import { Button } from "@/components/ui/button"

type Invited = { id: string; name: string; joined: string; active: boolean }

export function ReferralPanel(props: {
  link: string
  siteName: string
  proUntil: string | null
  daysLeft: number
  capDays: number
  rewardMonths: number
  /** How long an invite link is remembered, and how far ahead free time may reach. */
  cookieDays: number
  capMonths: number
  invited: Invited[]
}) {
  const t = useTranslations("dashboard.referrals")
  const reduceMotion = useReducedMotion()
  const [copied, setCopied] = useState(false)
  const active = props.invited.filter((i) => i.active).length
  const share = t("shareText", { site: props.siteName })
  const fill = Math.min(100, Math.round((props.daysLeft / props.capDays) * 100))

  async function copy() {
    try {
      await navigator.clipboard.writeText(props.link)
      setCopied(true)
      toast.success(t("copied"))
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error(t("copyFailed"))
    }
  }

  const targets = [
    { key: "shareWhatsApp", icon: Send, href: `https://wa.me/?text=${encodeURIComponent(`${share} ${props.link}`)}` },
    { key: "shareEmail", icon: Mail, href: `mailto:?subject=${encodeURIComponent(t("emailSubject", { site: props.siteName }))}&body=${encodeURIComponent(`${share}\n\n${props.link}`)}` },
    { key: "shareX", icon: null, href: `https://x.com/intent/post?text=${encodeURIComponent(share)}&url=${encodeURIComponent(props.link)}` },
    { key: "shareLinkedIn", icon: null, href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(props.link)}` },
  ] as const

  return (
    <div className="space-y-6">
      <section aria-labelledby="referral-link-title" className="border bg-card p-4 sm:p-6">
        <h2 id="referral-link-title" className="text-sm font-semibold">{t("linkTitle")}</h2>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            readOnly
            value={props.link}
            aria-label={t("linkTitle")}
            onFocus={(e) => e.currentTarget.select()}
            className="h-10 min-w-0 flex-1 border bg-background px-3 font-mono text-sm"
          />
          <Button type="button" onClick={copy} className="h-10 rounded-none sm:w-36">
            {copied ? <Check className="mr-2 h-4 w-4" aria-hidden="true" /> : <Copy className="mr-2 h-4 w-4" aria-hidden="true" />}
            {copied ? t("copiedShort") : t("copy")}
          </Button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          {targets.map(({ key, icon: Icon, href }) => (
            <Button key={key} asChild variant="outline" size="sm" className="rounded-none">
              <a href={href} target="_blank" rel="noopener noreferrer">
                {Icon && <Icon className="mr-2 h-4 w-4" aria-hidden="true" />}
                {t(key)}
              </a>
            </Button>
          ))}
        </div>
      </section>

      <section aria-labelledby="referral-pro-title" className="border bg-card p-4 sm:p-6">
        <div className="flex items-start gap-3">
          <Gift className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          <div className="min-w-0">
            <h2 id="referral-pro-title" className="text-sm font-semibold">
              {props.proUntil ? t("proUntil", { date: props.proUntil }) : t("proNone")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("proBody", { months: props.rewardMonths })}</p>
          </div>
        </div>
        <div className="mt-4 h-2 w-full bg-muted" role="img" aria-label={t("barLabel", { days: props.daysLeft })}>
          <motion.div
            className="h-full bg-primary"
            initial={{ width: reduceMotion ? `${fill}%` : 0 }}
            animate={{ width: `${fill}%` }}
            transition={{ duration: reduceMotion ? 0 : 0.8, ease: "easeOut" }}
          />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{t("barCaption")}</p>
        <dl className="mt-4 grid grid-cols-2 gap-px border bg-border">
          <div className="bg-card p-3">
            <dt className="text-xs text-muted-foreground">{t("statJoined")}</dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums">{props.invited.length}</dd>
          </div>
          <div className="bg-card p-3">
            <dt className="text-xs text-muted-foreground">{t("statActive")}</dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums">{active}</dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="referral-steps-title" className="border bg-card p-4 sm:p-6">
        <h2 id="referral-steps-title" className="text-sm font-semibold">{t("stepsTitle")}</h2>
        <ol className="mt-3 space-y-3">
          {(["step1", "step2", "step3"] as const).map((key, i) => (
            <li key={key} className="flex gap-3 text-sm">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center border text-xs font-semibold tabular-nums">{i + 1}</span>
              <span className="pt-0.5 text-muted-foreground">{t(key, { months: props.rewardMonths })}</span>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-xs text-muted-foreground">{t("fineprint")}</p>
      </section>

      <section aria-labelledby="referral-active-title" className="border bg-card p-4 sm:p-6">
        <h2 id="referral-active-title" className="text-sm font-semibold">{t("activeTitle")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("activeLead", { months: props.rewardMonths })}</p>
        <div className="mt-4 grid gap-px border bg-border sm:grid-cols-2">
          {(
            [
              { title: "activeCountsTitle", icon: CircleCheck, tone: "text-primary", items: [t("activeCount1", { days: props.cookieDays }), t("activeCount2")] },
              { title: "activeNotTitle", icon: CircleX, tone: "text-muted-foreground", items: [t("activeNot1"), t("activeNot2"), t("activeNot3")] },
            ] as const
          ).map(({ title, icon: Icon, tone, items }, col) => (
            <motion.div
              key={title}
              initial={{ opacity: 0, y: reduceMotion ? 0 : 6 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: reduceMotion ? 0 : 0.3, delay: reduceMotion ? 0 : col * 0.08 }}
              className="bg-card p-4"
            >
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t(title)}</h3>
              <ul className="mt-2 space-y-2">
                {items.map((text) => (
                  <li key={text} className="flex gap-2 text-sm">
                    <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${tone}`} aria-hidden="true" />
                    <span>{text}</span>
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">{t("activeCap", { cap: props.capMonths })}</p>
      </section>

      <section aria-labelledby="referral-list-title" className="border bg-card">
        <h2 id="referral-list-title" className="border-b p-4 text-sm font-semibold sm:px-6">{t("listTitle")}</h2>
        {props.invited.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground sm:px-6">{t("listEmpty")}</p>
        ) : (
          <ul className="divide-y">
            {props.invited.map((person, i) => (
              <motion.li
                key={person.id}
                initial={{ opacity: 0, y: reduceMotion ? 0 : 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: reduceMotion ? 0 : Math.min(i, 10) * 0.04 }}
                className="flex items-center justify-between gap-3 p-4 sm:px-6"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{person.name || t("unnamed")}</p>
                  <p className="text-xs text-muted-foreground">{t("joinedOn", { date: person.joined })}</p>
                </div>
                <span
                  className={
                    person.active
                      ? "inline-flex shrink-0 items-center gap-1 border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                      : "inline-flex shrink-0 items-center gap-1 border px-2 py-0.5 text-xs text-muted-foreground"
                  }
                >
                  {person.active ? <UserCheck className="h-3 w-3" aria-hidden="true" /> : <UserPlus className="h-3 w-3" aria-hidden="true" />}
                  {t(person.active ? "statusActive" : "statusJoined", { months: props.rewardMonths })}
                </span>
              </motion.li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
