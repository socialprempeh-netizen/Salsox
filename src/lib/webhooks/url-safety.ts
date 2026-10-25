/**
 * Which webhook URLs the server may call. A webhook URL is typed by a user and
 * then fetched by our server, which is the textbook way to make a server
 * reach into its own network (SSRF). So:
 *
 * - HTTPS only, on the default port or 1024 and above. Plain http is allowed
 *   for localhost in development only, so the feature can be tried locally.
 * - No credentials in the URL, no IP-literal hosts in private ranges, and no
 *   names that obviously mean "this machine".
 * - At delivery the host's addresses are checked again as they are resolved
 *   (deliver.ts pins each connection to an address it checked), so a public
 *   name that resolves to a private address is refused too.
 */
import { isIP } from "node:net"

export type UrlProblem = "invalid" | "https" | "credentials" | "private" | "port" | "length"

export function checkWebhookUrl(raw: string, { allowLocalHttp = false }: { allowLocalHttp?: boolean } = {}): { ok: true; url: string } | { ok: false; problem: UrlProblem } {
  if (raw.length > 2000) return { ok: false, problem: "length" }
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return { ok: false, problem: "invalid" }
  }
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase()
  const local = host === "localhost" || host === "127.0.0.1" || host === "::1"
  if (url.protocol === "http:" && !(allowLocalHttp && local)) return { ok: false, problem: "https" }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { ok: false, problem: "https" }
  if (url.username || url.password) return { ok: false, problem: "credentials" }
  if (url.port && Number(url.port) < 1024 && url.port !== "443") return { ok: false, problem: "port" }
  if (!(allowLocalHttp && local)) {
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return { ok: false, problem: "private" }
    if (isIP(host) && isPrivateAddress(host)) return { ok: false, problem: "private" }
  }
  url.hash = ""
  return { ok: true, url: url.toString() }
}

/**
 * Loopback, private, link-local (cloud metadata lives at 169.254.169.254),
 * carrier-grade NAT, multicast and reserved ranges, in IPv4 and IPv6,
 * including IPv4 written inside IPv6.
 */
export function isPrivateAddress(ip: string): boolean {
  const mapped = ip.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (mapped) return isPrivateAddress(mapped[1])
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number)
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    )
  }
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase()
    return v === "::" || v === "::1" || /^f[cd]/.test(v) || /^fe[89ab]/.test(v) || v.startsWith("ff") || v.startsWith("64:ff9b:") || v.startsWith("2001:db8")
  }
  return true
}
