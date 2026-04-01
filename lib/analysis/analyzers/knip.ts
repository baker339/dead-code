import type { FindingKind } from "@prisma/client";
import { execWithTimeout } from "@/lib/analysis/exec-timeout";
import type { NormalizedFinding } from "@/lib/analysis/analyzers/types";

const TOOL = "knip";
const TIMEOUT_MS = 180_000;

const DEP_SECTIONS = new Set([
  "dependencies",
  "devDependencies",
  "optionalPeerDependencies",
  "catalog",
  "unlisted",
]);

const EXPORT_SECTIONS = new Set([
  "exports",
  "types",
  "enumMembers",
  "namespaceMembers",
  "nsExports",
  "nsTypes",
]);

function sectionKind(section: string): FindingKind {
  if (DEP_SECTIONS.has(section)) return "REDUNDANT_DEP";
  if (section === "files") return "UNUSED_FILE";
  if (EXPORT_SECTIONS.has(section)) return "UNUSED_EXPORT";
  return "OTHER";
}

type KnipItem = { name?: string; line?: number; col?: number };
type KnipRow = { file: string } & Record<string, unknown>;

export async function runKnip(repoRoot: string): Promise<NormalizedFinding[]> {
  const npx = process.platform === "win32" ? "npx.cmd" : "npx";
  const { stdout, stderr } = await execWithTimeout(
    npx,
    ["--yes", "knip@5", "--reporter", "json", "--no-progress"],
    { cwd: repoRoot, timeoutMs: TIMEOUT_MS },
  );

  const raw = stdout.trim() || stderr.trim();
  if (!raw) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  const issues = (parsed as { issues?: KnipRow[] }).issues;
  if (!Array.isArray(issues)) return [];

  const out: NormalizedFinding[] = [];

  for (const row of issues) {
    if (!row?.file) continue;
    const filePath = String(row.file).replace(/\\/g, "/");

    for (const [section, value] of Object.entries(row)) {
      if (section === "file" || section === "owners") continue;
      if (!Array.isArray(value)) continue;

      const kind = sectionKind(section);
      for (const item of value as KnipItem[]) {
        if (!item || typeof item !== "object") continue;
        const name = item.name ?? "(unnamed)";
        const line = item.line;
        out.push({
          kind,
          path: filePath,
          symbol: String(name),
          severity: kind === "UNUSED_FILE" ? "high" : "medium",
          evidence:
            line != null
              ? `${section} (line ${line})`
              : `knip:${section}`,
          toolId: TOOL,
        });
      }
    }
  }

  return out;
}
