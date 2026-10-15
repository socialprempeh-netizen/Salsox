/**
 * The "key alerts" on the admin overview: which conditions deserve a look,
 * how urgent each is, and which section answers it. A pure function over
 * counts the overview queries, so the rules are stated once and tested.
 *
 * An alert appears only when its count is above zero (or a check failed);
 * nothing here is shown as "all clear" noise. Order is by severity, then by
 * the order below, which is roughly "money first".
 */

export type AlertSeverity = "critical" | "warning" | "info"

export type AlertKey =
  | "pendingMigrations"
  | "paymentsNotConfigured"
  | "emailNotConfigured"
  | "stuckPayments"
  | "failedPayments"
  | "disputes"
  | "pastDue"
  | "undeliveredInvites"

export type AdminAlert = { key: AlertKey; severity: AlertSeverity; count: number; href: string }

export type AlertInput = {
  /** Migrations the code expects that the database lacks; null when unknown. */
  pendingMigrations: number | null
  stripeConfigured: boolean
  paystackConfigured: boolean
  emailConfigured: boolean
  /** Sign & Pay payments still PENDING well past the time a checkout takes. */
  stuckPayments: number
  failedPayments7d: number
  disputes30d: number
  pastDueSubscriptions: number
  /** Recipients of sent documents whose invitation never went out. */
  undeliveredInvites: number
}

const RANK: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 }

export function buildAlerts(input: AlertInput): AdminAlert[] {
  const alerts: AdminAlert[] = []
  const add = (key: AlertKey, severity: AlertSeverity, count: number, href: string) => {
    if (count > 0) alerts.push({ key, severity, count, href })
  }
  add("pendingMigrations", "critical", input.pendingMigrations ?? 0, "/admin/health")
  add("paymentsNotConfigured", "warning", input.stripeConfigured || input.paystackConfigured ? 0 : 1, "/admin/settings")
  add("emailNotConfigured", "warning", input.emailConfigured ? 0 : 1, "/admin/settings")
  add("stuckPayments", "critical", input.stuckPayments, "/admin/health")
  add("disputes", "critical", input.disputes30d, "/admin/moderation")
  add("failedPayments", "warning", input.failedPayments7d, "/admin/revenue")
  add("pastDue", "warning", input.pastDueSubscriptions, "/admin/subscriptions")
  add("undeliveredInvites", "info", input.undeliveredInvites, "/admin/health")
  return alerts.sort((a, b) => RANK[a.severity] - RANK[b.severity])
}
