"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type FindingRow = { kind: string; count: number };
type StaleRow = { range: string; count: number };
type DebtRow = { range: string; count: number };

const kindLabels: Record<string, string> = {
  UNUSED_EXPORT: "Export not referenced",
  UNUSED_FILE: "File not referenced",
  REDUNDANT_DEP: "Unused / redundant package",
  VULNERABLE_DEP: "Vulnerable package (lockfile audit)",
  BARELY_USED: "Unused + long idle",
  OTHER: "Other (Vulture, Go, Rust, …)",
};

export function DashboardCharts({
  findingByKind,
  staleness,
  debtBuckets,
  repoName,
}: {
  findingByKind: FindingRow[];
  staleness: StaleRow[];
  debtBuckets: DebtRow[];
  repoName: string | null;
}) {
  const findingsData = findingByKind.map((r) => ({
    ...r,
    label: kindLabels[r.kind] ?? r.kind,
  }));

  const hasFindings = findingByKind.some((r) => r.count > 0);
  const hasStaleness = staleness.some((r) => r.count > 0);
  const hasDebt = debtBuckets.some((r) => r.count > 0);

  if (!hasFindings && !hasStaleness && !hasDebt) {
    return (
      <p className="text-base text-zinc-600">
        No chart data yet for the latest completed run
        {repoName ? ` (${repoName})` : ""}. Run analysis again to refresh
        metrics, static findings, and debt scores.
      </p>
    );
  }

  const chartCount =
    Number(hasFindings) + Number(hasStaleness) + Number(hasDebt);
  const gridClass =
    chartCount >= 3
      ? "grid gap-8 lg:grid-cols-3"
      : chartCount === 2
        ? "grid gap-8 lg:grid-cols-2"
        : "grid gap-8";

  return (
    <div className={gridClass}>
      {hasFindings && (
        <div>
          <h3 className="text-base font-semibold text-zinc-900">
            Findings by kind
          </h3>
          <p className="mt-1 text-sm text-zinc-600">
            Latest completed analysis
            {repoName ? ` · ${repoName}` : ""}
          </p>
          <div className="mt-4 h-[260px] w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={findingsData}
                layout="vertical"
                margin={{ left: 8, right: 16 }}
              >
                <CartesianGrid strokeDasharray="3 3" className="stroke-zinc-200" />
                <XAxis type="number" tick={{ fontSize: 13 }} />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={128}
                  tick={{ fontSize: 13 }}
                />
                <Tooltip
                  contentStyle={{
                    fontSize: 14,
                    borderRadius: 8,
                    border: "1px solid #e4e4e7",
                  }}
                />
                <Bar dataKey="count" fill="#18181b" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
      {hasStaleness && (
        <div>
          <h3 className="text-base font-semibold text-zinc-900">
            Files by idle time
          </h3>
          <p className="mt-1 text-sm text-zinc-600">
            Days since last commit touching each path
          </p>
          <div className="mt-4 h-[260px] w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={staleness} margin={{ left: 8, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-zinc-200" />
                <XAxis dataKey="range" tick={{ fontSize: 13 }} />
                <YAxis tick={{ fontSize: 13 }} />
                <Tooltip
                  contentStyle={{
                    fontSize: 14,
                    borderRadius: 8,
                    border: "1px solid #e4e4e7",
                  }}
                />
                <Bar dataKey="count" fill="#3f3f46" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
      {hasDebt && (
        <div>
          <h3 className="text-base font-semibold text-zinc-900">
            Debt score distribution
          </h3>
          <p className="mt-1 text-sm text-zinc-600">
            Composite score per path (staleness + churn + static)
          </p>
          <div className="mt-4 h-[260px] w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={debtBuckets} margin={{ left: 8, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-zinc-200" />
                <XAxis dataKey="range" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 13 }} />
                <Tooltip
                  contentStyle={{
                    fontSize: 14,
                    borderRadius: 8,
                    border: "1px solid #e4e4e7",
                  }}
                />
                <Bar dataKey="count" fill="#7c2d12" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
