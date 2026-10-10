/**
 * Which OAuth sign-in providers this deployment can actually use: a provider
 * counts only when both its client ID and secret are set.
 *
 * Why this exists: src/auth.ts registered Google and GitHub unconditionally,
 * with `process.env.GOOGLE_CLIENT_ID!` and friends, and the sign-in page always
 * showed both buttons. On a deployment without the credentials, pressing
 * "Continue with Google" threw BetterAuthError CLIENT_ID_AND_SECRET_REQUIRED
 * inside the server action and the visitor got the error page (production,
 * October 2026: every signed-out visitor who chose Google, including everyone
 * arriving from an email link in Gmail's in-app browser, which has no session).
 *
 * Now the auth config registers, and the sign-in and settings pages offer,
 * only the providers listed here; the actions check it too, since a form can
 * be posted without its button. Setting both variables brings a provider
 * back, with no code change. Pure: takes the environment as an argument.
 */

export const OAUTH_PROVIDERS = ["google", "github"] as const
export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number]

const CREDENTIALS: Record<OAuthProvider, { id: string; secret: string }> = {
  google: { id: "GOOGLE_CLIENT_ID", secret: "GOOGLE_CLIENT_SECRET" },
  github: { id: "GITHUB_CLIENT_ID", secret: "GITHUB_CLIENT_SECRET" },
}

/** The providers whose client ID and secret are both set (blank counts as unset). */
export function configuredOAuthProviders(env: Record<string, string | undefined>): OAuthProvider[] {
  return OAUTH_PROVIDERS.filter((p) => Boolean(env[CREDENTIALS[p].id]?.trim() && env[CREDENTIALS[p].secret]?.trim()))
}

/** Whether `provider` is one of ours and usable here. */
export function isOAuthProviderConfigured(provider: string, env: Record<string, string | undefined>): provider is OAuthProvider {
  return (configuredOAuthProviders(env) as string[]).includes(provider)
}

/** Better Auth's `socialProviders` option, with only the configured providers in it. */
export function socialProvidersConfig(env: Record<string, string | undefined>) {
  return Object.fromEntries(
    configuredOAuthProviders(env).map((p) => [p, { clientId: env[CREDENTIALS[p].id]!.trim(), clientSecret: env[CREDENTIALS[p].secret]!.trim() }])
  ) as Partial<Record<OAuthProvider, { clientId: string; clientSecret: string }>>
}
