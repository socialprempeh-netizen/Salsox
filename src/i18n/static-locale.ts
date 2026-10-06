/**
 * The locale the root layout can know without reading the request.
 *
 * The root layout sits above `[locale]`, so it cannot take the locale as a
 * param, and next-intl's `getLocale()` falls back to a request header there.
 * Reading a header makes every page under the layout dynamic: that is half of
 * what kept the landing page from being cached (the other half was the
 * session check). With a single locale the answer cannot vary, so it is
 * stated rather than read, and the public pages can be static.
 *
 * Add a second locale and this returns null: the layout reads the request
 * again, which is correct for `<html lang>` and makes the pages dynamic. The
 * cost of a second language is then a choice made in the open, not a surprise.
 */
export function singleLocale(locales: readonly string[], defaultLocale: string): string | null {
  return locales.length === 1 && locales[0] === defaultLocale ? defaultLocale : null
}
