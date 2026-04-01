import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { AnalysisRunsPoller } from "@/components/analysis-runs-poller";
import { VulnerabilityEvidence } from "@/components/vulnerability-evidence";

type MetricJson = {
  lastCommitAt?: string;
  commitCount?: number;
  linesAdded?: number;
  linesRemoved?: number;
  daysSinceLastCommit?: number;
  churnTotal?: number;
  debtScore?: number;
  debtSignals?: string[];
};

/** Plain labels: what each finding kind means for you */
const KIND_SHORT: Record<string, string> = {
  UNUSED_EXPORT: "export not referenced",
  UNUSED_FILE: "file not referenced",
  REDUNDANT_DEP: "unused / redundant package",
  VULNERABLE_DEP: "vulnerable package (lockfile audit)",
  BARELY_USED: "unused + long idle",
  OTHER: "other static issue",
};

export default async function FilesPage() {
  const session = await auth();
  if (!session?.user?.id) {
    return null;
  }

  const userId = session.user.id;

  const count = await prisma.repository.count({ where: { userId } });
  if (count === 0) {
    return (
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
          Files
        </h1>
        <p className="mt-2 text-sm text-zinc-600">
          Connect a repository in{" "}
          <Link
            href="/dashboard/settings"
            className="font-medium text-zinc-900 underline-offset-2 hover:underline"
          >
            Settings
          </Link>{" "}
          first.
        </p>
      </div>
    );
  }

  const [latestRun, activeRunCount] = await Promise.all([
    prisma.analysisRun.findFirst({
      where: {
        status: "COMPLETED",
        repository: { userId },
      },
      orderBy: { finishedAt: "desc" },
      include: {
        repository: { select: { fullName: true } },
        fileMetrics: {
          orderBy: { path: "asc" },
          take: 500,
        },
        findings: {
          orderBy: [{ path: "asc" }, { kind: "asc" }],
          take: 3000,
        },
      },
    }),
    prisma.analysisRun.count({
      where: {
        repository: { userId },
        status: { in: ["PENDING", "RUNNING"] },
      },
    }),
  ]);

  if (!latestRun) {
    return (
      <div>
        <AnalysisRunsPoller active={activeRunCount > 0} />
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
          Files
        </h1>
        {activeRunCount > 0 ? (
          <p className="mt-2 text-sm text-amber-900">
            Analysis is still running. This page refreshes every few seconds;
            the table will appear when it completes.
          </p>
        ) : (
          <p className="mt-2 text-sm text-zinc-600">
            No completed analysis yet. Go to the{" "}
            <Link
              href="/dashboard"
              className="font-medium text-zinc-900 underline-offset-2 hover:underline"
            >
              Dashboard
            </Link>{" "}
            and click <strong className="font-medium">Run analysis</strong> on
            a repository, then come back here for per-file git metrics.
          </p>
        )}
      </div>
    );
  }

  const findingsByPath = new Map<
    string,
    {
      kind: string;
      symbol: string | null;
      toolId: string;
      evidence: string | null;
    }[]
  >();
  for (const f of latestRun.findings) {
    const k = f.path.replace(/\\/g, "/");
    const arr = findingsByPath.get(k) ?? [];
    arr.push({
      kind: f.kind,
      symbol: f.symbol,
      toolId: f.toolId,
      evidence: f.evidence,
    });
    findingsByPath.set(k, arr);
  }

  return (
    <div className="space-y-4">
      <AnalysisRunsPoller active={activeRunCount > 0} />

      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
          Files
        </h1>
        {activeRunCount > 0 && (
          <p className="mt-2 text-sm text-amber-900">
            Another analysis is running — refreshing periodically. Showing data
            from the latest completed run below.
          </p>
        )}
        <p className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm text-zinc-600">
          <span>
            Latest completed run:{" "}
            <span className="font-medium text-zinc-800">
              {latestRun.repository.fullName}
            </span>{" "}
            @ {latestRun.commitSha?.slice(0, 7) ?? "—"} ·{" "}
            {latestRun.finishedAt
              ? new Date(latestRun.finishedAt).toLocaleString()
              : ""}
          </span>
          <a
            href="/api/export/latest"
            className="font-medium text-zinc-900 underline-offset-2 hover:underline"
          >
            Download CSV export
          </a>
        </p>
        <p className="text-sm text-zinc-600">
          Showing {latestRun.fileMetrics.length} paths (capped at 500 per run) ·{" "}
          {latestRun.findings.length} static findings (cap 3000).{" "}
          <span className="font-medium text-zinc-700">Findings</span> are
          the concrete issues (unreferenced files/exports, package.json clutter,
          etc., mostly from Knip on JS/TS repos). Debt score adds git context
          (staleness + line churn in sampled history); it is not a substitute
          for reading findings. With a supported lockfile (npm, pnpm, or Yarn),
          dependency advisories are included (registry access during analysis).
        </p>
      </div>

      {latestRun.fileMetrics.length === 0 ? (
        <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
          This run completed but no file-level metrics were stored (empty git
          history in the shallow clone, or a pipeline issue). Try running
          analysis again.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-200">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-sm font-medium uppercase tracking-wide text-zinc-600">
              <tr>
                <th className="px-3 py-2">Path</th>
                <th className="px-3 py-2 text-right">Debt</th>
                <th className="px-3 py-2">Signals</th>
                <th className="px-3 py-2">Findings</th>
                <th className="px-3 py-2">Last commit</th>
                <th className="px-3 py-2 text-right">Commits</th>
                <th className="px-3 py-2 text-right">+lines</th>
                <th className="px-3 py-2 text-right">−lines</th>
                <th className="px-3 py-2 text-right">Days idle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {latestRun.fileMetrics.map((row) => {
                const m = row.metrics as MetricJson;
                const norm = row.path.replace(/\\/g, "/");
                const findings = findingsByPath.get(norm) ?? [];
                const title = findings
                  .map((f) => {
                    const head = `[${KIND_SHORT[f.kind] ?? f.kind}] ${f.symbol ?? "—"} (${f.toolId})`;
                    if (f.evidence?.trim()) {
                      return `${head}\n${f.evidence}`;
                    }
                    return head;
                  })
                  .join("\n\n");
                return (
                  <tr key={row.id} className="text-zinc-800">
                    <td className="max-w-xs truncate px-3 py-2 font-mono text-sm">
                      {row.path}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right text-sm tabular-nums">
                      {m.debtScore !== undefined ? (
                        <span
                          className={
                            m.debtScore >= 60
                              ? "font-semibold text-red-800"
                              : m.debtScore >= 40
                                ? "font-medium text-amber-900"
                                : "text-zinc-600"
                          }
                        >
                          {m.debtScore}
                        </span>
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )}
                    </td>
                    <td
                      className="max-w-[12rem] truncate px-3 py-2 text-sm text-zinc-600"
                      title={
                        m.debtSignals?.length
                          ? m.debtSignals.join("\n")
                          : undefined
                      }
                    >
                      {m.debtSignals?.length
                        ? m.debtSignals.slice(0, 2).join(" · ") +
                          (m.debtSignals.length > 2 ? "…" : "")
                        : "—"}
                    </td>
                    <td className="max-w-[20rem] px-3 py-2 text-sm align-top">
                      {findings.length === 0 ? (
                        <span className="text-zinc-400">—</span>
                      ) : (
                        <>
                          <span
                            className="text-zinc-700"
                            title={title || undefined}
                          >
                            {findings.length} issue
                            {findings.length === 1 ? "" : "s"}
                            <span className="ml-1 text-zinc-500">
                              (
                              {findings
                                .slice(0, 2)
                                .map(
                                  (f) =>
                                    KIND_SHORT[f.kind] ??
                                    f.kind.toLowerCase(),
                                )
                                .join(", ")}
                              {findings.length > 2 ? "…" : ""})
                            </span>
                          </span>
                          {findings.some((f) => f.kind === "VULNERABLE_DEP") && (
                            <details className="mt-1.5 rounded border border-zinc-200 bg-zinc-50/90 px-2 py-1.5">
                              <summary className="cursor-pointer text-sm font-medium text-zinc-700">
                                Advisory links
                              </summary>
                              <div className="mt-2 space-y-2 border-t border-zinc-100 pt-2">
                                {findings
                                  .filter((f) => f.kind === "VULNERABLE_DEP")
                                  .map((f, i) => (
                                    <div
                                      key={`${f.symbol ?? "pkg"}-${f.toolId}-${i}`}
                                    >
                                      <div className="font-mono text-sm font-medium text-zinc-800">
                                        {f.symbol ?? "—"}{" "}
                                        <span className="font-sans font-normal text-zinc-500">
                                          ({f.toolId})
                                        </span>
                                      </div>
                                      <VulnerabilityEvidence
                                        evidence={f.evidence}
                                      />
                                    </div>
                                  ))}
                              </div>
                            </details>
                          )}
                        </>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-sm text-zinc-600">
                      {m.lastCommitAt
                        ? new Date(m.lastCommitAt).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {m.commitCount ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-emerald-800">
                      {m.linesAdded ?? 0}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-red-800">
                      {m.linesRemoved ?? 0}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {m.daysSinceLastCommit ?? "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
