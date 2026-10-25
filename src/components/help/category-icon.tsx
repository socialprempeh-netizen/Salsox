/**
 * One icon per Help Center category (src/lib/help.ts), so a topic is
 * recognisable at a glance in the topic grid, on article pages and on the
 * video cards. Decorative: the category name always sits beside it.
 */
import { CreditCard, LayoutTemplate, LifeBuoy, PenLine, Receipt, Rocket, Send, ShieldCheck, Webhook, type LucideIcon } from "lucide-react"
import type { HelpCategory } from "@/lib/help"

const ICONS: Record<HelpCategory, LucideIcon> = {
  "getting-started": Rocket,
  sending: Send,
  "fields-and-signing": PenLine,
  templates: LayoutTemplate,
  "sign-and-pay": CreditCard,
  "account-and-billing": Receipt,
  security: ShieldCheck,
  developers: Webhook,
  troubleshooting: LifeBuoy,
}

export function CategoryIcon({ category, className }: { category: HelpCategory; className?: string }) {
  const Icon = ICONS[category]
  return <Icon className={className} aria-hidden="true" />
}
