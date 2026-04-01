import type { RepoFingerprint } from "@/lib/analysis/fingerprint";
import { runKnip } from "@/lib/analysis/analyzers/knip";
import { runVulture } from "@/lib/analysis/analyzers/vulture";
import { runGoDeadcode } from "@/lib/analysis/analyzers/go-deadcode";
import { runRustCargoCheck } from "@/lib/analysis/analyzers/rust-warnings";
import { runDependencyAudits } from "@/lib/analysis/analyzers/dependency-audit";
import { runDotnetBuild } from "@/lib/analysis/analyzers/dotnet-build";
import { runJavaCompile } from "@/lib/analysis/analyzers/java-compile";
import { runSwiftBuild } from "@/lib/analysis/analyzers/swift-build";
import type { NormalizedFinding } from "@/lib/analysis/analyzers/types";

async function safeRun(
  label: string,
  fn: () => Promise<NormalizedFinding[]>,
): Promise<NormalizedFinding[]> {
  try {
    return await fn();
  } catch (e) {
    console.warn(`[analyzers] ${label} skipped:`, e);
    return [];
  }
}

export async function runStaticAnalyzers(
  repoRoot: string,
  fp: RepoFingerprint,
): Promise<NormalizedFinding[]> {
  const batches: Promise<NormalizedFinding[]>[] = [];

  if (fp.jsTs) {
    batches.push(safeRun("knip", () => runKnip(repoRoot)));
    batches.push(
      safeRun("dependency-audit", () => runDependencyAudits(repoRoot)),
    );
  }
  if (fp.python) {
    batches.push(safeRun("vulture", () => runVulture(repoRoot)));
  }
  if (fp.go) {
    batches.push(safeRun("go-deadcode", () => runGoDeadcode(repoRoot)));
  }
  if (fp.rust) {
    batches.push(safeRun("cargo-check", () => runRustCargoCheck(repoRoot)));
  }
  if (fp.csharp) {
    batches.push(safeRun("dotnet-build", () => runDotnetBuild(repoRoot)));
  }
  if (fp.java) {
    batches.push(safeRun("java-compile", () => runJavaCompile(repoRoot)));
  }
  if (fp.swift) {
    batches.push(safeRun("swift-build", () => runSwiftBuild(repoRoot)));
  }

  const parts = await Promise.all(batches);
  return parts.flat();
}
