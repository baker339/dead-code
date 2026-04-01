import * as fs from "fs/promises";
import * as path from "path";
import { execWithTimeout } from "@/lib/analysis/exec-timeout";
import type { NormalizedFinding } from "@/lib/analysis/analyzers/types";

const TOOL_MVN = "mvn-compile";
const TOOL_GRADLE = "gradle-compile";
const TIMEOUT_MS = 300_000;

/** javac style: path(line,col) javac: warning: ... OR path:line: warning: */
const PATH_WARN =
  /^(.+?\.java):(\d+)(?::(\d+))?:\s*(?:warning|error):\s*(.+)$/i;
const UNUSED_HINT =
  /unused|never used|not used|dead code|removal|never read|is never used/i;

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

function parseCompilerOutput(
  text: string,
  repoRoot: string,
  toolId: string,
): NormalizedFinding[] {
  const out: NormalizedFinding[] = [];
  for (const line of text.split("\n")) {
    const t = line.trim();
    const m = t.match(PATH_WARN);
    if (!m) continue;
    if (!UNUSED_HINT.test(m[4])) continue;
    let rel = m[1].replace(/\\/g, "/");
    if (path.isAbsolute(rel)) {
      rel = path.relative(repoRoot, rel).replace(/\\/g, "/");
    }
    out.push({
      kind: "OTHER",
      path: rel,
      symbol: m[4].slice(0, 500),
      severity: "low",
      evidence: `line ${m[2]}`,
      toolId,
    });
  }
  return out;
}

export async function runJavaCompile(repoRoot: string): Promise<NormalizedFinding[]> {
  const hasPom = await exists(path.join(repoRoot, "pom.xml"));
  const gradlew = path.join(
    repoRoot,
    process.platform === "win32" ? "gradlew.bat" : "gradlew",
  );
  const hasGradle = await exists(gradlew);

  if (hasPom) {
    const r = await execWithTimeout(
      "mvn",
      ["-B", "-q", "compile", "-DskipTests"],
      { cwd: repoRoot, timeoutMs: TIMEOUT_MS },
    );
    const text = `${r.stdout}\n${r.stderr}`;
    return parseCompilerOutput(text, repoRoot, TOOL_MVN);
  }

  if (hasGradle) {
    const cmd = process.platform === "win32" ? "gradlew.bat" : "./gradlew";
    const r = await execWithTimeout(
      cmd,
      ["classes", "--warning-mode", "all"],
      { cwd: repoRoot, timeoutMs: TIMEOUT_MS },
    );
    const text = `${r.stdout}\n${r.stderr}`;
    return parseCompilerOutput(text, repoRoot, TOOL_GRADLE);
  }

  return [];
}
