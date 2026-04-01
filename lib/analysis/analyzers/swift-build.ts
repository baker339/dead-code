import * as fs from "fs/promises";
import * as path from "path";
import { execWithTimeout } from "@/lib/analysis/exec-timeout";
import type { NormalizedFinding } from "@/lib/analysis/analyzers/types";

const TOOL_SWIFT = "swift-build";
const TIMEOUT_MS = 300_000;

const SWIFT_WARN =
  /^(.+?):(\d+):(\d+):\s*warning:\s*(.+)$/;
const UNUSED_HINT =
  /unused|never used|never read|dead|unreachable|immutable|no.*calls/i;

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

function parseSwiftDiagnostics(
  text: string,
  repoRoot: string,
): NormalizedFinding[] {
  const out: NormalizedFinding[] = [];
  for (const line of text.split("\n")) {
    const t = line.trim();
    const m = t.match(SWIFT_WARN);
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
      evidence: `line ${m[2]}:${m[3]}`,
      toolId: TOOL_SWIFT,
    });
  }
  return out;
}

/**
 * `swift build` diagnostics for SwiftPM repos. Install the Swift toolchain on
 * analysis workers. Optional: run Periphery separately for deeper unused detection.
 */
export async function runSwiftBuild(repoRoot: string): Promise<NormalizedFinding[]> {
  const pkg = path.join(repoRoot, "Package.swift");
  if (!(await exists(pkg))) return [];

  const swift = process.platform === "win32" ? "swift.exe" : "swift";
  const r = await execWithTimeout(
    swift,
    ["build"],
    { cwd: repoRoot, timeoutMs: TIMEOUT_MS },
  );
  const text = `${r.stdout}\n${r.stderr}`;
  return parseSwiftDiagnostics(text, repoRoot);
}
