import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { analyzeRepositoryFn } from "@/lib/inngest/functions/analyze-repository";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [analyzeRepositoryFn],
});

export const runtime = "nodejs";
export const maxDuration = 300;
