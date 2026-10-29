/**
 * Ownership proofs for Google Search Console and Bing Webmaster Tools, as
 * the meta tags the root layout renders (src/app/layout.tsx), from
 * GOOGLE_SITE_VERIFICATION and BING_SITE_VERIFICATION.
 *
 * Both tools show the proof as a whole tag to copy
 * (<meta name="google-site-verification" content="..." />), and that whole
 * tag is often what gets pasted into the variable; rendered as the content
 * of another tag it verifies nothing. So either form is accepted: the code
 * alone, or the full tag, from which the code is taken. Pure; tested in
 * verification.test.ts.
 */

/** The verification code from a variable holding either the code or the whole meta tag; null when empty. */
export function verificationCode(value: string | undefined): string | null {
  const raw = value?.trim()
  if (!raw) return null
  const fromTag = /content\s*=\s*["']([^"']+)["']/i.exec(raw)?.[1]
  const code = (fromTag ?? raw).trim()
  return /^[A-Za-z0-9_\-+=/.]+$/.test(code) ? code : null
}

/** The `verification` field of the root metadata: only the tags whose codes are set. */
export function siteVerification(env: Record<string, string | undefined> = process.env): { google?: string; other?: Record<string, string> } {
  const google = verificationCode(env.GOOGLE_SITE_VERIFICATION)
  const bing = verificationCode(env.BING_SITE_VERIFICATION)
  return { ...(google ? { google } : {}), ...(bing ? { other: { "msvalidate.01": bing } } : {}) }
}
