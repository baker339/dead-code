"use server";

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { appBaseUrl, getStripe } from "@/lib/stripe";

export async function startProCheckout(): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const stripe = getStripe();
  const priceId = process.env.STRIPE_PRICE_PRO;
  if (!stripe || !priceId) {
    throw new Error("Stripe Checkout is not configured (STRIPE_SECRET_KEY / STRIPE_PRICE_PRO).");
  }

  const checkout = await stripe.checkout.sessions.create({
    mode: "subscription",
    ...(session.user.email ? { customer_email: session.user.email } : {}),
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${appBaseUrl()}/dashboard/settings?checkout=success`,
    cancel_url: `${appBaseUrl()}/dashboard/settings?checkout=cancel`,
    metadata: { userId: session.user.id },
    subscription_data: { metadata: { userId: session.user.id } },
  });

  if (!checkout.url) {
    throw new Error("Stripe did not return a checkout URL.");
  }

  redirect(checkout.url);
}

export async function openCustomerPortal(): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const stripe = getStripe();
  if (!stripe) {
    throw new Error("Stripe is not configured.");
  }

  const row = await prisma.subscription.findUnique({
    where: { userId: session.user.id },
  });
  if (!row?.stripeCustomerId) {
    throw new Error("No billing profile yet. Subscribe to Pro first.");
  }

  const portal = await stripe.billingPortal.sessions.create({
    customer: row.stripeCustomerId,
    return_url: `${appBaseUrl()}/dashboard/settings`,
  });

  if (!portal.url) {
    throw new Error("Stripe did not return a portal URL.");
  }

  redirect(portal.url);
}
