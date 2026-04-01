import type { SubscriptionTier } from "@prisma/client";
import { prisma } from "@/lib/db";

export function maxRepositoriesForTier(tier: SubscriptionTier): number {
  switch (tier) {
    case "FREE":
      return 1;
    case "PRO":
      return Number.parseInt(process.env.PRO_MAX_REPOS ?? "50", 10);
    case "ENTERPRISE":
      return Number.parseInt(process.env.ENTERPRISE_MAX_REPOS ?? "500", 10);
    default:
      return 1;
  }
}

export async function getRepositoryEntitlements(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { subscriptionTier: true },
  });
  if (!user) {
    return {
      tier: "FREE" as SubscriptionTier,
      max: 1,
      count: 0,
      canAddMore: true,
    };
  }
  const count = await prisma.repository.count({ where: { userId } });
  const max = maxRepositoriesForTier(user.subscriptionTier);
  return {
    tier: user.subscriptionTier,
    max,
    count,
    canAddMore: count < max,
  };
}
