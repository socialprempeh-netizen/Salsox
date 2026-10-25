/**
 * Salsox Signing: where the extension's server is. Everything the extension
 * talks to is under this address: /extension/connect to sign in, /api/v1 to
 * send, /pricing and /login in tabs. manifest.json's host_permissions must
 * name the same origin, or the API calls are refused.
 */
export const SERVER = "https://salsox.com"

/** Added to the links the extension opens, so the site can tell where a visit came from. */
export const UTM = "utm_source=salsox_signing&utm_medium=extension&utm_campaign=salsox_signing"
