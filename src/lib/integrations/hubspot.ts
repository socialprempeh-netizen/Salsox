/**
 * HubSpot, with Salsox as an OAuth 2.0 client of it (authorization code
 * grant), as pure rules: configuration, the authorize address, reading token
 * answers, and when to refresh. The calls are in hubspot-store.ts; the flow's
 * routes are /api/integrations/hubspot/{connect,callback}. Tested in
 * hubspot.test.ts.
 *
 * Why OAuth: HubSpot's marketplace accepts only OAuth apps, never API keys
 * (marketing/marketplace-listings/hubspot.md scopes the app). Configured by
 * HUBSPOT_CLIENT_ID and HUBSPOT_CLIENT_SECRET from the HubSpot app's Auth
 * settings, whose redirect URL must be `<site>/api/integrations/hubspot/callback`.
 * HUBSPOT_SCOPES replaces the default scopes (space or comma separated);
 * they must match the app's own scope settings exactly, or HubSpot refuses
 * the install. Without the two credentials HubSpot is not offered.
 *
 * Endpoints as documented at the time of writing (HubSpot's v1 OAuth API):
 * authorize on app.hubspot.com, token, token metadata and refresh-token
 * revocation on api.hubapi.com. Access tokens last about thirty minutes;
 * they are refreshed a minute early.
 */

export const HUBSPOT_AUTHORIZE_URL = "https://app.hubspot.com/oauth/authorize"
export const HUBSPOT_TOKEN_URL = "https://api.hubapi.com/oauth/v1/token"
export const hubspotTokenInfoUrl = (accessToken: string) => `https://api.hubapi.com/oauth/v1/access-tokens/${encodeURIComponent(accessToken)}`
export const hubspotRevokeUrl = (refreshToken: string) => `https://api.hubapi.com/oauth/v1/refresh-tokens/${encodeURIComponent(refreshToken)}`

/** Least needed for the listing's features: who the contact is, which deal. `oauth` is required by HubSpot. */
export const HUBSPOT_DEFAULT_SCOPES = ["oauth", "crm.objects.contacts.read", "crm.objects.deals.read"]

/** Refresh this long before HubSpot's stated expiry, so a call never carries a token about to lapse. */
const EXPIRY_MARGIN_MS = 60_000

export type HubSpotConfig = { clientId: string; clientSecret: string; scopes: string[] }

export function hubspotConfig(env: Record<string, string | undefined> = process.env): HubSpotConfig | null {
  const clientId = env.HUBSPOT_CLIENT_ID?.trim()
  const clientSecret = env.HUBSPOT_CLIENT_SECRET?.trim()
  if (!clientId || !clientSecret) return null
  const scopes = (env.HUBSPOT_SCOPES ?? "").split(/[\s,]+/).filter(Boolean)
  return { clientId, clientSecret, scopes: scopes.length ? scopes : HUBSPOT_DEFAULT_SCOPES }
}

/** Where an integration's flow returns to, on this site. */
export function integrationCallbackUrl(appUrl: string, provider: string): string {
  return `${appUrl.replace(/\/+$/, "")}/api/integrations/${provider}/callback`
}

export function hubspotAuthorizeUrl(input: { config: HubSpotConfig; redirectUri: string; state: string }): string {
  const params = new URLSearchParams({ client_id: input.config.clientId, redirect_uri: input.redirectUri, scope: input.config.scopes.join(" "), state: input.state })
  return `${HUBSPOT_AUTHORIZE_URL}?${params}`
}

/** The form body of a token request: a code to exchange, or a refresh token to use. */
export function hubspotTokenBody(input: { config: HubSpotConfig; redirectUri: string } & ({ code: string } | { refreshToken: string })): URLSearchParams {
  const common = { client_id: input.config.clientId, client_secret: input.config.clientSecret, redirect_uri: input.redirectUri }
  return "code" in input
    ? new URLSearchParams({ grant_type: "authorization_code", code: input.code, ...common })
    : new URLSearchParams({ grant_type: "refresh_token", refresh_token: input.refreshToken, ...common })
}

export type HubSpotTokens = { accessToken: string; refreshToken: string; expiresAt: Date }

/** A token answer, or null when it is not one (an error body, a missing field). */
export function readHubSpotTokens(body: unknown, now: Date): HubSpotTokens | null {
  if (!body || typeof body !== "object") return null
  const b = body as Record<string, unknown>
  if (typeof b.access_token !== "string" || typeof b.refresh_token !== "string" || typeof b.expires_in !== "number") return null
  return { accessToken: b.access_token, refreshToken: b.refresh_token, expiresAt: new Date(now.getTime() + b.expires_in * 1000 - EXPIRY_MARGIN_MS) }
}

/** The connected account from the token metadata answer: hub id, domain and granted scopes. */
export function readHubSpotTokenInfo(body: unknown): { hubId: string; hubDomain: string | null; scopes: string[] } | null {
  if (!body || typeof body !== "object") return null
  const b = body as Record<string, unknown>
  if (typeof b.hub_id !== "number" && typeof b.hub_id !== "string") return null
  return { hubId: String(b.hub_id), hubDomain: typeof b.hub_domain === "string" ? b.hub_domain : null, scopes: Array.isArray(b.scopes) ? b.scopes.filter((s): s is string => typeof s === "string") : [] }
}

export function needsRefresh(expiresAt: Date, now: Date): boolean {
  return expiresAt.getTime() <= now.getTime()
}
