"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { inngest } from "@/lib/inngest/client";
import { runAnalysisJob } from "@/lib/analysis/run-analysis";

export type AnalysisActionResult =
  | { ok: true; analysisRunId: string }
  | { ok: false; error: string };

export async function startAnalysis(
  repositoryId: string,
): Promise<AnalysisActionResult> {
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

  const run = await prisma.analysisRun.create({
    data: {
      repositoryId: repo.id,
      status: "PENDING",
    },
  });

  const inlineDev =
    process.env.NODE_ENV === "development" &&
    process.env.ANALYSIS_INLINE === "true";

  if (inlineDev) {
    try {
      await runAnalysisJob(run.id);
    } catch {
      /* runAnalysisJob records FAILED and rethrows */
    }
    const updated = await prisma.analysisRun.findUnique({
      where: { id: run.id },
    });
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/files");
    if (updated?.status !== "COMPLETED") {
      return {
        ok: false,
        error:
          updated?.error?.slice(0, 400) ??
          "Analysis did not complete successfully.",
      };
    }
    return { ok: true, analysisRunId: run.id };
  }

  try {
    await inngest.send({
      name: "repo/analyze.requested",
      data: { analysisRunId: run.id },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await prisma.analysisRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        error: `Failed to queue analysis: ${msg}`.slice(0, 8000),
      },
    });
    return {
      ok: false,
      error:
        "Could not queue analysis. For local dev set INNGEST_DEV=1 and run `npm run inngest:dev` in another terminal, or set ANALYSIS_INLINE=true to run analysis in-process (development only).",
    };
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/files");
  return { ok: true, analysisRunId: run.id };
}
