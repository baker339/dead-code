"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getRepositoryEntitlements, maxRepositoriesForTier } from "@/lib/entitlements";
import { fetchRepoForUser, getOctokitForUser } from "@/lib/github";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function connectRepository(fullName: string): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: "You must be signed in." };
  }

  const userId = session.user.id;
  const octokit = await getOctokitForUser(userId);
  if (!octokit) {
    return {
      ok: false,
      error: "No GitHub token found. Sign out and sign in again.",
    };
  }

  let remote;
  try {
    remote = await fetchRepoForUser(octokit, fullName.trim());
  } catch {
    return {
      ok: false,
      error: "Could not access that repository on GitHub.",
    };
  }

  const existing = await prisma.repository.findUnique({
    where: {
      userId_githubId: { userId, githubId: remote.id },
    },
  });

  if (!existing) {
    const { count, tier } = await getRepositoryEntitlements(userId);
    const max = maxRepositoriesForTier(tier);
    if (count >= max) {
      return {
        ok: false,
        error:
          tier === "FREE"
            ? "Free plan allows 1 repository. Upgrade to Pro for more."
            : `You have reached your limit of ${max} repositories.`,
      };
    }
  }

  await prisma.repository.upsert({
    where: {
      userId_githubId: { userId, githubId: remote.id },
    },
    create: {
      userId,
      githubId: remote.id,
      fullName: remote.full_name,
      defaultBranch: remote.default_branch ?? "main",
    },
    update: {
      fullName: remote.full_name,
      defaultBranch: remote.default_branch ?? "main",
    },
  });

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/files");
  return { ok: true };
}

export async function disconnectRepository(
  repositoryId: string,
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: "You must be signed in." };
  }

  const repo = await prisma.repository.findFirst({
    where: { id: repositoryId, userId: session.user.id },
  });
  if (!repo) {
    return { ok: false, error: "Repository not found." };
  }

  await prisma.repository.delete({ where: { id: repositoryId } });

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/files");
  return { ok: true };
}
