import Stripe from "stripe";

let stripeSingleton: Stripe | null = null;

export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  if (!stripeSingleton) {
    stripeSingleton = new Stripe(key, {
      apiVersion: "2026-03-25.dahlia",
      typescript: true,
    });
  }
  return stripeSingleton;
}

/** Enough to start Checkout (upgrade to Pro). */
export function checkoutConfigured(): boolean {
  return Boolean(
    process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_PRO,
  );
}

export function webhookConfigured(): boolean {
  return Boolean(process.env.STRIPE_WEBHOOK_SECRET);
}

export function appBaseUrl(): string {
  const n = process.env.NEXTAUTH_URL ?? process.env.VERCEL_URL;
  if (!n) return "http://localhost:3000";
  return n.startsWith("http") ? n : `https://${n}`;
}
