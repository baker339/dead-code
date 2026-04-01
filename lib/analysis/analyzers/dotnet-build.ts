import * as path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { execWithTimeout } from "@/lib/analysis/exec-timeout";
import type { NormalizedFinding } from "@/lib/analysis/analyzers/types";

const TOOL = "dotnet-build";
const TIMEOUT_MS = 300_000;

const execFileAsync = promisify(execFile);

/** MSBuild: path(line,col): warning CODE: message */
const WARN_RE =
  /^(.+?)\((\d+),(\d+)\):\s*(?:warning|error)\s+([\w]+):\s*(.+)$/;

const UNUSED_LIKE = new Set([
  "IDE0051",
  "IDE0052",
  "IDE0055",
  "IDE0060",
  "IDE0130",
  "CS0168",
  "CS0219",
  "CS0414",
  "CS0649",
  "CS0162",
  "CS8321",
]);

async function findDotnetEntry(repoRoot: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["-c", "core.quotepath=false", "ls-files", "*.sln", "*.csproj"],
      { cwd: repoRoot, maxBuffer: 10 * 1024 * 1024 },
    );
    const lines = stdout
      .toString()
      .split("\n")
      .map((l) => l.trim().replace(/\\/g, "/"))
      .filter(Boolean);
    const sln = lines.find((l) => l.endsWith(".sln"));
    if (sln) return sln;
    const csproj = lines.find(
      (l) =>
        l.endsWith(".csproj") &&
        !/test|tests|sample|benchmark/i.test(l),
    );
    return csproj ?? lines.find((l) => l.endsWith(".csproj")) ?? null;
  } catch {
    return null;
  }
}

function kindForCode(code: string): NormalizedFinding["kind"] {
  if (
    code.startsWith("IDE") ||
    code === "CS0414" ||
    code === "CS0649" ||
    code === "CS8321"
  ) {
    return "UNUSED_EXPORT";
  }
  return "OTHER";
}

function severityForCode(code: string): string {
  if (code.startsWith("CS") && code !== "CS0168") return "medium";
  return "low";
}

export async function runDotnetBuild(repoRoot: string): Promise<NormalizedFinding[]> {
  const entry = await findDotnetEntry(repoRoot);
  if (!entry) return [];

  const dotnet = "dotnet";

  try {
    await execWithTimeout(
      dotnet,
      ["restore", entry],
      { cwd: repoRoot, timeoutMs: 120_000 },
    );
  } catch {
    /* restore may fail offline; still try build */
  }

  const r = await execWithTimeout(
    dotnet,
    [
      "build",
      entry,
      "--no-restore",
      "-v:minimal",
      "/p:RunAnalyzers=true",
      "/p:AnalysisLevel=latest",
    ],
    { cwd: repoRoot, timeoutMs: TIMEOUT_MS },
  );

  const text = `${r.stdout}\n${r.stderr}`;
  const out: NormalizedFinding[] = [];

  for (const line of text.split("\n")) {
    const t = line.trim();
    const m = t.match(WARN_RE);
    if (!m) continue;
    const code = m[4];
    if (!UNUSED_LIKE.has(code)) continue;

    let rel = m[1].replace(/\\/g, "/");
    if (path.isAbsolute(rel)) {
      rel = path.relative(repoRoot, rel).replace(/\\/g, "/");
    }

    out.push({
      kind: kindForCode(code),
      path: rel,
      symbol: `${code}: ${m[5].slice(0, 500)}`,
      severity: severityForCode(code),
      evidence: `line ${m[2]}:${m[3]}`,
      toolId: TOOL,
    });
  }

  return out;
}
