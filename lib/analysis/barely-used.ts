import type { NormalizedFinding } from "@/lib/analysis/analyzers/types";
import type { PerFileGitMetrics } from "@/lib/analysis/git-metrics";

const DEFAULT_IDLE_DAYS = Number.parseInt(
  process.env.BARELY_USED_IDLE_DAYS ?? "180",
  10,
);

/**
 * If static analysis already flagged a symbol/file as unused and git shows the
 * path has been idle for a long time, add a BARELY_USED finding.
 */
export function applyBarelyUsedHeuristic(
  findings: NormalizedFinding[],
  fileMetrics: PerFileGitMetrics[],
): NormalizedFinding[] {
  const idleThreshold = Number.isFinite(DEFAULT_IDLE_DAYS)
    ? DEFAULT_IDLE_DAYS
    : 180;

  const metricByPath = new Map(
    fileMetrics.map((m) => [m.path.replace(/\\/g, "/"), m.metrics]),
  );

  const extra: NormalizedFinding[] = [];
  const seen = new Set<string>();

  for (const f of findings) {
    if (f.kind !== "UNUSED_EXPORT" && f.kind !== "UNUSED_FILE") continue;

    const normPath = f.path.replace(/\\/g, "/");
    const metrics = metricByPath.get(normPath);
    const idle = metrics?.daysSinceLastCommit;
    if (idle === undefined || idle < idleThreshold) continue;

    const key = `${normPath}\0${f.symbol ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);

    extra.push({
      kind: "BARELY_USED",
      path: normPath,
      symbol: f.symbol,
      severity: "high",
      evidence: `Static tool (${f.toolId}) flagged unused; no commit on this path for ~${idle} days (threshold ${idleThreshold}d).`,
      toolId: "deadcode-heuristic",
    });
  }

  return [...findings, ...extra];
}
