import { mkdtemp, rm } from "fs/promises";
import { execFile } from "child_process";
import { promisify } from "util";
import { tmpdir } from "os";
import * as path from "path";
import { prisma } from "@/lib/db";
import { getGithubAccessToken } from "@/lib/github";
import { shallowCloneToDir, githubCloneUrl } from "@/lib/analysis/clone";
import { computeGitFileMetrics } from "@/lib/analysis/git-metrics";
import { fingerprintRepo } from "@/lib/analysis/fingerprint";
import { runStaticAnalyzers } from "@/lib/analysis/analyzers/index";
import { applyBarelyUsedHeuristic } from "@/lib/analysis/barely-used";
import { enrichFileMetricsWithDebt } from "@/lib/analysis/debt-scoring";
import { getContributorSummary } from "@/lib/analysis/git-contributors";
import { buildRunInsights } from "@/lib/analysis/run-insights";
import { gitignoredPathSet } from "@/lib/analysis/git-ignore";
import { notifyCriticalVulns } from "@/lib/notify-critical-vulns";
import { buildCodeGraph } from "@/lib/analysis/build-code-graph";
import { getOrCreateUserSettings } from "@/lib/user-settings";
import {
  parsePathIgnoreGlobs,
  pathMatchesUserIgnore,
} from "@/lib/path-ignore";

const execFileAsync = promisify(execFile);

const CHUNK = 250;
const MAX_FINDINGS = 8_000;

function normPath(p: string): string {
  return p.replace(/\\/g, "/");
}

export async function runAnalysisJob(analysisRunId: string): Promise<void> {
  const run = await prisma.analysisRun.findUnique({
    where: { id: analysisRunId },
    include: { repository: true },
  });

  if (!run) {
    throw new Error(`AnalysisRun not found: ${analysisRunId}`);
  }

  const repo = run.repository;
  const token = await getGithubAccessToken(repo.userId);
  if (!token) {
    await prisma.analysisRun.update({
      where: { id: analysisRunId },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        error: "No GitHub token. Sign out and sign in again.",
      },
    });
    throw new Error("No GitHub token");
  }

  await prisma.analysisRun.update({
    where: { id: analysisRunId },
    data: {
      status: "RUNNING",
      startedAt: new Date(),
      error: null,
    },
  });

  const tmpRoot = await mkdtemp(path.join(tmpdir(), "deadcode-"));

  try {
    const url = githubCloneUrl(repo.fullName, token);
    const repoPath = await shallowCloneToDir(url, tmpRoot, repo.defaultBranch);

    const head = (
      await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repoPath })
    )
      .stdout.toString()
      .trim();

    let rawFileMetrics = await computeGitFileMetrics(repoPath);

    const fp = await fingerprintRepo(repoPath);
    let findings = await runStaticAnalyzers(repoPath, fp);

    const pathsForIgnore = [
      ...rawFileMetrics.map((m) => m.path),
      ...findings.map((f) => f.path),
    ];
    const ignored = await gitignoredPathSet(repoPath, pathsForIgnore);
    rawFileMetrics = rawFileMetrics.filter((m) => !ignored.has(normPath(m.path)));
    findings = findings.filter((f) => !ignored.has(normPath(f.path)));

    const userIgnores = parsePathIgnoreGlobs(
      (await getOrCreateUserSettings(repo.userId)).pathIgnoreGlobs,
    );
    if (userIgnores.length > 0) {
      rawFileMetrics = rawFileMetrics.filter(
        (m) => !pathMatchesUserIgnore(normPath(m.path), userIgnores),
      );
      findings = findings.filter(
        (f) => !pathMatchesUserIgnore(normPath(f.path), userIgnores),
      );
    }

    findings = applyBarelyUsedHeuristic(findings, rawFileMetrics);
    if (findings.length > MAX_FINDINGS) {
      findings = findings.slice(0, MAX_FINDINGS);
    }

    const enriched = enrichFileMetricsWithDebt(rawFileMetrics, findings);

    await prisma.fileMetric.deleteMany({ where: { analysisRunId } });

    for (let i = 0; i < enriched.length; i += CHUNK) {
      const slice = enriched.slice(i, i + CHUNK);
      await prisma.fileMetric.createMany({
        data: slice.map((m) => ({
          analysisRunId,
          path: m.path,
          metrics: m.metrics,
        })),
      });
    }

    await prisma.finding.deleteMany({ where: { analysisRunId } });

    const FCHUNK = 200;
    for (let i = 0; i < findings.length; i += FCHUNK) {
      const slice = findings.slice(i, i + FCHUNK);
      await prisma.finding.createMany({
        data: slice.map((f) => ({
          analysisRunId,
          kind: f.kind,
          path: f.path.slice(0, 2048),
          symbol: f.symbol ? f.symbol.slice(0, 1024) : null,
          severity: f.severity.slice(0, 32),
          evidence: f.evidence ? f.evidence.slice(0, 7900) : null,
          toolId: f.toolId.slice(0, 64),
        })),
      });
    }

    const [contributors, codeGraph] = await Promise.all([
      getContributorSummary(repoPath),
      buildCodeGraph(repoPath, ignored).catch((err) => {
        console.warn("[build-code-graph]", err);
        return null;
      }),
    ]);

    const insights = buildRunInsights(enriched, findings, contributors);

    const criticalVulnCount = findings.filter(
      (f) =>
        f.kind === "VULNERABLE_DEP" &&
        f.severity.toLowerCase() === "critical",
    ).length;

    await prisma.analysisRun.update({
      where: { id: analysisRunId },
      data: {
        status: "COMPLETED",
        finishedAt: new Date(),
        commitSha: head,
        insights,
        ...(codeGraph != null ? { codeGraph } : {}),
      },
    });

    if (criticalVulnCount > 0) {
      void notifyCriticalVulns({
        repoUserId: repo.userId,
        analysisRunId,
        repoFullName: repo.fullName,
        criticalCount: criticalVulnCount,
      });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[run-analysis]", {
      analysisRunId,
      message: msg,
      stack: e instanceof Error ? e.stack : undefined,
    });
    await prisma.analysisRun.update({
      where: { id: analysisRunId },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        error: msg.slice(0, 8000),
      },
    });
    throw e;
  } finally {
    await rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
  }
}
