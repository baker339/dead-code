import { execWithTimeout } from "@/lib/analysis/exec-timeout";
import type { NormalizedFinding } from "@/lib/analysis/analyzers/types";

const TOOL = "cargo-check";
const TIMEOUT_MS = 300_000;

/**
 * Best-effort: `cargo check` warnings for unused imports/variables/dead_code.
 */
export async function runRustCargoCheck(
  repoRoot: string,
): Promise<NormalizedFinding[]> {
  const { stdout, stderr } = await execWithTimeout(
    "cargo",
    ["check", "--message-format=short", "--quiet"],
    { cwd: repoRoot, timeoutMs: TIMEOUT_MS },
  );

  const text = `${stdout}\n${stderr}`;
  const out: NormalizedFinding[] = [];

  /** `src/lib.rs:2:5: warning: unused import: `foo`` */
  const warnRe =
    /^(.+?):(\d+):(\d+):\s*warning:\s*(.+)$/;

  for (const line of text.split("\n")) {
    const t = line.trim();
    const m = t.match(warnRe);
    if (!m) continue;
    const msg = m[4].toLowerCase();
    if (
      !msg.includes("unused") &&
      !msg.includes("never used") &&
      !msg.includes("dead code")
    ) {
      continue;
    }
    const filePath = m[1].replace(/\\/g, "/");
    out.push({
      kind: "UNUSED_EXPORT",
      path: filePath,
      symbol: m[4].slice(0, 200),
      severity: "low",
      evidence: `line ${m[2]}:${m[3]}`,
      toolId: TOOL,
    });
  }

  return out;
}
