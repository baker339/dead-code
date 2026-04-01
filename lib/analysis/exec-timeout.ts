import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export type ExecResult = {
  stdout: string;
  stderr: string;
  code: number | null;
};

/**
 * Run a command with timeout. Kills the process tree on timeout (best-effort).
 */
export async function execWithTimeout(
  file: string,
  args: string[],
  options: {
    cwd: string;
    timeoutMs: number;
    maxBuffer?: number;
    env?: NodeJS.ProcessEnv;
  },
): Promise<ExecResult> {
  const maxBuffer = options.maxBuffer ?? 50 * 1024 * 1024;
  try {
    const r = await execFileAsync(file, args, {
      cwd: options.cwd,
      maxBuffer,
      timeout: options.timeoutMs,
      env: { ...process.env, ...options.env },
    });
    return {
      stdout: r.stdout?.toString() ?? "",
      stderr: r.stderr?.toString() ?? "",
      code: 0,
    };
  } catch (err: unknown) {
    const e = err as NodeJS.ErrnoException & {
      stdout?: Buffer;
      stderr?: Buffer;
      code?: number | string | null;
    };
    return {
      stdout: e.stdout?.toString() ?? "",
      stderr: e.stderr?.toString() ?? "",
      code: typeof e.code === "number" ? e.code : 1,
    };
  }
}
