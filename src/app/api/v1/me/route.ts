/**
 * GET /api/v1/me: the account an API key belongs to. Integration platforms
 * call it to test a key when someone connects their account ("Zapier
 * connected as ama@example.com"), so it returns just enough to name it.
 */
import { NextResponse } from "next/server"
import { withApiKey } from "@/lib/api/v1"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  return withApiKey(request, async (caller) => NextResponse.json({ id: caller.userId, email: caller.email, name: caller.name }))
}
