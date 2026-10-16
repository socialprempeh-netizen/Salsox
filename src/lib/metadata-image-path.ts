/**
 * Recognises the social-card and icon images Next generates for pages under
 * `src/app/[locale]/`, when they are addressed with the default locale's
 * prefix: `/en/vs/docuseal/opengraph-image-1c3u1r`.
 *
 * Why it exists: Next writes those URLs, with the literal `/en`, into every
 * page's `og:image` and `twitter:image`. The default locale has no prefix on
 * this site (`localePrefix: "as-needed"`), so the i18n middleware answered
 * each one with a 307 to the unprefixed path, and every share preview cost a
 * crawler a redirect before it got the image. The image routes do not need
 * the middleware at all (each sets its locale itself), so the proxy lets
 * these paths through untouched and they answer 200 directly.
 *
 * Only metadata image files match: a page under `/en/...` still redirects to
 * its one canonical, unprefixed address.
 */
const METADATA_IMAGE = /^(opengraph-image|twitter-image|icon|apple-icon)(-[a-z0-9]+)?(\.(png|jpe?g|gif|svg|ico))?$/

export function isLocalizedMetadataImagePath(pathname: string, defaultLocale: string): boolean {
  const prefix = `/${defaultLocale}/`
  if (!pathname.startsWith(prefix)) return false
  const last = pathname.slice(pathname.lastIndexOf("/") + 1)
  return METADATA_IMAGE.test(last)
}
