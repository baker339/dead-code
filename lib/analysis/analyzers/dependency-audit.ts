import * as fs from "fs/promises";
import * as path from "path";
import { execWithTimeout } from "@/lib/analysis/exec-timeout";
import type { NormalizedFinding } from "@/lib/analysis/analyzers/types";

const TIMEOUT_MS = 180_000;

const TOOL_NPM = "npm-audit";
const TOOL_PNPM = "pnpm-audit";
const TOOL_YARN_CLASSIC = "yarn-audit";
const TOOL_YARN_BERRY = "yarn-npm-audit";

type LockBackend = "pnpm" | "yarn-berry" | "yarn-classic" | "npm" | null;

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function detectLockBackend(repoRoot: string): Promise<LockBackend> {
  if (await exists(path.join(repoRoot, "pnpm-lock.yaml"))) return "pnpm";

  if (await exists(path.join(repoRoot, "yarn.lock"))) {
    if (await exists(path.join(repoRoot, ".yarnrc.yml"))) return "yarn-berry";
    try {
      const raw = await fs.readFile(
        path.join(repoRoot, "package.json"),
        "utf8",
      );
      const pkg = JSON.parse(raw) as { packageManager?: string };
      const pm = pkg.packageManager ?? "";
      if (/^yarn@[2-9]/.test(pm) || /^yarn@\d{2,}/.test(pm)) return "yarn-berry";
    } catch {
      /* classic */
    }
    return "yarn-classic";
  }

  if (
    (await exists(path.join(repoRoot, "package-lock.json"))) ||
    (await exists(path.join(repoRoot, "npm-shrinkwrap.json")))
  ) {
    return "npm";
  }

  return null;
}

function normalizeSeverity(s: string): string {
  const x = s.toLowerCase();
  return ["critical", "high", "moderate", "low", "info"].includes(x)
    ? x
    : "medium";
}

const SEV_RANK: Record<string, number> = {
  critical: 5,
  high: 4,
  moderate: 3,
  low: 2,
  info: 1,
};

function pickHigherSeverity(a: string, b: string): string {
  return (SEV_RANK[a] ?? 0) >= (SEV_RANK[b] ?? 0) ? a : b;
}

function buildEvidence(summary: string, urls: string[]): string {
  const uniq = [...new Set(urls.filter((u) => /^https?:\/\//i.test(u)))].slice(
    0,
    15,
  );
  return [summary, ...uniq].join("\n").slice(0, 7900);
}

function vulnFinding(
  name: string,
  severity: string,
  summary: string,
  urls: string[],
  toolId: string,
): NormalizedFinding {
  return {
    kind: "VULNERABLE_DEP",
    path: "package.json",
    symbol: name,
    severity: normalizeSeverity(severity),
    evidence: buildEvidence(summary, urls),
    toolId,
  };
}

type ViaEntry =
  | string
  | { title?: string; url?: string; severity?: string };

type NpmVuln = {
  name?: string;
  severity?: string;
  via?: ViaEntry[];
};

/** npm 7+ `npm audit --json` — `vulnerabilities` map */
function parseNpmVulnerabilitiesJson(
  parsed: { vulnerabilities?: Record<string, NpmVuln> },
  toolId: string,
): NormalizedFinding[] {
  const vulns = parsed.vulnerabilities;
  if (!vulns || typeof vulns !== "object") return [];

  const out: NormalizedFinding[] = [];

  for (const [key, v] of Object.entries(vulns)) {
    if (!v || typeof v !== "object") continue;
    const name = v.name ?? key;
    const sev = (v.severity ?? "medium").toLowerCase();
    const via = Array.isArray(v.via) ? v.via : [];
    const titles: string[] = [];
    const urls: string[] = [];
    for (const x of via) {
      if (typeof x === "object" && x) {
        if (x.title) titles.push(String(x.title));
        if (x.url) urls.push(String(x.url));
      }
    }
    const summary =
      titles.length > 0
        ? `${titles[0]}${titles.length > 1 ? ` (+${titles.length - 1} more)` : ""}`
        : "npm advisory";

    out.push(vulnFinding(name, sev, summary, urls, toolId));
  }

  return out;
}

type PnpmAdvisory = {
  title?: string;
  severity?: string;
  url?: string;
};

/** pnpm / npm classic audit JSON — `advisories` + `actions` */
function parsePnpmStyleAudit(
  parsed: {
    advisories?: Record<string, PnpmAdvisory>;
    actions?: {
      action?: string;
      module?: string;
      resolves?: { id?: number }[];
    }[];
  },
  toolId: string,
): NormalizedFinding[] {
  const advisories = parsed.advisories;
  const actions = parsed.actions;
  if (!advisories || typeof advisories !== "object" || !Array.isArray(actions)) {
    return [];
  }

  const byModule = new Map<string, Set<number>>();

  for (const act of actions) {
    const mod = act.module;
    if (!mod) continue;
    const ids = byModule.get(mod) ?? new Set<number>();
    for (const r of act.resolves ?? []) {
      if (r.id != null) ids.add(r.id);
    }
    byModule.set(mod, ids);
  }

  const out: NormalizedFinding[] = [];

  for (const [mod, ids] of byModule) {
    const titles = new Set<string>();
    const urls: string[] = [];
    let severity = "medium";

    for (const id of ids) {
      const a = advisories[String(id)];
      if (!a || typeof a !== "object") continue;
      if (a.title) titles.add(a.title);
      if (a.url) urls.push(a.url);
      if (a.severity) severity = pickHigherSeverity(severity, a.severity);
    }

    const tArr = [...titles];
    const summary =
      tArr.length > 0
        ? `${tArr[0]}${tArr.length > 1 ? ` (+${tArr.length - 1} more)` : ""}`
        : "Security advisory";

    out.push(vulnFinding(mod, severity, summary, urls, toolId));
  }

  return out;
}

/** Yarn v1 — NDJSON lines with `type: auditAdvisory` */
function parseYarnClassicAuditNdjson(raw: string, toolId: string): NormalizedFinding[] {
  type Row = {
    type?: string;
    data?: {
      advisory?: {
        module_name?: string;
        title?: string;
        severity?: string;
        url?: string;
      };
    };
  };

  const byModule = new Map<
    string,
    { titles: Set<string>; urls: Set<string>; severity: string }
  >();

  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t.startsWith("{")) continue;
    let row: Row;
    try {
      row = JSON.parse(t) as Row;
    } catch {
      continue;
    }
    if (row.type !== "auditAdvisory" || !row.data?.advisory) continue;
    const adv = row.data.advisory;
    const mod = adv.module_name;
    if (!mod) continue;

    const cur = byModule.get(mod) ?? {
      titles: new Set<string>(),
      urls: new Set<string>(),
      severity: "medium",
    };
    if (adv.title) cur.titles.add(adv.title);
    if (adv.url) cur.urls.add(adv.url);
    if (adv.severity) {
      cur.severity = pickHigherSeverity(
        cur.severity,
        adv.severity.toLowerCase(),
      );
    }
    byModule.set(mod, cur);
  }

  const out: NormalizedFinding[] = [];
  for (const [mod, { titles, urls, severity }] of byModule) {
    const tArr = [...titles];
    const uArr = [...urls];
    const summary =
      tArr.length > 0
        ? `${tArr[0]}${tArr.length > 1 ? ` (+${tArr.length - 1} more)` : ""}`
        : "Security advisory";
    out.push(vulnFinding(mod, severity, summary, uArr, toolId));
  }

  return out;
}

function parseAuditJson(
  raw: string,
  toolIdNpmStyle: string,
  toolIdPnpmStyle: string,
): NormalizedFinding[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  if (!parsed || typeof parsed !== "object") return [];
  const err = (parsed as { error?: { code?: string } }).error;
  if (err?.code === "ENOLOCK") return [];

  const o = parsed as Record<string, unknown>;

  if (o.vulnerabilities && typeof o.vulnerabilities === "object") {
    return parseNpmVulnerabilitiesJson(
      parsed as { vulnerabilities?: Record<string, NpmVuln> },
      toolIdNpmStyle,
    );
  }

  if (o.advisories && o.actions) {
    return parsePnpmStyleAudit(
      parsed as Parameters<typeof parsePnpmStyleAudit>[0],
      toolIdPnpmStyle,
    );
  }

  return [];
}

async function runNpmLockfileAudit(repoRoot: string): Promise<NormalizedFinding[]> {
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const r = await execWithTimeout(
    npm,
    ["audit", "--package-lock-only", "--json"],
    { cwd: repoRoot, timeoutMs: TIMEOUT_MS },
  );
  const raw = r.stdout.trim() || r.stderr.trim();
  if (!raw) return [];
  return parseAuditJson(raw, TOOL_NPM, TOOL_NPM);
}

async function runPnpmAudit(repoRoot: string): Promise<NormalizedFinding[]> {
  const npx = process.platform === "win32" ? "npx.cmd" : "npx";
  const r = await execWithTimeout(
    npx,
    ["--yes", "pnpm@9", "audit", "--json"],
    { cwd: repoRoot, timeoutMs: TIMEOUT_MS },
  );
  const raw = r.stdout.trim() || r.stderr.trim();
  if (!raw) return [];
  return parseAuditJson(raw, TOOL_PNPM, TOOL_PNPM);
}

async function runYarnClassicAudit(repoRoot: string): Promise<NormalizedFinding[]> {
  const npx = process.platform === "win32" ? "npx.cmd" : "npx";
  const r = await execWithTimeout(
    npx,
    ["--yes", "yarn@1.22.22", "audit", "--json"],
    { cwd: repoRoot, timeoutMs: TIMEOUT_MS },
  );
  const raw = r.stdout.trim() || r.stderr.trim();
  if (!raw) return [];
  const ndjson = parseYarnClassicAuditNdjson(raw, TOOL_YARN_CLASSIC);
  if (ndjson.length > 0) return ndjson;
  return parseAuditJson(raw, TOOL_YARN_CLASSIC, TOOL_YARN_CLASSIC);
}

async function runYarnBerryAudit(repoRoot: string): Promise<NormalizedFinding[]> {
  const npx = process.platform === "win32" ? "npx.cmd" : "npx";
  const r = await execWithTimeout(
    npx,
    ["--yes", "yarn@4.5.0", "npm", "audit", "--json"],
    { cwd: repoRoot, timeoutMs: TIMEOUT_MS },
  );
  const raw = r.stdout.trim() || r.stderr.trim();
  if (!raw) return [];
  return parseAuditJson(raw, TOOL_YARN_BERRY, TOOL_YARN_BERRY);
}

/**
 * One dependency audit for the repo’s primary lockfile (pnpm > yarn > npm).
 * Uses `npm audit --package-lock-only`, `pnpm audit`, or `yarn audit` / `yarn npm audit`.
 * Evidence is summary line + advisory URLs (GitHub / NVD) for UI link-out.
 */
function mergeTwoVulnerableDeps(
  a: NormalizedFinding,
  b: NormalizedFinding,
): NormalizedFinding {
  const severity = pickHigherSeverity(
    normalizeSeverity(a.severity),
    normalizeSeverity(b.severity),
  );
  const urls = new Set<string>();
  for (const line of [
    ...(a.evidence ?? "").split("\n"),
    ...(b.evidence ?? "").split("\n"),
  ]) {
    const t = line.trim();
    if (/^https?:\/\//i.test(t)) urls.add(t);
  }
  const a0 = (a.evidence ?? "").split("\n")[0]?.trim();
  const b0 = (b.evidence ?? "").split("\n")[0]?.trim();
  const summary = a0 || b0 || "Security advisory";
  const evidence = buildEvidence(summary, [...urls]);
  const toolId =
    a.toolId === b.toolId
      ? a.toolId
      : `${a.toolId}+${b.toolId}`.slice(0, 64);
  return { ...a, severity, evidence, toolId };
}

/** Merge duplicate rows for the same package path + symbol (e.g. overlapping parsers). */
function dedupeVulnerableDepFindings(
  findings: NormalizedFinding[],
): NormalizedFinding[] {
  const rest = findings.filter((f) => f.kind !== "VULNERABLE_DEP");
  const vulns = findings.filter((f) => f.kind === "VULNERABLE_DEP");
  const map = new Map<string, NormalizedFinding>();
  for (const f of vulns) {
    const key = `${f.path}\0${f.symbol ?? ""}`;
    const prev = map.get(key);
    if (!prev) map.set(key, f);
    else map.set(key, mergeTwoVulnerableDeps(prev, f));
  }
  return [...rest, ...map.values()];
}

export async function runDependencyAudits(
  repoRoot: string,
): Promise<NormalizedFinding[]> {
  const backend = await detectLockBackend(repoRoot);
  let out: NormalizedFinding[] = [];
  switch (backend) {
    case "pnpm":
      out = await runPnpmAudit(repoRoot);
      break;
    case "yarn-berry":
      out = await runYarnBerryAudit(repoRoot);
      break;
    case "yarn-classic":
      out = await runYarnClassicAudit(repoRoot);
      break;
    case "npm":
      out = await runNpmLockfileAudit(repoRoot);
      break;
    default:
      return [];
  }

  if (process.env.NODE_ENV === "development" && backend && out.length === 0) {
    console.warn(
      `[dependency-audit] ${backend}: no findings (clean lockfile or CLI/parse issue)`,
    );
  }

  return dedupeVulnerableDepFindings(out);
}
