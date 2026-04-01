import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

function csvCell(s: string): string {
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

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

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  const run = await prisma.analysisRun.findFirst({
    where: {
      status: "COMPLETED",
      repository: { userId },
    },
    orderBy: { finishedAt: "desc" },
    include: {
      repository: { select: { fullName: true, defaultBranch: true } },
      fileMetrics: {
        orderBy: { path: "asc" },
        take: 8_000,
      },
      findings: {
        orderBy: [{ path: "asc" }, { kind: "asc" }],
        take: 12_000,
      },
    },
  });

  if (!run) {
    return NextResponse.json(
      { error: "No completed analysis run yet." },
      { status: 404 },
    );
  }

  const findingsByPath = new Map<string, string[]>();
  for (const f of run.findings) {
    const k = f.path.replace(/\\/g, "/");
    const line = `${f.kind}:${f.symbol ?? "—"}:${f.severity}`;
    const arr = findingsByPath.get(k) ?? [];
    arr.push(line);
    findingsByPath.set(k, arr);
  }

  const header = [
    "repository",
    "commit",
    "path",
    "debt_score",
    "debt_signals",
    "findings_summary",
    "last_commit_at",
    "commit_count",
    "lines_added",
    "lines_removed",
    "days_since_last_commit",
  ];

  const rows: string[][] = [header];
  for (const row of run.fileMetrics) {
    const m = row.metrics as MetricJson;
    const norm = row.path.replace(/\\/g, "/");
    const findingLines = findingsByPath.get(norm) ?? [];
    rows.push([
      run.repository.fullName,
      run.commitSha ?? "",
      norm,
      m.debtScore !== undefined ? String(m.debtScore) : "",
      (m.debtSignals ?? []).join("; "),
      findingLines.slice(0, 24).join(" | "),
      m.lastCommitAt ?? "",
      m.commitCount !== undefined ? String(m.commitCount) : "",
      m.linesAdded !== undefined ? String(m.linesAdded) : "",
      m.linesRemoved !== undefined ? String(m.linesRemoved) : "",
      m.daysSinceLastCommit !== undefined
        ? String(m.daysSinceLastCommit)
        : "",
    ]);
  }

  const csv = rows.map((r) => r.map(csvCell).join(",")).join("\r\n");

  const filename = `dead-code-${run.repository.fullName.replace(/\//g, "-")}-${(run.commitSha ?? "export").slice(0, 7)}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
