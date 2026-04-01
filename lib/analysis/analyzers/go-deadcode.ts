import * as path from "path";
import { execWithTimeout } from "@/lib/analysis/exec-timeout";
import type { NormalizedFinding } from "@/lib/analysis/analyzers/types";

const TOOL = "go-deadcode";
const TIMEOUT_MS = 180_000;

/** deadcode: `file.go:12:6: unreachable func Foo` */
const LINE_RE = /^(.+?):(\d+):(\d+):\s*(.+)$/;

export async function runGoDeadcode(
  repoRoot: string,
): Promise<NormalizedFinding[]> {
  const { stdout, stderr } = await execWithTimeout(
    "go",
    [
      "run",
      "golang.org/x/tools/cmd/deadcode@v0.30.0",
      "-test",
      "./...",
    ],
    {
      cwd: repoRoot,
      timeoutMs: TIMEOUT_MS,
      env: { ...process.env, GOTOOLCHAIN: "local" },
    },
  );

  const text = stdout || stderr;
  const out: NormalizedFinding[] = [];

  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const m = t.match(LINE_RE);
    if (!m) continue;
    let rel = m[1].replace(/\\/g, "/");
    if (path.isAbsolute(rel)) {
      rel = path.relative(repoRoot, rel).replace(/\\/g, "/");
    }
    out.push({
      kind: "UNUSED_EXPORT",
      path: rel,
      symbol: m[4].slice(0, 200),
      severity: "medium",
      evidence: `line ${m[2]}:${m[3]}`,
      toolId: TOOL,
    });
  }

  return out;
}
