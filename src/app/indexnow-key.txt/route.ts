import { resolveIndexNowKey } from "@/lib/indexnow"

/**
 * The IndexNow key file, served at /indexnow-key.txt.
 *
 * Search engines fetch it to confirm that a submission naming this host really
 * came from the people who run it: the body must be the key, and nothing
 * else. Every submission names this path as its `keyLocation`, which the
 * protocol allows in place of the default `/{key}.txt`; a fixed path is what
 * lets the key itself live in an environment variable instead of a file name.
 *
 * Public by design: the key proves ownership of the host, it grants nothing.
 * When IndexNow is off (no key and no CRON_SECRET) this is a 404.
 */
export function GET(): Response {
  const key = resolveIndexNowKey(process.env)
  if (!key) return new Response("Not found", { status: 404 })
  return new Response(key, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  })
}
