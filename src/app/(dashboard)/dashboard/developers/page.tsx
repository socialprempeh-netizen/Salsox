/**
 * /dashboard/developers: connecting this account to other software.
 *
 * - Webhooks: endpoints that receive document events (sent, viewed, signed,
 *   completed, payment sent) as signed JSON, with a test sender and each
 *   endpoint's latest deliveries (src/lib/webhooks).
 * - API keys: for an integration such as Zapier or Make to subscribe to
 *   those events on this account's behalf (/api/v1, src/lib/api/v1.ts).
 * - How to check a delivery's signature, in a few lines, and a link to the
 *   full reference in the Help Center.
 *
 * Per account: each person's endpoints and keys see only their documents.
 */
import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { BookOpen, KeySquare, Webhook } from "lucide-react"
import { requireUser } from "@/lib/auth"
import { siteConfig } from "@/config/site"
import { listEndpoints, MAX_ENDPOINTS } from "@/lib/webhooks/store"
import { listApiKeys } from "@/lib/api-keys-store"
import { WebhookEndpoints } from "@/components/developers/webhook-endpoints"
import { ApiKeysPanel } from "@/components/developers/api-keys-panel"

// The public reference: content/help/articles/webhooks-and-api.md.
const WEBHOOK_DOCS_PATH = "/resources/help/webhooks-and-api"

export async function generateMetadata() {
  const t = await getTranslations("dashboard.developers")
  return { title: t("title") }
}

// The receiver's check, as it appears in the docs (src/lib/webhooks/payload.ts).
const VERIFY_SNIPPET = `import { createHmac, timingSafeEqual } from "node:crypto"

// header: the Webhook-Signature header, body: the raw request body
function verify(secret, header, body) {
  const { t, v1 } = Object.fromEntries(header.split(",").map((p) => p.split("=")))
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false
  const expected = createHmac("sha256", secret).update(\`\${t}.\${body}\`).digest()
  const given = Buffer.from(v1, "hex")
  return given.length === expected.length && timingSafeEqual(given, expected)
}`

export default async function DevelopersPage() {
  const user = await requireUser()
  const t = await getTranslations("dashboard.developers")
  const [endpoints, keys] = await Promise.all([listEndpoints(user.id), listApiKeys(user.id)])

  return (
    <div className="space-y-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="mt-1 max-w-2xl text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Link href={WEBHOOK_DOCS_PATH} className="inline-flex shrink-0 items-center gap-2 text-sm font-medium text-primary hover:underline">
          <BookOpen className="h-4 w-4" aria-hidden="true" />
          {t("docsLink")}
        </Link>
      </div>

      <section aria-labelledby="webhooks-title" className="space-y-4">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center bg-primary text-primary-foreground" aria-hidden="true">
            <Webhook className="h-5 w-5" strokeWidth={1.75} />
          </span>
          <div className="min-w-0">
            <h2 id="webhooks-title" className="text-lg font-semibold">{t("webhooksTitle")}</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">{t("webhooksBody")}</p>
          </div>
        </div>
        <WebhookEndpoints
          max={MAX_ENDPOINTS}
          endpoints={endpoints.map((e) => ({
            id: e.id,
            url: e.url,
            events: e.events,
            enabled: e.enabled,
            description: e.description,
            source: e.source,
            deliveries: e.deliveries.map((d) => ({ id: d.id, event: d.event, status: d.status, attempts: d.attempts, responseStatus: d.responseStatus, error: d.error, test: d.test, createdAt: d.createdAt.toISOString() })),
          }))}
        />
      </section>

      <section aria-labelledby="api-title" className="space-y-4">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center bg-primary text-primary-foreground" aria-hidden="true">
            <KeySquare className="h-5 w-5" strokeWidth={1.75} />
          </span>
          <div className="min-w-0">
            <h2 id="api-title" className="text-lg font-semibold">{t("apiTitle")}</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">{t("apiBody")}</p>
            <p className="mt-2 break-all font-mono text-xs text-muted-foreground">{`${siteConfig.url.replace(/\/+$/, "")}/api/v1`}</p>
          </div>
        </div>
        <ApiKeysPanel keys={keys.map((k) => ({ id: k.id, name: k.name, prefix: k.prefix, createdAt: k.createdAt.toISOString(), lastUsedAt: k.lastUsedAt?.toISOString() ?? null }))} />
      </section>

      <section aria-labelledby="verify-title" className="space-y-3">
        <h2 id="verify-title" className="text-lg font-semibold">{t("verifyTitle")}</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">{t("verifyBody")}</p>
        <pre className="overflow-x-auto border bg-muted/40 p-4 text-xs leading-relaxed"><code>{VERIFY_SNIPPET}</code></pre>
      </section>
    </div>
  )
}
