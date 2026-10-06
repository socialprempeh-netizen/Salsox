/**
 * The liveness check behind /api/health: can this deployment reach its
 * database right now?
 *
 * It exists so an uptime monitor (UptimeRobot, Better Stack, Vercel's own
 * checks) has one URL whose status code means something. A page that renders
 * proves the function boots; it does not prove the database answers, and
 * without the database nobody can sign in, send or sign. So the endpoint
 * answers 503 when the ping fails or does not come back in time, and a monitor
 * that only looks at status codes pages someone.
 *
 * The ping is injected so the rule ("slow is down") can be tested without a
 * database, and the timeout is short on purpose: a monitor waiting thirty
 * seconds for a hung connection is a monitor that reports the outage late.
 */

export type DatabaseCheck = { ok: true; latencyMs: number } | { ok: false; latencyMs: number }

/** How long the ping may take before the database counts as unreachable. */
export const DATABASE_PING_TIMEOUT_MS = 3000

export async function checkDatabase(
  ping: () => Promise<unknown>,
  timeoutMs = DATABASE_PING_TIMEOUT_MS,
  now: () => number = () => performance.now(),
): Promise<DatabaseCheck> {
  const started = now()
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`no answer within ${timeoutMs} ms`)), timeoutMs)
  })
  try {
    await Promise.race([ping(), timeout])
    return { ok: true, latencyMs: Math.round(now() - started) }
  } catch {
    return { ok: false, latencyMs: Math.round(now() - started) }
  } finally {
    clearTimeout(timer)
  }
}

/** The HTTP status a monitor reads: anything but 200 is an alert. */
export function healthStatusCode(database: DatabaseCheck): 200 | 503 {
  return database.ok ? 200 : 503
}
