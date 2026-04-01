import Link from "next/link";
import { auth } from "@/auth";
import { getRepositoryEntitlements } from "@/lib/entitlements";
import { prisma } from "@/lib/db";
import { getOrCreateUserSettings } from "@/lib/user-settings";
import { RunAnalysisButton } from "@/components/run-analysis-button";
import { AnalysisStatusBadge } from "@/components/analysis-status";
import { AnalysisRunsPoller } from "@/components/analysis-runs-poller";
import { DashboardCharts } from "@/components/dashboard-charts";
import { TechnicalDebtPanel } from "@/components/technical-debt-panel";
import { VulnerabilitySummary } from "@/components/vulnerability-summary";
import { MetricsExplainer } from "@/components/metrics-explainer";
import { OnboardingBanner } from "@/components/onboarding-banner";
import { getLatestCompletedRunCharts } from "@/lib/dashboard-stats";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) {
    return null;
  }

  const userId = session.user.id;

  const [repos, ent, recentRuns, chartData, userSettings] = await Promise.all([
    prisma.repository.findMany({
      where: { userId },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true, defaultBranch: true },
    }),
    getRepositoryEntitlements(userId),
    prisma.analysisRun.findMany({
      where: { repository: { userId } },
      orderBy: { createdAt: "desc" },
      take: 15,
      include: {
        repository: { select: { fullName: true } },
      },
    }),
    getLatestCompletedRunCharts(userId),
    getOrCreateUserSettings(userId),
  ]);

  const hasActiveRuns = recentRuns.some(
    (r) => r.status === "PENDING" || r.status === "RUNNING",
  );
  const hasCompletedRun = recentRuns.some((r) => r.status === "COMPLETED");

  const showOnboarding = !userSettings.onboardingDismissedAt;

  return (
    <div className="space-y-12">
      <AnalysisRunsPoller active={hasActiveRuns} />

      {showOnboarding && <OnboardingBanner />}

      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
          Dashboard
        </h1>
        <div className="mt-4">
          <MetricsExplainer />
        </div>
        <p className="mt-3 text-base leading-relaxed text-zinc-600">
          Signed in as{" "}
          <span className="font-medium text-zinc-800">
            {session.user.email ?? session.user.name ?? "user"}
          </span>
          . Run analysis to collect git history metrics for each connected
          repository.{" "}
          <strong className="font-medium text-zinc-800">File-level metrics</strong>{" "}
          are on the{" "}
          <Link
            href="/dashboard/files"
            className="font-medium text-zinc-900 underline-offset-2 hover:underline"
          >
            Files
          </Link>{" "}
          page after a run completes.
        </p>
        {hasActiveRuns && (
          <p className="mt-3 text-base text-amber-900">
            Analysis in progress — this page refreshes every few seconds until
            it finishes.
          </p>
        )}
        {hasCompletedRun && !hasActiveRuns && (
          <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-base text-emerald-950">
            Latest results:{" "}
            <Link
              href="/dashboard/files"
              className="font-semibold underline-offset-2 hover:underline"
            >
              Open Files view
            </Link>{" "}
            for per-path git metrics (staleness, churn, commit counts).
          </p>
        )}
      </div>

      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold text-zinc-900">
            Repositories
          </h2>
          <Link
            href="/dashboard/settings"
            className="text-base font-medium text-zinc-700 underline-offset-4 hover:underline"
          >
            Manage in Settings
          </Link>
        </div>
        <p className="mt-2 text-sm text-zinc-600">
          {ent.count} / {ent.max} used · plan {ent.tier}
        </p>
        {repos.length === 0 ? (
          <p className="mt-4 rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-4 py-6 text-base text-zinc-600">
            No repositories connected yet.{" "}
            <Link
              href="/dashboard/settings"
              className="font-medium text-zinc-900 underline-offset-2 hover:underline"
            >
              Add one in Settings
            </Link>
            .
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-zinc-200 rounded-lg border border-zinc-200">
            {repos.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-start justify-between gap-4 px-4 py-4 text-base"
              >
                <div>
                  <p className="font-medium text-zinc-900">{r.fullName}</p>
                  <p className="text-sm text-zinc-500">
                    default branch: {r.defaultBranch}
                  </p>
                </div>
                <RunAnalysisButton repositoryId={r.id} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <VulnerabilitySummary
          vuln={chartData.vulnSeverity}
          repoName={chartData.repoName}
        />
      </section>

      <section>
        <h2 className="text-lg font-semibold text-zinc-900">
          Technical debt overview
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-zinc-600">
          Composite scores blend git activity (staleness, churn in the sampled
          window) with static analyzers. Maintainer stats use full non-merge
          history.
        </p>
        <div className="mt-4">
          <TechnicalDebtPanel
            insights={chartData.insights}
            repoName={chartData.repoName}
            repoFullName={chartData.repoName}
            githubRef={chartData.githubRef}
          />
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-zinc-900">Charts</h2>
        <p className="mt-2 text-sm text-zinc-600">
          Same latest completed run as above.
        </p>
        <div className="mt-4">
          <DashboardCharts
            findingByKind={chartData.findingByKind}
            staleness={chartData.staleness}
            debtBuckets={chartData.debtBuckets}
            repoName={chartData.repoName}
          />
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-zinc-900">
          Recent analysis runs
        </h2>
        {recentRuns.length === 0 ? (
          <p className="mt-3 text-base text-zinc-600">
            No runs yet. Use &quot;Run analysis&quot; on a repository above.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-zinc-200 rounded-lg border border-zinc-200">
            {recentRuns.map((run) => (
              <li
                key={run.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-base"
              >
                <div>
                  <p className="font-medium text-zinc-800">
                    {run.repository.fullName}
                  </p>
                  <p className="text-sm text-zinc-500">
                    {run.commitSha
                      ? `commit ${run.commitSha.slice(0, 7)}`
                      : "—"}{" "}
                    ·{" "}
                    {run.finishedAt
                      ? new Date(run.finishedAt).toLocaleString()
                      : run.startedAt
                        ? `started ${new Date(run.startedAt).toLocaleString()}`
                        : "queued"}
                  </p>
                  {run.status === "COMPLETED" && (
                    <p className="mt-1">
                      <Link
                        href="/dashboard/files"
                        className="text-sm font-medium text-zinc-900 underline-offset-2 hover:underline"
                      >
                        View file metrics →
                      </Link>
                    </p>
                  )}
                  {run.error && (
                    <p className="mt-1 max-w-xl text-sm text-red-700">
                      {run.error.slice(0, 280)}
                      {run.error.length > 280 ? "…" : ""}
                    </p>
                  )}
                </div>
                <AnalysisStatusBadge status={run.status} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
