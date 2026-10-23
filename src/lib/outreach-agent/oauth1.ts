/**
 * OAuth 1.0a request signing (HMAC-SHA1), for posting to X with the
 * credentials the X developer portal issues to an app's own account: an API
 * key and secret (the consumer) and an access token and secret (the user).
 * Those are signed into every request; there is no token exchange.
 *
 * Built on Web Crypto (globalThis.crypto.subtle), so it runs on the server
 * and imports nothing from Node: social.ts, which uses it, is also read by the
 * social studio in the browser for its limits. The signature follows RFC 5849
 * and is tested against X's own published example (oauth1.test.ts).
 *
 * Parameters in the signature are the oauth_* ones, the URL's query string
 * and, for a form-encoded body, its fields. A JSON body (as POST /2/tweets
 * takes) is not part of the signature, per the specification.
 */

export type OAuth1Credentials = { consumerKey: string; consumerSecret: string; token: string; tokenSecret: string }

/** RFC 3986 percent-encoding, which encodeURIComponent falls short of for !'()*. */
export function percentEncode(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
}

/** The signature base string: method, base URL and the sorted, encoded parameters. */
export function signatureBaseString(method: string, url: string, params: Record<string, string>): string {
  const parsed = new URL(url)
  const all: [string, string][] = [...Object.entries(params), ...parsed.searchParams.entries()]
  const normalized = all
    .map(([k, v]) => [percentEncode(k), percentEncode(v)] as const)
    .sort(([ak, av], [bk, bv]) => (ak === bk ? (av < bv ? -1 : av > bv ? 1 : 0) : ak < bk ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join("&")
  const baseUrl = `${parsed.protocol}//${parsed.host}${parsed.pathname}`
  return [method.toUpperCase(), percentEncode(baseUrl), percentEncode(normalized)].join("&")
}

async function hmacSha1Base64(key: string, text: string): Promise<string> {
  const encoder = new TextEncoder()
  const cryptoKey = await globalThis.crypto.subtle.importKey("raw", encoder.encode(key), { name: "HMAC", hash: "SHA-1" }, false, ["sign"])
  const bytes = new Uint8Array(await globalThis.crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(text)))
  let binary = ""
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}

function randomNonce(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16))
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")
}

/**
 * The Authorization header for one request. `formParams` are the fields of
 * a form-encoded body, if any. `nonce` and `timestamp` are for tests only.
 */
export async function oauth1Header(
  { method, url, formParams = {} }: { method: string; url: string; formParams?: Record<string, string> },
  credentials: OAuth1Credentials,
  { nonce = randomNonce(), timestamp = Math.floor(Date.now() / 1000).toString() }: { nonce?: string; timestamp?: string } = {}
): Promise<string> {
  const oauth: Record<string, string> = {
    oauth_consumer_key: credentials.consumerKey,
    oauth_nonce: nonce,
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: timestamp,
    oauth_token: credentials.token,
    oauth_version: "1.0",
  }
  const base = signatureBaseString(method, url, { ...formParams, ...oauth })
  const signingKey = `${percentEncode(credentials.consumerSecret)}&${percentEncode(credentials.tokenSecret)}`
  const signature = await hmacSha1Base64(signingKey, base)
  const header = Object.entries({ ...oauth, oauth_signature: signature })
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${percentEncode(k)}="${percentEncode(v)}"`)
    .join(", ")
  return `OAuth ${header}`
}
