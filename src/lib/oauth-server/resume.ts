/**
 * The cookie that brings a visitor back to the OAuth consent page after they
 * sign in (src/app/api/oauth/resume sets and clears it; the dashboard
 * layout reads it).
 * Its own file, with no imports, so anything can read the name cheaply.
 */
export const OAUTH_RESUME_COOKIE = "sx_oauth_resume"
export const OAUTH_RESUME_MINUTES = 15
