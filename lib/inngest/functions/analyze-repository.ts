import { inngest } from "@/lib/inngest/client";
import { runAnalysisJob } from "@/lib/analysis/run-analysis";

export const analyzeRepositoryFn = inngest.createFunction(
  {
    id: "analyze-repository",
    name: "Analyze repository",
    retries: 4,
    triggers: [{ event: "repo/analyze.requested" }],
  },
  async ({ event, step }) => {
    const analysisRunId = event.data.analysisRunId as string;
    if (!analysisRunId) {
      throw new Error("Missing analysisRunId");
    }
    await step.run("clone-and-metrics", async () => {
      try {
        await runAnalysisJob(analysisRunId);
      } catch (err) {
        console.error("[inngest analyze-repository] step failed", {
          analysisRunId,
          err:
            err instanceof Error
              ? { message: err.message, stack: err.stack }
              : err,
        });
        throw err;
      }
    });
  },
);
