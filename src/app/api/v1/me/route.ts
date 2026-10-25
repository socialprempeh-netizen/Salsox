/**
 * GET /api/v1/me: the account an API key belongs to. Integration platforms
 * call it to test a key when someone connects their account ("Zapier
 * connected as ama@example.com"), so it returns just enough to name it.
 *
 * Also the account's plan, from the same rules sending applies (senderPlan
 * in src/lib/esign/sender.ts, plans.ts): the tier, the free documents left
 * this month (null when unlimited) and which plan features it has. The Salsox
 * Signing extension reads it to show the allowance and to offer an upgrade
 * before a send the server would refuse. The server still refuses it either
 * way; this is only so the person is told first.
 */
import { NextResponse } from "next/server"
import { withApiKey } from "@/lib/api/v1"
import { senderPlan } from "@/lib/esign/sender"
import { FREE_DOCUMENTS_PER_MONTH, hasFeature } from "@/lib/esign/plans"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  return withApiKey(request, async (caller) => {
    const plan = await senderPlan(caller.userId)
    return NextResponse.json({
      id: caller.userId,
      email: caller.email,
      name: caller.name,
      plan: {
        tier: plan.tier,
        documents_left: plan.documentsLeft,
        documents_per_month: plan.documentsLeft === null ? null : FREE_DOCUMENTS_PER_MONTH,
        features: {
          sequential_signing: hasFeature(plan.tier, "sequentialSigning"),
          sign_and_pay: hasFeature(plan.tier, "signAndPay"),
          approvers: hasFeature(plan.tier, "approvers"),
        },
      },
    })
  })
}
