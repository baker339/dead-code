import type { NormalizedFinding } from "@/lib/analysis/analyzers/types";
import type { EnrichedPerFile } from "@/lib/analysis/debt-scoring";
import type { ContributorRow } from "@/lib/analysis/git-contributors";

/** Persisted on `AnalysisRun.insights` — bump `v` when shape changes. */
export type RunInsightsV1 = {
  v: 1;
  contributors: {
    top: ContributorRow[];
    totalCommits: number;
    top3CommitShare: number;
  };
  debtSummary: {
    filesAnalyzed: number;
    avgDebtScore: number;
    highDebtFiles: number;
    stale90Plus: number;
    staticIssueFiles: number;
    barelyUsedPaths: number;
    overlapStale90AndStatic: number;
    totalStaticFindings: number;
  };
  highlights: {
    worstDebt: {
      path: string;
      score: number;
      signals: string[];
      findingCount: number;
    }[];
    mostChurn: {
      path: string;
      churn: number;
      commits: number;
      daysIdle: number;
    }[];
    mostStale: { path: string; daysIdle: number; score: number }[];
  };
};

function findingCountByPath(findings: NormalizedFinding[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const f of findings) {
    const p = f.path.replace(/\\/g, "/");
    m.set(p, (m.get(p) ?? 0) + 1);
  }
  return m;
}

export function buildRunInsights(
  enriched: EnrichedPerFile[],
  findings: NormalizedFinding[],
  contributors: {
    top: ContributorRow[];
    totalCommits: number;
    top3CommitShare: number;
  },
): RunInsightsV1 {
  const fc = findingCountByPath(findings);
  const barelyUsedPaths = new Set(
    findings.filter((f) => f.kind === "BARELY_USED").map((f) => f.path.replace(/\\/g, "/")),
  ).size;

  const staticIssueFiles = new Set(
    findings.map((f) => f.path.replace(/\\/g, "/")),
  ).size;

  let stale90Plus = 0;
  let overlapStale90AndStatic = 0;
  let scoreSum = 0;

  const pathsWithStatic = new Set(
    findings.map((f) => f.path.replace(/\\/g, "/")),
  );

  for (const row of enriched) {
    const norm = row.path.replace(/\\/g, "/");
    const days = row.metrics.daysSinceLastCommit ?? 0;
    const score = row.metrics.debtScore ?? 0;
    scoreSum += score;

    if (days >= 90) {
      stale90Plus += 1;
      if (pathsWithStatic.has(norm)) overlapStale90AndStatic += 1;
    }
  }

  const n = enriched.length || 1;
  const avgDebtScore = Math.round((scoreSum / n) * 10) / 10;
  const highDebtFiles = enriched.filter((r) => (r.metrics.debtScore ?? 0) >= 60)
    .length;

  const worstDebt = [...enriched]
    .sort((a, b) => (b.metrics.debtScore ?? 0) - (a.metrics.debtScore ?? 0))
    .slice(0, 12)
    .map((r) => ({
      path: r.path,
      score: r.metrics.debtScore ?? 0,
      signals: r.metrics.debtSignals ?? [],
      findingCount: fc.get(r.path.replace(/\\/g, "/")) ?? 0,
    }));

  const mostChurn = [...enriched]
    .sort(
      (a, b) =>
        (b.metrics.churnTotal ?? 0) - (a.metrics.churnTotal ?? 0),
    )
    .slice(0, 10)
    .map((r) => ({
      path: r.path,
      churn: r.metrics.churnTotal ?? 0,
      commits: r.metrics.commitCount ?? 0,
      daysIdle: r.metrics.daysSinceLastCommit ?? 0,
    }));

  const mostStale = [...enriched]
    .sort(
      (a, b) =>
        (b.metrics.daysSinceLastCommit ?? 0) -
        (a.metrics.daysSinceLastCommit ?? 0),
    )
    .slice(0, 10)
    .map((r) => ({
      path: r.path,
      daysIdle: r.metrics.daysSinceLastCommit ?? 0,
      score: r.metrics.debtScore ?? 0,
    }));

  return {
    v: 1,
    contributors,
    debtSummary: {
      filesAnalyzed: enriched.length,
      avgDebtScore,
      highDebtFiles,
      stale90Plus,
      staticIssueFiles,
      barelyUsedPaths,
      overlapStale90AndStatic,
      totalStaticFindings: findings.length,
    },
    highlights: {
      worstDebt,
      mostChurn,
      mostStale,
    },
  };
}
