import { headers } from "next/headers";
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { prisma } from "@/lib/db";
import { getStripe, webhookConfigured } from "@/lib/stripe";

export const runtime = "nodejs";

async function resolveUserId(sub: Stripe.Subscription): Promise<string | null> {
  const fromMeta = sub.metadata?.userId;
  if (fromMeta) return fromMeta;
  const row = await prisma.subscription.findFirst({
    where: { stripeSubscriptionId: sub.id },
    select: { userId: true },
  });
  return row?.userId ?? null;
}

export async function POST(req: Request) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !webhookConfigured() || !secret) {
    return NextResponse.json(
      { error: "Stripe webhook is not configured." },
      { status: 500 },
    );
  }

  const body = await req.text();
  const sig = (await headers()).get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, secret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const sess = event.data.object as Stripe.Checkout.Session;
        if (sess.mode !== "subscription") break;
        const userId = sess.metadata?.userId;
        if (!userId) break;

        const customerId =
          typeof sess.customer === "string"
            ? sess.customer
            : sess.customer?.id;
        const subId =
          typeof sess.subscription === "string"
            ? sess.subscription
            : sess.subscription?.id;
        if (!customerId || !subId) break;

        const fullSub = await stripe.subscriptions.retrieve(subId);
        const firstItem = fullSub.items.data[0];
        const priceId = firstItem?.price?.id ?? null;
        const periodEndTs = firstItem?.current_period_end;
        const periodEnd = periodEndTs
          ? new Date(periodEndTs * 1000)
          : null;

        await prisma.user.update({
          where: { id: userId },
          data: { subscriptionTier: "PRO" },
        });

        await prisma.subscription.upsert({
          where: { userId },
          create: {
            userId,
            status: fullSub.status,
            stripeCustomerId: customerId,
            stripeSubscriptionId: subId,
            stripePriceId: priceId,
            currentPeriodEnd: periodEnd,
          },
          update: {
            status: fullSub.status,
            stripeCustomerId: customerId,
            stripeSubscriptionId: subId,
            stripePriceId: priceId,
            currentPeriodEnd: periodEnd,
          },
        });
        break;
      }

      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const userId = await resolveUserId(sub);
        if (!userId) break;

        const customerId =
          typeof sub.customer === "string"
            ? sub.customer
            : sub.customer?.id;
        if (!customerId) break;

        const active =
          sub.status === "active" || sub.status === "trialing";
        const tier = active ? "PRO" : "FREE";

        await prisma.user.update({
          where: { id: userId },
          data: { subscriptionTier: tier },
        });

        const periodEndTs = sub.items.data[0]?.current_period_end;
        const periodEnd = periodEndTs
          ? new Date(periodEndTs * 1000)
          : null;

        await prisma.subscription.upsert({
          where: { userId },
          create: {
            userId,
            status: sub.status,
            stripeCustomerId: customerId,
            stripeSubscriptionId: sub.id,
            stripePriceId: sub.items.data[0]?.price?.id ?? null,
            currentPeriodEnd: periodEnd,
          },
          update: {
            status: sub.status,
            stripeCustomerId: customerId,
            stripeSubscriptionId: sub.id,
            stripePriceId: sub.items.data[0]?.price?.id ?? undefined,
            currentPeriodEnd: periodEnd,
          },
        });
        break;
      }

      default:
        break;
    }
  } catch (e) {
    console.error("[stripe webhook]", e);
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
