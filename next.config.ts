import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
// From the /config entry point: in Sentry 11 it is no longer on the main one.
import { withSentryConfig } from "@sentry/nextjs/config";
import { SERVER_ACTION_BODY_LIMIT } from "./src/lib/esign/limits";
import { securityHeaders as buildSecurityHeaders } from "./src/lib/security-headers";
import { sentryIngestOrigin } from "./src/lib/sentry";
import { seoRedirectsForNext } from "./src/lib/seo/redirects";

// Points next-intl at the request config that loads the message files.
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// Security headers applied to every route, now built by
// src/lib/security-headers.ts with a full Content-Security-Policy tuned to
// what the app loads (checkout redirects, pdf.js, OAuth), and tested there.
// The list below sent only `frame-ancestors 'none'` as its policy, waiting
// for a CSP to be written per deployment; it is kept for reference.
// // Security headers applied to every route. These are safe, high-value defaults
// // for an auth + payments app. A full Content-Security-Policy is intentionally
// // NOT set here: a strict CSP must be tuned per deployment (Stripe, OAuth
// // redirects, the inline dark-mode script) and a wrong one silently breaks the
// // app — so we leave it for you to add deliberately rather than ship a broken one.
// const securityHeaders = [
//   // Force HTTPS for 2 years, including subdomains. Browsers ignore this over
//   // plain HTTP, so it's harmless in local dev.
//   { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
//   // Don't let the browser MIME-sniff responses away from their declared type.
//   { key: "X-Content-Type-Options", value: "nosniff" },
//   // Anti-clickjacking: this app should never be framed by another site.
//   { key: "X-Frame-Options", value: "DENY" },
//   { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
//   // Send only the origin on cross-origin navigations (no full path/query leak).
//   { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
//   // Drop browser features we don't use.
//   { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
// ];
// `ga` opens the policy to Google Analytics only when a valid measurement id
// is configured (src/components/analytics/google-analytics.tsx).
const securityHeaders = buildSecurityHeaders({
  dev: process.env.NODE_ENV === "development",
  ga: /^G-[A-Z0-9]{4,20}$/.test(process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim() ?? ""),
  // Sentry's ingest origin, read from the DSN, or null when it is off.
  sentry: sentryIngestOrigin(process.env.NEXT_PUBLIC_SENTRY_DSN),
});

const nextConfig: NextConfig = {
  // The /docs pages render the repo's docs/*.md at request time (the navbar
  // session check makes them dynamic), so the files must ship with the
  // serverless bundle.
  // NOTE: these keys are route paths, so they carry the `[locale]` segment
  // since the public pages moved under it. Getting them wrong does not fail
  // the build: the readers treat a missing folder as "no content", so the docs
  // and the blog would come back *empty* in production instead of erroring.
  outputFileTracingIncludes: {
    "/[locale]/docs/[slug]": ["./docs/**"],
    // Same story for the blog: posts and cover art are read from content/ at
    // request time. Without this they never reach the serverless bundle.
    "/[locale]/blog": ["./content/blog/**"],
    "/[locale]/blog/**": ["./content/blog/**"],
    // The legal pages read content/legal/ the same way (src/lib/legal.ts).
    "/[locale]/privacy": ["./content/legal/**"],
    "/[locale]/terms": ["./content/legal/**"],
    "/[locale]/cookies": ["./content/legal/**"],
    // Not localized: these two live outside `[locale]`.
    "/sitemap.xml": ["./content/blog/**"],
    "/llms.txt": ["./content/blog/**"],
  },
  experimental: {
    serverActions: {
      // PDF uploads go through server actions. The engine caps a PDF at 4 MB
      // (MAX_PDF_BYTES in src/lib/esign/pdf/inspect.ts, under Vercel's 4.5 MB
      // function body limit); this leaves room for multipart overhead.
      // Derived from the cap in src/lib/esign/limits.ts, so raising one
      // raises the other. Was the literal "4.4mb".
      bodySizeLimit: SERVER_ACTION_BODY_LIMIT,
    },
  },
  // Salsox dropped its Italian pages (src/i18n/routing.ts). The /it/* URLs
  // were in the sitemap and may be indexed, so each one goes permanently, in
  // one hop, to the English page it translated rather than to a 404.
  async redirects() {
    return [
      { source: "/it", destination: "/", permanent: true },
      { source: "/it/:path*", destination: "/:path*", permanent: true },
      // One page per search intent: overlapping URLs 301 to the page that
      // owns the intent (src/lib/seo/redirects.ts says which and why).
      ...seoRedirectsForNext(),
    ];
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Never in a search result, whatever links to them: signing links carry
      // a private token, and the app and API answer only signed-in users. A
      // header rather than a <meta> tag because it also covers route handlers
      // (PDF downloads, JSON) that have no <head> to put one in. robots.txt
      // blocks the crawl of some of these; this is what keeps a URL found
      // through an outside link from being indexed anyway.
      // The sign-in pages joined the list with the SEO work: their layout
      // already sets noindex, and the header covers any response without a
      // <head> as well.
      ...["/sign/:path*", "/dashboard/:path*", "/admin/:path*", "/api/:path*", "/login", "/signup", "/2fa", "/forgot-password", "/reset-password", "/verify-request"].map((source) => ({
        source,
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      })),
    ];
  },
};

// Sentry's build step (src/lib/sentry.ts has the runtime side). Uploads the
// browser and server source maps, so a stack trace in Sentry points at the
// original TypeScript rather than minified chunks, then deletes the maps from
// the build output so they are never served publicly.
//
// The upload needs three build-time variables, none of them read at runtime:
// SENTRY_AUTH_TOKEN (an organization auth token with the project:releases and
// org:read scopes), SENTRY_ORG and SENTRY_PROJECT (the slugs in the project's
// URL). Without the token the upload is switched off rather than attempted,
// and errors are still reported, with minified stack traces.
const sentryUpload = Boolean(process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG && process.env.SENTRY_PROJECT);

// Was: export default withNextIntl(nextConfig);
export default withSentryConfig(withNextIntl(nextConfig), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  sourcemaps: { disable: !sentryUpload, deleteSourcemapsAfterUpload: true },
  // Every client chunk, not only the app's own, so frames inside Next and
  // the libraries resolve too.
  widenClientFileUpload: true,
  // Quiet locally; CI and Vercel logs show what was uploaded.
  silent: !process.env.CI,
  // No usage data about this build sent to Sentry.
  telemetry: false,
  // No `webpack.treeshake` (dropping tracing and debug code from the browser
  // bundle): Sentry applies it to webpack builds only, and Next 16 builds
  // with Turbopack, where it would be a setting that does nothing.
});
