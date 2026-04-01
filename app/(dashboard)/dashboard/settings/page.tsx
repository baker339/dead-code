import { auth } from "@/auth";
import { RepositorySettings } from "@/components/repository-settings";
import { getRepositoryEntitlements } from "@/lib/entitlements";
import { listGithubReposForUser } from "@/lib/github";
import { prisma } from "@/lib/db";
import { BillingSettings } from "@/components/billing-settings";
import { AnalysisSettings } from "@/components/analysis-settings";
import { getOrCreateUserSettings } from "@/lib/user-settings";
import { parsePathIgnoreGlobs } from "@/lib/path-ignore";

function toPlanTier(tier: string): "FREE" | "PRO" | "ENTERPRISE" {
  if (tier === "PRO") return "PRO";
  if (tier === "ENTERPRISE") return "ENTERPRISE";
  return "FREE";
}

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    return null;
  }

  const userId = session.user.id;

  const [connected, githubRepos, ent, subscription, userSettings] =
    await Promise.all([
      prisma.repository.findMany({
        where: { userId },
        orderBy: { fullName: "asc" },
        select: { id: true, fullName: true, defaultBranch: true },
      }),
      listGithubReposForUser(userId),
      getRepositoryEntitlements(userId),
      prisma.subscription.findUnique({
        where: { userId },
        select: { stripeCustomerId: true },
      }),
      getOrCreateUserSettings(userId),
    ]);

  const pathIgnoreGlobs = parsePathIgnoreGlobs(userSettings.pathIgnoreGlobs);

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
        Settings
      </h1>
      <p className="mt-2 text-base text-zinc-600">
        Connect GitHub repositories to analyze. Access uses your signed-in
        GitHub account.
      </p>
      <div className="mt-8">
        <RepositorySettings
          connected={connected}
          githubRepos={githubRepos}
          entitlements={{
            tier: toPlanTier(ent.tier),
            max: ent.max,
            count: ent.count,
            canAddMore: ent.canAddMore,
          }}
        />
      </div>
      <div className="mt-12 border-t border-zinc-200 pt-12">
        <AnalysisSettings initialGlobs={pathIgnoreGlobs} />
      </div>
      <BillingSettings
        tier={toPlanTier(ent.tier)}
        hasStripeCustomer={Boolean(subscription?.stripeCustomerId)}
      />
    </div>
  );
}
