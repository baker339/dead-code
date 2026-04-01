import type { RunInsightsV1 } from "@/lib/analysis/run-insights";
import { githubBlobUrl } from "@/lib/github-blob-url";

function pct(n: number) {
  return `${Math.round(n * 100)}%`;
}

export function TechnicalDebtPanel({
  insights,
  repoName,
  repoFullName,
  githubRef,
}: {
  insights: RunInsightsV1 | null;
  repoName: string | null;
  /** `owner/name` for GitHub deep links */
  repoFullName?: string | null;
  /** Commit SHA or branch — prefer commit for snapshot fidelity */
  githubRef?: string | null;
}) {
  const linkForPath =
    repoFullName && githubRef
      ? (path: string) => githubBlobUrl(repoFullName, githubRef, path)
      : () => undefined;

  if (!insights) {
    return (
      <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-5 py-6 text-base text-zinc-600">
        No <strong>debt snapshot</strong> for this run yet.{" "}
        <strong className="font-medium text-zinc-800">Run analysis again</strong> to
        compute contributor mix, composite scores, and ranked hotspots
        {repoName ? ` for ${repoName}` : ""}.
      </div>
    );
  }

  const { debtSummary, contributors, highlights } = insights;
  const busRisk =
    contributors.top3CommitShare >= 0.65
      ? "High concentration — few authors own most commits."
      : contributors.top3CommitShare >= 0.45
        ? "Moderate concentration."
        : "Commits are spread across many authors.";

  return (
    <div className="space-y-8">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">
            Avg debt score
          </p>
          <p className="mt-1 text-2xl font-semibold text-zinc-900">
            {debtSummary.avgDebtScore}
          </p>
          <p className="mt-1 text-sm text-zinc-500">0–100 heuristic per path</p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">
            High-risk files
          </p>
          <p className="mt-1 text-2xl font-semibold text-zinc-900">
            {debtSummary.highDebtFiles}
          </p>
          <p className="mt-1 text-sm text-zinc-500">Score ≥ 60</p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">
            Stale + static overlap
          </p>
          <p className="mt-1 text-2xl font-semibold text-zinc-900">
            {debtSummary.overlapStale90AndStatic}
          </p>
          <p className="mt-1 text-sm text-zinc-500">
            ≥90d idle and has findings
          </p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">
            Static findings
          </p>
          <p className="mt-1 text-2xl font-semibold text-zinc-900">
            {debtSummary.totalStaticFindings}
          </p>
          <p className="mt-1 text-sm text-zinc-500">
            Across {debtSummary.staticIssueFiles} paths
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-4">
        <h3 className="text-base font-semibold text-zinc-900">
          Maintainer concentration
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-zinc-600">
          From full repo history (non-merge commits). Top 3 authors:{" "}
          <strong className="text-zinc-800">
            {pct(contributors.top3CommitShare)}
          </strong>{" "}
          of {contributors.totalCommits.toLocaleString()} commits. {busRisk}
        </p>
        <ul className="mt-3 grid gap-2 text-base sm:grid-cols-2 lg:grid-cols-3">
          {contributors.top.slice(0, 9).map((c) => (
            <li
              key={c.name}
              className="flex justify-between gap-2 rounded-md bg-zinc-50 px-2 py-1.5"
            >
              <span className="truncate text-zinc-800" title={c.name}>
                {c.name}
              </span>
              <span className="shrink-0 tabular-nums text-zinc-500">
                {c.commits.toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <InsightTable
          title="Highest debt scores"
          subtitle="Composite: staleness + churn + static"
          rows={highlights.worstDebt.map((r) => ({
            path: r.path,
            sub: `${r.score} · ${r.signals.slice(0, 2).join(" · ") || "—"}`,
            href: linkForPath(r.path),
          }))}
        />
        <InsightTable
          title="Most churn (± lines)"
          subtitle="In sampled git window"
          rows={highlights.mostChurn.map((r) => ({
            path: r.path,
            sub: `${r.churn.toLocaleString()} lines · ${r.commits} commits · ${r.daysIdle}d idle`,
            href: linkForPath(r.path),
          }))}
        />
        <InsightTable
          title="Longest idle"
          subtitle="Days since last commit"
          rows={highlights.mostStale.map((r) => ({
            path: r.path,
            sub: `${r.daysIdle}d idle · score ${r.score}`,
            href: linkForPath(r.path),
          }))}
        />
      </div>
    </div>
  );
}

function InsightTable({
  title,
  subtitle,
  rows,
}: {
  title: string;
  subtitle: string;
  rows: { path: string; sub: string; href?: string }[];
}) {
  return (
    <div className="min-w-0 rounded-lg border border-zinc-200 bg-white p-4">
      <h3 className="text-base font-semibold text-zinc-900">{title}</h3>
      <p className="text-sm text-zinc-600">{subtitle}</p>
      <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto text-sm">
        {rows.length === 0 ? (
          <li className="text-zinc-400">No data</li>
        ) : (
          rows.map((r, i) => (
            <li key={`${r.path}-${i}`} className="border-b border-zinc-100 pb-2">
              {r.href ? (
                <a
                  href={r.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block truncate font-mono text-zinc-800 underline-offset-2 hover:underline"
                  title={r.path}
                >
                  {r.path}
                </a>
              ) : (
                <p className="truncate font-mono text-zinc-800" title={r.path}>
                  {r.path}
                </p>
              )}
              <p className="mt-0.5 text-zinc-500">{r.sub}</p>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
