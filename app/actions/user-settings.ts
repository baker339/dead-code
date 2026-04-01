"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import type { ActionResult } from "@/app/actions/repositories";

const MAX_IGNORE_GLOBS = 50;

export async function dismissOnboarding(): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: "You must be signed in." };
  }
  await prisma.userSettings.upsert({
    where: { userId: session.user.id },
    create: {
      userId: session.user.id,
      onboardingDismissedAt: new Date(),
    },
    update: { onboardingDismissedAt: new Date() },
  });
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function updatePathIgnoreGlobs(formData: FormData): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: "You must be signed in." };
  }
  const raw = String(formData.get("globs") ?? "");
  const lines = raw
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  if (lines.length > MAX_IGNORE_GLOBS) {
    return {
      ok: false,
      error: `At most ${MAX_IGNORE_GLOBS} patterns allowed.`,
    };
  }
  await prisma.userSettings.upsert({
    where: { userId: session.user.id },
    create: {
      userId: session.user.id,
      pathIgnoreGlobs: lines,
    },
    update: { pathIgnoreGlobs: lines },
  });
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard");
  return { ok: true };
}
