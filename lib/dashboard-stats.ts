import { prisma } from "@/lib/db";
import type { RunInsightsV1 } from "@/lib/analysis/run-insights";
import { parseRunInsights } from "@/lib/insights-types";

export type FindingKindCount = { kind: string; count: number };

export type StalenessBucket = { range: string; count: number };

export type DebtScoreBucket = { range: string; count: number };

/** Counts of VULNERABLE_DEP findings by severity for the latest completed run. */
export type VulnSeveritySummary = {
  total: number;
  critical: number;
  high: number;
  moderate: number;
  low: number;
  info: number;
};

function emptyVulnSummary(): VulnSeveritySummary {
  return {
    total: 0,
    critical: 0,
    high: 0,
    moderate: 0,
    low: 0,
    info: 0,
  };
}

async function vulnSeverityForRun(runId: string): Promise<VulnSeveritySummary> {
  const rows = await prisma.finding.findMany({
    where: { analysisRunId: runId, kind: "VULNERABLE_DEP" },
    select: { severity: true },
  });
  const s = emptyVulnSummary();
  s.total = rows.length;
  for (const r of rows) {
    const k = r.severity.toLowerCase();
    if (k === "critical") s.critical += 1;
    else if (k === "high") s.high += 1;
    else if (k === "moderate") s.moderate += 1;
    else if (k === "low") s.low += 1;
    else if (k === "info") s.info += 1;
  }
  return s;
}

function debtBucketsFromMetrics(
  metrics: { metrics: unknown }[],
): DebtScoreBucket[] {
  const b = [0, 0, 0, 0];
  for (const row of metrics) {
    const s = (row.metrics as { debtScore?: number }).debtScore;
    if (typeof s !== "number" || !Number.isFinite(s)) continue;
    if (s <= 24) b[0] += 1;
    else if (s <= 49) b[1] += 1;
    else if (s <= 74) b[2] += 1;
    else b[3] += 1;
  }
  return [
    { range: "0–24 (low)", count: b[0] },
    { range: "25–49", count: b[1] },
    { range: "50–74", count: b[2] },
    { range: "75–100 (high)", count: b[3] },
  ];
}

export async function getLatestCompletedRunCharts(userId: string): Promise<{
  runId: string | null;
  repoName: string | null;
  /** Git ref for deep links (prefer commit SHA when present). */
  githubRef: string | null;
  defaultBranch: string | null;
  commitSha: string | null;
  findingByKind: FindingKindCount[];
  staleness: StalenessBucket[];
  debtBuckets: DebtScoreBucket[];
  insights: RunInsightsV1 | null;
  vulnSeverity: VulnSeveritySummary;
}> {
  const run = await prisma.analysisRun.findFirst({
    where: {
      status: "COMPLETED",
      repository: { userId },
    },
    orderBy: { finishedAt: "desc" },
    select: {
      id: true,
      insights: true,
      commitSha: true,
      repository: { select: { fullName: true, defaultBranch: true } },
    },
  });

  if (!run) {
    return {
      runId: null,
      repoName: null,
      githubRef: null,
      defaultBranch: null,
      commitSha: null,
      findingByKind: [],
      staleness: [],
      debtBuckets: [],
      insights: null,
      vulnSeverity: emptyVulnSummary(),
    };
  }

  const [kindGroups, metrics, vulnSeverity] = await Promise.all([
    prisma.finding.groupBy({
      by: ["kind"],
      where: { analysisRunId: run.id },
      _count: { _all: true },
    }),
    prisma.fileMetric.findMany({
      where: { analysisRunId: run.id },
      select: { metrics: true },
      take: 8_000,
    }),
    vulnSeverityForRun(run.id),
  ]);

  const findingByKind: FindingKindCount[] = kindGroups.map((g) => ({
    kind: g.kind,
    count: g._count._all,
  }));

  const buckets = {
    "0–30d": 0,
    "31–90d": 0,
    "91–180d": 0,
    "180d+": 0,
  };

  for (const row of metrics) {
    const m = row.metrics as { daysSinceLastCommit?: number };
    const d = m.daysSinceLastCommit;
    if (d === undefined || !Number.isFinite(d)) continue;
    if (d <= 30) buckets["0–30d"] += 1;
    else if (d <= 90) buckets["31–90d"] += 1;
    else if (d <= 180) buckets["91–180d"] += 1;
    else buckets["180d+"] += 1;
  }

  const staleness: StalenessBucket[] = [
    { range: "0–30d", count: buckets["0–30d"] },
    { range: "31–90d", count: buckets["31–90d"] },
    { range: "91–180d", count: buckets["91–180d"] },
    { range: "180d+", count: buckets["180d+"] },
  ];

  const debtBuckets = debtBucketsFromMetrics(metrics);
  const insights = parseRunInsights(run.insights);

  const commitSha = run.commitSha ?? null;
  const defaultBranch = run.repository.defaultBranch ?? null;
  const githubRef = commitSha ?? defaultBranch;

  return {
    runId: run.id,
    repoName: run.repository.fullName,
    githubRef,
    defaultBranch,
    commitSha,
    findingByKind,
    staleness,
    debtBuckets,
    insights,
    vulnSeverity,
  };
}
