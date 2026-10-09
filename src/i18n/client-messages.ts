/**
 * Which messages each part of the app hands to its client components.
 *
 * A `NextIntlClientProvider` rendered from a server component passes along
 * every message it is given, and with no `messages` prop it passes all of
 * them. Those are serialized into the page's HTML. Measured on the landing
 * page before this file existed: the whole message file (about 66 KB of JSON)
 * went out twice, once from the root layout and once from the locale layout,
 * which made the inline payload 177 KB of a 228 KB document on every public
 * page, all of it parsed on the phone before hydration.
 *
 * Client components only read a handful of namespaces; server components read
 * messages on the server and need nothing sent. So each layout passes the
 * namespaces its area's client components read, and nothing else:
 *
 *   shell   the root layout: what renders anywhere (dialogs, the theme
 *           switch, spinners, the 404 page)
 *   public  the localized public pages under [locale]
 *   app     the dashboard, the admin panel and the sign-in pages
 *   sign    the public signing page, kept small because it is opened on
 *           phones from a link
 *
 * A client component reading a namespace missing from its area fails loudly
 * in development (next-intl throws on a missing message), and the test beside
 * this file scans every client component against these lists, so the usual
 * mistake (a new namespace in a new component) fails `npm test` first.
 */

// `errorBoundary`: the app's error boundary (src/app/error.tsx) renders in the
// root layout, under this set, wherever the error happened.
const SHELL = ["common", "theme", "loading", "notFound", "related", "errorBoundary"] as const

export const CLIENT_MESSAGES = {
  shell: [...SHELL],
  public: [
    ...SHELL,
    "nav",
    "contactDialog",
    "contactForm",
    "waitlist",
    "blog",
    "docs",
    "language",
    "verify",
    // Plan cards render on the landing and pricing pages as well as in billing.
    "billing.plans",
    "billing.upgrade",
    // The free tools' messages were listed here at first; that sent them to
    // every public page, about 3 KB of payload the homepage never used. They
    // have their own area below, wrapped around the tool on tool pages only.
  ],
  app: [...SHELL, "admin", "billing", "dashboard", "esign", "contactDialog"],
  sign: [...SHELL, "esign.sign", "esign.signature", "esign.viewer"],
  // The free PDF tools (src/components/tools) and the signing pieces they
  // reuse (the signature pad, the PDF viewer). Mounted around the tool itself
  // on /sign-pdf and the other tool pages ([page]/page.tsx).
  tools: [...SHELL, "tools", "esign.signature", "esign.viewer"],
} as const satisfies Record<string, readonly string[]>

export type ClientMessageArea = keyof typeof CLIENT_MESSAGES

type Messages = { [key: string]: unknown }

/**
 * The subset of `messages` at the given dotted paths, with their parents
 * rebuilt around them. A path that does not exist is skipped, not created.
 */
export function pickMessages(messages: Messages, paths: readonly string[]): Messages {
  const out: Messages = {}
  for (const path of paths) {
    const parts = path.split(".")
    let source: unknown = messages
    for (const part of parts) source = source && typeof source === "object" ? (source as Messages)[part] : undefined
    if (source === undefined) continue
    let target = out
    for (const part of parts.slice(0, -1)) {
      if (!target[part] || typeof target[part] !== "object") target[part] = {}
      target = target[part] as Messages
    }
    target[parts[parts.length - 1]] = source
  }
  return out
}

/** True when `namespace` (dotted) is inside one of `paths`. */
export function covers(paths: readonly string[], namespace: string): boolean {
  return paths.some((path) => namespace === path || namespace.startsWith(`${path}.`))
}
