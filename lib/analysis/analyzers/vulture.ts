import { execWithTimeout } from "@/lib/analysis/exec-timeout";
import type { NormalizedFinding } from "@/lib/analysis/analyzers/types";

const TOOL = "vulture";
const TIMEOUT_MS = 120_000;

/** e.g. `src/foo.py:42: unused function 'bar' (60% confidence)` */
const LINE_RE = /^(.+?):(\d+):\s*(.+)$/;

export async function runVulture(repoRoot: string): Promise<NormalizedFinding[]> {
  const pythons =
    process.platform === "win32" ? (["python", "py"] as const) : (["python3", "python"] as const);

  for (const py of pythons) {
    const { stdout, stderr, code } = await execWithTimeout(
      py,
      ["-m", "vulture", ".", "--min-confidence", "80"],
      { cwd: repoRoot, timeoutMs: TIMEOUT_MS },
    );

    const text = `${stdout}\n${stderr}`.trim();
    if (text.includes("No module named 'vulture'")) continue;
    if (!text && code !== 0) continue;

    const out: NormalizedFinding[] = [];
    for (const line of text.split("\n")) {
      const t = line.trim();
      if (!t) continue;
      const m = t.match(LINE_RE);
      if (!m) continue;
      const filePath = m[1].replace(/\\/g, "/");
      const rest = m[3];
      out.push({
        kind: "UNUSED_EXPORT",
        path: filePath,
        symbol: rest.slice(0, 200),
        severity: "medium",
        evidence: `line ${m[2]}`,
        toolId: TOOL,
      });
    }
    if (out.length > 0) return out;
    if (code === 0) return [];
  }

  return [];
}
