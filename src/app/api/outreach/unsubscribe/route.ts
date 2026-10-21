import { getTranslations } from "next-intl/server"
import { brand } from "@/config/brand"
import { siteConfig } from "@/config/site"
import { routing } from "@/i18n/routing"
import { unsubscribe } from "@/lib/outreach-agent/agent"

export const dynamic = "force-dynamic"

/**
 * The unsubscribe link in every outreach email (src/lib/outreach-agent),
 * the only part of the agent a non-admin ever reaches. It has to be public:
 * the law and the mailbox providers require that anyone can opt out in one
 * step, without signing in.
 *
 *  - GET: the link clicked in the email. Unsubscribes at once and says so.
 *  - POST: one-click unsubscribe from the mail client's own button
 *    (List-Unsubscribe-Post, RFC 8058). Answers 200 with no page.
 *
 * The token is signed (compliance.ts), so a link can only remove the address
 * it was sent to. An invalid token gets the same calm page with different
 * words, and reveals nothing about any address.
 */
async function page(ok: boolean): Promise<Response> {
  const t = await getTranslations({ locale: routing.defaultLocale, namespace: "outreachEmail" })
  const title = ok ? t("unsubscribedTitle") : t("invalidTitle")
  const body = ok ? t("unsubscribedBody", { site: siteConfig.name }) : t("invalidBody")
  // The deployment's own accent (NEXT_PUBLIC_BRAND_PRIMARY), neutral ink without one.
  const accent = brand.primary && /^#[0-9a-f]{3,8}$/i.test(brand.primary) ? brand.primary : "#242424"
  const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!)
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escape(title)}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f8f5f3;color:#242424;font:16px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif;padding:16px}main{max-width:28rem;background:#fff;border:1px solid #e4ddd6;border-top:3px solid ${accent};padding:28px 24px}h1{font-size:20px;margin:0 0 8px}p{margin:0;color:#5e5c59}</style></head>
<body><main><h1>${escape(title)}</h1><p>${escape(body)}</p></main></body></html>`
  return new Response(html, { status: ok ? 200 : 400, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } })
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("t") ?? ""
  return page(token ? await unsubscribe(token) : false)
}

export async function POST(request: Request) {
  const token = new URL(request.url).searchParams.get("t") ?? ""
  const ok = token ? await unsubscribe(token) : false
  return new Response(null, { status: ok ? 200 : 400 })
}
