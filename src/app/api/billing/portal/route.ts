import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { siteConfig } from "@/config/site"
import { stripe } from "@/lib/stripe"
import { prisma } from "@/lib/prisma"

/**
 * Opens the Stripe Customer Portal for the signed-in user.
 *
 * Stripe failures are answered with a message the billing page can show, not
 * a 500: the portal not being configured in the Stripe dashboard (Stripe
 * refuses every session until it is) and a customer that no longer exists
 * each get their own, and the details go to the log.
 */
export async function POST() {
  const currentUser = await getCurrentUser()
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const user = await prisma.user.findUnique({
    where: { id: currentUser.id },
    select: { stripeCustomerId: true },
  })

  if (!user?.stripeCustomerId) {
    return NextResponse.json({ error: "No billing account found" }, { status: 404 })
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: "Billing is not configured" }, { status: 503 })
  }

  try {
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      // Through siteConfig.url: the raw variable gave Stripe "undefined/..." when unset.
      return_url: `${siteConfig.url}/dashboard/billing`,
    })
    return NextResponse.json({ url: portalSession.url })
  } catch (error) {
    console.error("[billing portal] session failed", error)
    const code = (error as { code?: string }).code
    const message = String((error as Error).message ?? "")
    if (code === "resource_missing") {
      return NextResponse.json({ error: "We couldn't find your billing account. Contact us and we'll sort it out." }, { status: 404 })
    }
    if (/configuration/i.test(message)) {
      return NextResponse.json({ error: "The billing portal isn't available yet. Contact us to change your plan." }, { status: 503 })
    }
    return NextResponse.json({ error: "We couldn't open the billing portal. Please try again in a moment." }, { status: 502 })
  }
}
