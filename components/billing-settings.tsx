import { startProCheckout, openCustomerPortal } from "@/app/actions/billing";
import { checkoutConfigured } from "@/lib/stripe";

type Tier = "FREE" | "PRO" | "ENTERPRISE";

export function BillingSettings({
  tier,
  hasStripeCustomer,
}: {
  tier: Tier;
  hasStripeCustomer: boolean;
}) {
  const configured = checkoutConfigured();

  return (
    <section className="mt-12 border-t border-zinc-200 pt-10">
      <h2 className="text-lg font-semibold text-zinc-900">Billing</h2>
      <p className="mt-2 text-base text-zinc-600">
        Pro unlocks more repositories and higher analysis limits. Enterprise is
        sales-assisted. After upgrading, use{" "}
        <span className="font-medium text-zinc-800">Manage billing</span> for
        invoices and cancellation.
      </p>
      <ul className="mt-3 list-inside list-disc text-base text-zinc-600">
        <li>Higher repo cap (see env <code className="text-sm">PRO_MAX_REPOS</code>)</li>
        <li>Same analysis engine — dead code, debt scores, lockfile audits</li>
      </ul>

      {!configured && (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-base text-amber-950">
          Payments are not configured on this deployment. Set{" "}
          <code className="rounded bg-amber-100 px-1.5 text-sm">
            STRIPE_SECRET_KEY
          </code>{" "}
          and{" "}
          <code className="rounded bg-amber-100 px-1.5 text-sm">
            STRIPE_PRICE_PRO
          </code>{" "}
          in the environment to enable Checkout.
        </p>
      )}

      {configured && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <p className="text-base text-zinc-700">
            Current plan:{" "}
            <span className="font-semibold text-zinc-900">{tier}</span>
          </p>
          {tier === "FREE" && (
            <form action={startProCheckout}>
              <button
                type="submit"
                className="rounded-md bg-zinc-900 px-4 py-2.5 text-base font-medium text-white hover:bg-zinc-800"
              >
                Upgrade to Pro
              </button>
            </form>
          )}
          {hasStripeCustomer && (
            <form action={openCustomerPortal}>
              <button
                type="submit"
                className="rounded-md border border-zinc-300 px-4 py-2.5 text-base font-medium text-zinc-800 hover:bg-zinc-50"
              >
                Manage billing
              </button>
            </form>
          )}
        </div>
      )}
    </section>
  );
}
