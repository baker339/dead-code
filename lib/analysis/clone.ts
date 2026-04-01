import * as fs from "fs/promises";
import * as path from "path";
import simpleGit from "simple-git";

export function githubCloneUrl(fullName: string, token: string): string {
  const safe = encodeURIComponent(token);
  return `https://x-access-token:${safe}@github.com/${fullName}.git`;
}

const DEPTH = "200";

/**
 * Clone into `{tmpRoot}/repo`. `tmpRoot` must exist (e.g. from mkdtemp).
 */
export async function shallowCloneToDir(
  cloneUrl: string,
  tmpRoot: string,
  branch: string,
): Promise<string> {
  const repoPath = path.join(tmpRoot, "repo");
  const git = simpleGit();

  try {
    await git.clone(cloneUrl, repoPath, [
      "--depth",
      DEPTH,
      "--single-branch",
      "--branch",
      branch,
    ]);
  } catch {
    await fs.rm(repoPath, { recursive: true, force: true }).catch(() => {});
    await git.clone(cloneUrl, repoPath, ["--depth", DEPTH, "--single-branch"]);
  }

  return repoPath;
}
