import { spawn } from "child_process";

function norm(p: string): string {
  return p.replace(/\\/g, "/").replace(/^\.\//, "");
}

function runCheckIgnoreStdin(repoDir: string, input: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "git",
      ["-c", "core.quotepath=false", "check-ignore", "-z", "--stdin", "--no-index"],
      { cwd: repoDir },
    );
    const chunks: Buffer[] = [];
    child.stdout.on("data", (c: Buffer) => chunks.push(c));
    child.stderr.on("data", () => {
      /* ignore */
    });
    child.on("error", reject);
    child.on("close", () => {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    if (child.stdin) {
      child.stdin.write(input, "utf8");
      child.stdin.end();
    } else {
      resolve("");
    }
  });
}

/**
 * Paths that match .gitignore / exclude rules, using `git check-ignore --no-index`
 * so force-tracked paths still count as ignored when the pattern would exclude them.
 */
export async function gitignoredPathSet(
  repoDir: string,
  paths: string[],
): Promise<Set<string>> {
  const unique = [...new Set(paths.map(norm))].filter(Boolean);
  const ignored = new Set<string>();
  if (unique.length === 0) return ignored;

  const chunkSize = 2_000;
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    const input = chunk.join("\0") + "\0";
    try {
      const s = await runCheckIgnoreStdin(repoDir, input);
      if (!s) continue;
      for (const p of s.split("\0")) {
        if (p) ignored.add(norm(p));
      }
    } catch {
      /* missing git — keep paths */
    }
  }

  return ignored;
}
