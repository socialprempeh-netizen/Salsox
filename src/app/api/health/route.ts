import { NextResponse } from "next/server"
import { siteConfig } from "@/config/site"
import { getSchemaStatus } from "@/lib/schema-status"
import { checkDatabase, healthStatusCode } from "@/lib/health"
import { prisma } from "@/lib/prisma"

// Always fresh: a cached health check reports the version of whatever build
// happened to fill the cache, which is the opposite of what it is for.
export const dynamic = "force-dynamic"

/**
 * What is actually running here, whether it can reach its database, and
 * whether that database can run it. Public on purpose: it is the URL an
 * uptime monitor (UptimeRobot or similar) is pointed at, and the proxy does
 * not list /api/health among the private prefixes.
 *
 * The status code is the contract with the monitor: 200 when the database
 * answers a ping, 503 when it throws or does not answer within
 * DATABASE_PING_TIMEOUT_MS (src/lib/health.ts). A monitor that only reads
 * status codes needs nothing else. The body says which check failed, for the
 * person the monitor paged.
 *
 * The release smoke calls this first and compares `version` with the version
 * being shipped, which is the check that would have caught the deploy that
 * silently kept serving the previous build. `commit` comes from Vercel and is
 * null on a local run.
 *
 * `schema` is the one internal detail reported, and the exception is
 * deliberate. This stays a cheap, unauthenticated endpoint that anyone can hit,
 * so it says nothing about third-party services: if Stripe or Resend are down,
 * the app is alive and degraded, and a public health check has no business
 * listing your vendors. A database that is behind the code is alive and wrong:
 * public pages render and the first sign-in fails. It is reported as a boolean
 * and a count (never the migration names), and does not change the status
 * code, because the database answering is what the monitor is asking about.
 */
export async function GET() {
  const [database, schema] = await Promise.all([checkDatabase(() => prisma.$queryRaw`SELECT 1`), getSchemaStatus()])
  const code = healthStatusCode(database)

  return NextResponse.json(
    {
      status: code === 200 ? "ok" : "error",
      checks: { database: database.ok ? "ok" : "unreachable" },
      latencyMs: { database: database.latencyMs },
      version: siteConfig.version,
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
      // Not a secret: a demo deployment announces itself with a banner anyway.
      // It lets the release smoke expect the right thing about indexing rather
      // than being told which mode it is looking at.
      demo: process.env.DEMO_MODE === "true",
      schema,
      timestamp: new Date().toISOString(),
    },
    { status: code, headers: { "cache-control": "no-store" } },
  )
}

/**
 * Same check, no body. Several monitors (UptimeRobot's HTTP checks among
 * them) send HEAD by default, and a route without it answers 405, which reads
 * as "down" forever.
 */
export async function HEAD() {
  const database = await checkDatabase(() => prisma.$queryRaw`SELECT 1`)
  return new Response(null, { status: healthStatusCode(database), headers: { "cache-control": "no-store" } })
}

// Replaced by the GET above, which pings the database and answers 503 when it
// cannot be reached, so an uptime monitor can be pointed at this URL. This
// version always answered 200 and reported an unreachable database only as
// `schema: { aligned: null }`, which a monitor reading status codes never saw.
// export async function GET() {
//   const schema = await getSchemaStatus()
//
//   return NextResponse.json(
//     {
//       status: "ok",
//       version: siteConfig.version,
//       commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
//       environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
//       demo: process.env.DEMO_MODE === "true",
//       schema,
//       timestamp: new Date().toISOString(),
//     },
//     { headers: { "cache-control": "no-store" } },
//   )
// }
