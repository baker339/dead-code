import type { CodeGraphV1 } from "@/lib/analysis/code-graph-types";

export function parseCodeGraph(raw: unknown): CodeGraphV1 | null {
  if (raw == null || typeof raw !== "object") return null;
  const o = raw as Partial<CodeGraphV1>;
  if (o.v !== 1) return null;
  if (!Array.isArray(o.nodes) || !Array.isArray(o.edges)) return null;
  return o as CodeGraphV1;
}
