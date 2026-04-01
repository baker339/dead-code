import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { parseCodeGraph } from "@/lib/code-graph-parse";
import { CodeGraphView } from "@/components/code-graph-view";
import { AnalysisRunsPoller } from "@/components/analysis-runs-poller";

export default async function CodeGraphPage() {
  const session = await auth();
  if (!session?.user?.id) {
    return null;
  }

  const userId = session.user.id;

  const [run, activeRunCount] = await Promise.all([
    prisma.analysisRun.findFirst({
      where: {
        status: "COMPLETED",
        repository: { userId },
      },
      orderBy: { finishedAt: "desc" },
      select: {
        codeGraph: true,
        repository: { select: { fullName: true } },
      },
    }),
    prisma.analysisRun.count({
      where: {
        repository: { userId },
        status: { in: ["PENDING", "RUNNING"] },
      },
    }),
  ]);

  const graph = run?.codeGraph ? parseCodeGraph(run.codeGraph) : null;

  return (
    <div className="space-y-6">
      <AnalysisRunsPoller active={activeRunCount > 0} />

      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
          Code graph
        </h1>
        <p className="mt-3 text-base leading-relaxed text-zinc-600">
          Visual dependency sketch from import/using relationships. Install
          .NET, JDK/Maven or Gradle, and Swift toolchains on analysis workers
          (see <code className="text-sm">DEPLOY.md</code> in the project) for
          compiler-based findings on those stacks.
        </p>
      </div>

      {!graph ? (
        <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-4 text-base text-zinc-600">
          No graph yet. Run analysis on a repo that contains C#, Java/Kotlin,
          Swift, or mixed sources — the next completed run will store a graph
          here.
        </p>
      ) : (
        <CodeGraphView graph={graph} repoName={run?.repository.fullName ?? null} />
      )}
    </div>
  );
}
