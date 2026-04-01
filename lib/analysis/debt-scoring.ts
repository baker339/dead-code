import type { FindingKind } from "@prisma/client";
import type { FileMetricsPayload, PerFileGitMetrics } from "@/lib/analysis/git-metrics";
import type { NormalizedFinding } from "@/lib/analysis/analyzers/types";

/**
 * Heuristic 0–100 score: higher = more likely tech-debt / maintenance risk for this path.
 * Combines git staleness, churn in the sampled window, and static-analysis signals.
 */
export type EnrichedFileMetrics = FileMetricsPayload & {
  churnTotal: number;
  debtScore: number;
  debtSignals: string[];
};

export type EnrichedPerFile = {
  path: string;
  metrics: EnrichedFileMetrics;
};

const KIND_WEIGHT: Record<FindingKind, number> = {
  BARELY_USED: 14,
  VULNERABLE_DEP: 20,
  UNUSED_FILE: 12,
  UNUSED_EXPORT: 8,
  REDUNDANT_DEP: 6,
  OTHER: 4,
};

function groupFindingsByPath(
  findings: NormalizedFinding[],
): Map<string, NormalizedFinding[]> {
  const m = new Map<string, NormalizedFinding[]>();
  for (const f of findings) {
    const p = f.path.replace(/\\/g, "/");
    const arr = m.get(p) ?? [];
    arr.push(f);
    m.set(p, arr);
  }
  return m;
}

function scorePath(
  base: FileMetricsPayload,
  pathFindings: NormalizedFinding[] | undefined,
): { score: number; signals: string[] } {
  const signals: string[] = [];
  const days = base.daysSinceLastCommit ?? 0;
  const churnTotal = (base.linesAdded ?? 0) + (base.linesRemoved ?? 0);
  const commits = base.commitCount ?? 0;

  // Staleness (0–35): ramps after ~2 weeks idle
  const stalePts = Math.min(
    35,
    Math.max(0, (days - 14) * 0.22),
  );
  if (days >= 180) signals.push(`Very stale (${days}d idle)`);
  else if (days >= 90) signals.push(`Stale (${days}d idle)`);
  else if (days >= 30) signals.push(`Aging (${days}d idle)`);

  // Churn stress (0–30): lots of line movement in the sampled history window
  const churnPts = Math.min(30, churnTotal * 0.04);
  if (churnTotal >= 500) signals.push("Very high churn (lines ± in window)");
  else if (churnTotal >= 200) signals.push("High churn in sampled history");
  else if (churnTotal >= 80) signals.push("Moderate churn");

  // Static signals (0–35)
  let staticPts = 0;
  if (pathFindings?.length) {
    for (const f of pathFindings) {
      staticPts += KIND_WEIGHT[f.kind] ?? 4;
    }
    staticPts = Math.min(35, staticPts);
    const kinds = [...new Set(pathFindings.map((f) => f.kind))];
    if (kinds.includes("BARELY_USED")) signals.push("Barely used (git + static)");
    if (kinds.includes("UNUSED_FILE")) signals.push("Unused / unreferenced file");
    if (kinds.includes("UNUSED_EXPORT")) signals.push("Unused exports / dead symbols");
    if (kinds.includes("REDUNDANT_DEP")) signals.push("Redundant dependencies");
    if (kinds.includes("VULNERABLE_DEP")) {
      signals.push("Vulnerable npm dependency (audit)");
      if (days >= 90) {
        signals.push("Stale path with vulnerable dependency (review priority)");
      }
    }
    if (kinds.some((k) => k === "OTHER")) signals.push("Other static warnings");
  }

  // Fragile hotspot: many touches but currently quiet — worth review
  if (commits >= 25 && days >= 60 && churnPts >= 8) {
    signals.push("Former hotspot now quiet (review risk)");
  }

  const score = Math.round(
    Math.min(100, Math.max(0, stalePts + churnPts + staticPts)),
  );

  if (score >= 60 && signals.length === 0) {
    signals.push("Elevated composite score");
  }

  return { score, signals: [...new Set(signals)].slice(0, 8) };
}

export function enrichFileMetricsWithDebt(
  fileMetrics: PerFileGitMetrics[],
  findings: NormalizedFinding[],
): EnrichedPerFile[] {
  const byPath = groupFindingsByPath(findings);

  return fileMetrics.map((row) => {
    const norm = row.path.replace(/\\/g, "/");
    const pathFindings = byPath.get(norm);
    const { score, signals } = scorePath(row.metrics, pathFindings);
    const churnTotal =
      (row.metrics.linesAdded ?? 0) + (row.metrics.linesRemoved ?? 0);

    return {
      path: row.path,
      metrics: {
        ...row.metrics,
        churnTotal,
        debtScore: score,
        debtSignals: signals,
      },
    };
  });
}
