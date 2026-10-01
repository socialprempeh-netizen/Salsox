import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { siteConfig } from "@/config/site"
import { stripe } from "@/lib/stripe"
import { prisma } from "@/lib/prisma"

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

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    // Through siteConfig.url: the raw variable gave Stripe "undefined/..." when unset.
    return_url: `${siteConfig.url}/dashboard/billing`,
  })

  return NextResponse.json({ url: portalSession.url })
}
