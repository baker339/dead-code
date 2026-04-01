import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

/** Cap commits scanned to bound memory on huge histories. */
export const MAX_COMMITS = 8_000;

/** Unambiguous line prefix so we never confuse commit headers with file paths. */
const META_PREFIX = "deadcode-meta:";
const NUMSTAT_MARKER = "deadcode-numstat";

export type FileMetricsPayload = {
  lastCommitAt: string;
  commitCount: number;
  linesAdded: number;
  linesRemoved: number;
  daysSinceLastCommit: number;
};

export type PerFileGitMetrics = {
  path: string;
  metrics: FileMetricsPayload;
};

type CommitBlock = { timestamp: number; files: string[] };

/**
 * Parse `git log --pretty=format:deadcode-meta:%H %ct --name-only`
 * (one meta line per commit, then paths until next meta or blank block end).
 */
function parseMarkedNameOnlyLog(out: string): CommitBlock[] {
  const lines = out.split("\n");
  const commits: CommitBlock[] = [];
  let i = 0;
  const metaRe = new RegExp(
    `^${META_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([0-9a-fA-F]+)\\s+(\\d+)\\s*$`,
  );

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trimEnd();
    if (!trimmed.trim()) {
      i++;
      continue;
    }
    const m = trimmed.match(metaRe);
    if (!m) {
      i++;
      continue;
    }
    i++;
    const timestamp = Number.parseInt(m[2], 10);
    if (!Number.isFinite(timestamp)) {
      continue;
    }
    const files: string[] = [];
    while (i < lines.length) {
      const L = lines[i];
      const t = L.trim();
      if (!t) {
        i++;
        break;
      }
      if (t.startsWith(META_PREFIX)) break;
      if (t.length <= 4096) files.push(t.replace(/\\/g, "/"));
      i++;
    }
    commits.push({ timestamp, files });
  }
  return commits;
}

function parseMarkedNumstat(out: string): Map<string, { added: number; removed: number }> {
  const map = new Map<string, { added: number; removed: number }>();
  const lines = out.split("\n");
  let i = 0;

  while (i < lines.length) {
    const t = lines[i].trim();
    if (t === NUMSTAT_MARKER) {
      i++;
      while (i < lines.length) {
        const L = lines[i];
        const row = L.trim();
        if (!row || row === NUMSTAT_MARKER) break;
        const m = row.match(/^(\d+|-)\t(\d+|-)\t(.+)$/);
        i++;
        if (!m) continue;
        const added = m[1] === "-" ? 0 : Number.parseInt(m[1], 10);
        const removed = m[2] === "-" ? 0 : Number.parseInt(m[2], 10);
        const p = m[3].trim().replace(/\\/g, "/");
        const prev = map.get(p) ?? { added: 0, removed: 0 };
        map.set(p, { added: prev.added + added, removed: prev.removed + removed });
      }
    } else {
      i++;
    }
  }
  return map;
}

/**
 * Fallback when log parsing yields nothing (older git, unexpected output): one row
 * per tracked file with commitCount 0 and lastCommit from `git log -1` for that path.
 */
async function metricsFromLsFiles(
  repoDir: string,
  maxBuffer: number,
): Promise<PerFileGitMetrics[]> {
  const { stdout: lsOut } = await execFileAsync("git", ["ls-files"], {
    cwd: repoDir,
    maxBuffer,
  });
  const paths = lsOut
    .toString()
    .split("\n")
    .map((p) => p.trim().replace(/\\/g, "/"))
    .filter(Boolean);

  const out: PerFileGitMetrics[] = [];
  const now = Date.now();
  const cap = Math.min(paths.length, 10_000);

  for (let i = 0; i < cap; i++) {
    const filePath = paths[i];
    let lastCommitAt = new Date(now);
    try {
      const { stdout: tOut } = await execFileAsync(
        "git",
        ["log", "-1", "--format=%ct", "--", filePath],
        { cwd: repoDir, maxBuffer: 1024 * 1024 },
      );
      const ts = Number.parseInt(tOut.toString().trim(), 10);
      if (Number.isFinite(ts)) {
        lastCommitAt = new Date(ts * 1000);
      }
    } catch {
      /* binary / missing — keep default */
    }

    const daysSinceLastCommit = Math.floor(
      (now - lastCommitAt.getTime()) / (1000 * 60 * 60 * 24),
    );

    out.push({
      path: filePath,
      metrics: {
        lastCommitAt: lastCommitAt.toISOString(),
        commitCount: 0,
        linesAdded: 0,
        linesRemoved: 0,
        daysSinceLastCommit,
      },
    });
  }

  out.sort((a, b) => a.path.localeCompare(b.path));
  return out;
}

export async function computeGitFileMetrics(
  repoDir: string,
): Promise<PerFileGitMetrics[]> {
  const maxBuffer = 100 * 1024 * 1024;
  const metaFormat = `--pretty=format:${META_PREFIX}%H %ct`;

  const { stdout: logOut } = await execFileAsync(
    "git",
    [
      "-c",
      "core.quotepath=false",
      "log",
      "--no-merges",
      `--max-count=${MAX_COMMITS}`,
      metaFormat,
      "--name-only",
    ],
    { cwd: repoDir, maxBuffer },
  );

  const { stdout: numOut } = await execFileAsync(
    "git",
    [
      "-c",
      "core.quotepath=false",
      "log",
      "--no-merges",
      `--max-count=${MAX_COMMITS}`,
      "--numstat",
      `--pretty=format:${NUMSTAT_MARKER}`,
    ],
    { cwd: repoDir, maxBuffer },
  );

  const commits = parseMarkedNameOnlyLog(logOut.toString());
  const churn = parseMarkedNumstat(numOut.toString());

  const byFile = new Map<
    string,
    { lastCommitAt: Date; commitCount: number; linesAdded: number; linesRemoved: number }
  >();

  for (const c of commits) {
    for (const f of c.files) {
      let e = byFile.get(f);
      if (!e) {
        e = {
          lastCommitAt: new Date(c.timestamp * 1000),
          commitCount: 0,
          linesAdded: 0,
          linesRemoved: 0,
        };
        byFile.set(f, e);
      }
      e.commitCount += 1;
    }
  }

  for (const [fp, ch] of churn) {
    const e = byFile.get(fp);
    if (e) {
      e.linesAdded = ch.added;
      e.linesRemoved = ch.removed;
    }
  }

  if (byFile.size === 0) {
    return metricsFromLsFiles(repoDir, maxBuffer);
  }

  const now = Date.now();
  const out: PerFileGitMetrics[] = [];

  for (const [filePath, e] of byFile) {
    const daysSinceLastCommit = Math.floor(
      (now - e.lastCommitAt.getTime()) / (1000 * 60 * 60 * 24),
    );
    out.push({
      path: filePath,
      metrics: {
        lastCommitAt: e.lastCommitAt.toISOString(),
        commitCount: e.commitCount,
        linesAdded: e.linesAdded,
        linesRemoved: e.linesRemoved,
        daysSinceLastCommit,
      },
    });
  }

  out.sort((a, b) => a.path.localeCompare(b.path));
  return out;
}
