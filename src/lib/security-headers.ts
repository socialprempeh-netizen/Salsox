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
 * - Email (Resend), SMS (Twilio) and the payment APIs are called from the
 *   server only, so none of their hosts appear here: a CSP governs what the
 *   browser loads, and the browser never talks to them.
 * - Fonts are self-hosted by next/font, so `font-src` stays on this origin.
 * - Images come from this origin, plus the two OAuth providers' avatar hosts
 *   (the only place a user's photo comes from: see profile-form.tsx). This
 *   used to be any `https:` host.
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

/**
 * Where profile pictures are served from: Google serves them from numbered
 * hosts under googleusercontent.com (lh3, lh4, ...), GitHub from one host.
 * A new OAuth provider in src/auth.ts adds its avatar host here.
 */
export const AVATAR_HOSTS = ["https://*.googleusercontent.com", "https://avatars.githubusercontent.com"] as const

/**
 * Google Analytics 4's hosts, allowed only when the deployment sets
 * NEXT_PUBLIC_GA_MEASUREMENT_ID (src/components/analytics/google-analytics.tsx).
 * Without it the policy names no Google host at all.
 */
export const GA_HOSTS = {
  script: ["https://www.googletagmanager.com"],
  connect: ["https://*.google-analytics.com", "https://*.analytics.google.com", "https://www.googletagmanager.com"],
  img: ["https://*.google-analytics.com", "https://www.googletagmanager.com"],
} as const

/** Builds the Content-Security-Policy header value. */
export function contentSecurityPolicy({ dev, ga = false }: { dev: boolean; ga?: boolean }): string {
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
      ...(ga ? GA_HOSTS.script : []),
      ...(dev ? ["'unsafe-eval'"] : []),
    ],
    // Inline style attributes are everywhere (React `style`, the brand
    // override <style> in the root layout, toasts).
    "style-src": ["'self'", "'unsafe-inline'"],
    // Was ["'self'", "data:", "blob:", "https:"]: any HTTPS host, for OAuth
    // profile pictures. Those come from two known hosts, so only they are let in.
    "img-src": ["'self'", "data:", "blob:", ...AVATAR_HOSTS, ...(ga ? GA_HOSTS.img : [])],
    "font-src": ["'self'", "data:"],
    // Development adds the hot-reload websocket.
    "connect-src": ["'self'", ...(ga ? GA_HOSTS.connect : []), ...(dev ? ["ws:", "wss:"] : [])],
    "worker-src": ["'self'", "blob:"],
    "media-src": ["'self'", "blob:", "data:"],
    "frame-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'", ...FORM_ACTION_HOSTS],
    "frame-ancestors": ["'none'"],
    "manifest-src": ["'self'"],
    // Production only: rewrites a stray http:// subresource to https:// rather
    // than loading it in the clear. Locally the app is served over plain HTTP,
    // where this would break every request.
    ...(dev ? {} : { "upgrade-insecure-requests": [] }),
  }
  return Object.entries(directives)
    .map(([name, values]) => (values.length > 0 ? `${name} ${values.join(" ")}` : name))
    .join("; ")
}

/** The headers applied to every route by next.config.ts. */
export function securityHeaders({ dev, ga = false }: { dev: boolean; ga?: boolean }): { key: string; value: string }[] {
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
    { key: "Content-Security-Policy", value: contentSecurityPolicy({ dev, ga }) },
    // Send only the origin on cross-origin navigations (no full path/query
    // leak). This matters here: signing links carry their token in the path.
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    // Drop browser features we don't use. Was only camera, microphone and
    // geolocation; the rest are equally unused and equally worth refusing to
    // an injected script. Signature uploads use a plain file input, which
    // needs none of these (the OS camera picker is not the camera API).
    { key: "Permissions-Policy", value: PERMISSIONS_POLICY },
    // A page opened from here (a checkout, an OAuth consent screen) cannot
    // reach back into this window through `window.opener`. Sign-in and
    // checkout are full-page redirects, never popups, so nothing relies on it.
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ]
}

/** Every powerful browser feature, switched off for this origin and any frame. */
export const PERMISSIONS_POLICY = [
  "accelerometer=()",
  "autoplay=()",
  "bluetooth=()",
  "browsing-topics=()",
  "camera=()",
  "display-capture=()",
  "geolocation=()",
  "gyroscope=()",
  "hid=()",
  "magnetometer=()",
  "microphone=()",
  "midi=()",
  "payment=()",
  "serial=()",
  "usb=()",
].join(", ")
