import type { FindingKind } from "@prisma/client";

export type NormalizedFinding = {
  kind: FindingKind;
  path: string;
  symbol: string | null;
  severity: string;
  evidence: string | null;
  toolId: string;
};
