import type { RunInsightsV1 } from "@/lib/analysis/run-insights";

export function parseRunInsights(raw: unknown): RunInsightsV1 | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as { v?: number };
  if (o.v !== 1) return null;
  return raw as RunInsightsV1;
}
