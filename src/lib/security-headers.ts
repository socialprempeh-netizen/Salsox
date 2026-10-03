/**
 * The security headers every response carries, and the Content-Security-Policy
 * among them, stated once so next.config.ts applies them and the test beside
 * this file can hold them to what the app actually needs.
 *
 * Imported by next.config.ts with a relative path, so no `@/` imports here.
 *
 * What the policy has to leave room for, and why each allowance exists:
 *
 * - Checkout (Stripe and Paystack) is a full-page redirect to the provider's
 *   hosted page, never an embedded form, so no provider script or frame is
 *   allowed. A redirect that follows a form POST is still checked against
 *   `form-action` (before hydration a server action submits as a real form),
 *   so the providers' hosts are listed there, with the OAuth sign-in hosts.
 * - The signing flow renders PDFs with pdf.js: the worker is bundled under
 *   /_next/static (`worker-src 'self'`), the file is fetched from this origin
 *   (`connect-src 'self'`), and its optional image decoders are WebAssembly
 *   (`'wasm-unsafe-eval'`, which allows compiling wasm and nothing else).
 *   Signatures are drawn to a canvas and shown as `data:` and `blob:` images.
 * - Uploads go through server actions on this origin, so they need nothing.
 * - Inline scripts stay allowed (`'unsafe-inline'`). Next.js emits inline
 *   scripts on every page, and so does the root layout's theme script. The
 *   strict alternative is a per-request nonce, which Next.js can only inject
 *   into dynamically rendered pages: any page that ends up static would have
 *   every script blocked and never hydrate, with nothing failing at build
 *   time. Everything else (plugins, base-tag hijacking, framing, form
 *   targets, third-party script hosts) is shut.
 */

/** Hosts a form submission may end up on: payment checkout and OAuth sign-in. */
export const FORM_ACTION_HOSTS = [
  // Stripe Checkout, the billing portal and Connect onboarding.
  "https://*.stripe.com",
  // Paystack's hosted checkout.
  "https://*.paystack.com",
  "https://*.paystack.co",
  // OAuth providers configured in src/auth.ts.
  "https://accounts.google.com",
  "https://github.com",
] as const

/** Builds the Content-Security-Policy header value. */
export function contentSecurityPolicy({ dev }: { dev: boolean }): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    // `'unsafe-eval'` in development only: React uses eval there to rebuild
    // server error stacks. Vercel Analytics loads its debug script from
    // va.vercel-scripts.com in development; in production it is same-origin.
    "script-src": [
      "'self'",
      "'unsafe-inline'",
      "'wasm-unsafe-eval'",
      "https://va.vercel-scripts.com",
      ...(dev ? ["'unsafe-eval'"] : []),
    ],
    // Inline style attributes are everywhere (React `style`, the brand
    // override <style> in the root layout, toasts).
    "style-src": ["'self'", "'unsafe-inline'"],
    // `https:` for profile pictures from OAuth providers, whose hosts vary.
    "img-src": ["'self'", "data:", "blob:", "https:"],
    "font-src": ["'self'", "data:"],
    // Development adds the hot-reload websocket.
    "connect-src": ["'self'", ...(dev ? ["ws:", "wss:"] : [])],
    "worker-src": ["'self'", "blob:"],
    "media-src": ["'self'", "blob:", "data:"],
    "frame-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'", ...FORM_ACTION_HOSTS],
    "frame-ancestors": ["'none'"],
  }
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ")
}

/** The headers applied to every route by next.config.ts. */
export function securityHeaders({ dev }: { dev: boolean }): { key: string; value: string }[] {
  return [
    // Force HTTPS for 2 years, including subdomains. Browsers ignore this over
    // plain HTTP, so it's harmless in local dev. No `preload`: getting onto the
    // browsers' preload list is a commitment that takes months to undo.
    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
    // Don't let the browser MIME-sniff responses away from their declared type.
    { key: "X-Content-Type-Options", value: "nosniff" },
    // Anti-clickjacking: this app should never be framed by another site.
    // `frame-ancestors` in the policy says the same to current browsers; this
    // header covers the ones that predate it.
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Content-Security-Policy", value: contentSecurityPolicy({ dev }) },
    // Send only the origin on cross-origin navigations (no full path/query
    // leak). This matters here: signing links carry their token in the path.
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    // Drop browser features we don't use.
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  ]
}
