import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export type ContributorRow = { name: string; commits: number };

/**
 * Maintainer concentration hints via `git shortlog` + total non-merge commits.
 */
export async function getContributorSummary(
  repoDir: string,
  maxAuthors = 25,
): Promise<{
  top: ContributorRow[];
  totalCommits: number;
  top3CommitShare: number;
}> {
  try {
    const [{ stdout: countOut }, { stdout: shortOut }] = await Promise.all([
      execFileAsync("git", ["rev-list", "--count", "--no-merges", "HEAD"], {
        cwd: repoDir,
        maxBuffer: 1024 * 1024,
        timeout: 60_000,
      }),
      execFileAsync("git", ["shortlog", "-sn", "--no-merges", "HEAD"], {
        cwd: repoDir,
        maxBuffer: 5 * 1024 * 1024,
        timeout: 60_000,
      }),
    ]);

    const totalCommits = Math.max(
      0,
      Number.parseInt(countOut.toString().trim(), 10) || 0,
    );

    const rows: ContributorRow[] = [];
    for (const line of shortOut.toString().split("\n")) {
      const m = line.match(/^\s*(\d+)\s+(.+)$/);
      if (!m) continue;
      rows.push({
        commits: Number.parseInt(m[1], 10),
        name: m[2].trim().slice(0, 120),
      });
      if (rows.length >= maxAuthors) break;
    }

    const top3 = rows.slice(0, 3).reduce((s, r) => s + r.commits, 0);
    const top3CommitShare =
      totalCommits > 0 ? Math.round((top3 / totalCommits) * 1000) / 1000 : 0;

    return { top: rows, totalCommits, top3CommitShare };
  } catch {
    return { top: [], totalCommits: 0, top3CommitShare: 0 };
  }
}
