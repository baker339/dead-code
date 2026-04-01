import * as fs from "fs/promises";
import * as path from "path";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export type RepoFingerprint = {
  jsTs: boolean;
  python: boolean;
  go: boolean;
  rust: boolean;
  csharp: boolean;
  java: boolean;
  swift: boolean;
};

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function hasDotnetProject(repoRoot: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["-c", "core.quotepath=false", "ls-files", "*.csproj", "*.sln"],
      { cwd: repoRoot, maxBuffer: 2 * 1024 * 1024 },
    );
    return stdout.toString().trim().length > 0;
  } catch {
    try {
      const names = await fs.readdir(repoRoot);
      return names.some((n) => n.endsWith(".csproj") || n.endsWith(".sln"));
    } catch {
      return false;
    }
  }
}

export async function fingerprintRepo(repoRoot: string): Promise<RepoFingerprint> {
  const pkg = path.join(repoRoot, "package.json");
  const goMod = path.join(repoRoot, "go.mod");
  const cargo = path.join(repoRoot, "Cargo.toml");
  const pyProject = path.join(repoRoot, "pyproject.toml");
  const req = path.join(repoRoot, "requirements.txt");
  const setupPy = path.join(repoRoot, "setup.py");

  const pom = path.join(repoRoot, "pom.xml");
  const gradle = path.join(repoRoot, "build.gradle");
  const gradleKts = path.join(repoRoot, "build.gradle.kts");
  const settingsGradle = path.join(repoRoot, "settings.gradle");
  const swiftPkg = path.join(repoRoot, "Package.swift");

  const [
    hasPkg,
    hasGo,
    hasCargo,
    hasPyProject,
    hasReq,
    hasSetup,
    hasPom,
    hasGradleFile,
    hasSettingsGradle,
    hasGradleKts,
    hasSwiftPkg,
    csharp,
  ] = await Promise.all([
    exists(pkg),
    exists(goMod),
    exists(cargo),
    exists(pyProject),
    exists(req),
    exists(setupPy),
    exists(pom),
    exists(gradle),
    exists(settingsGradle),
    exists(gradleKts),
    exists(swiftPkg),
    hasDotnetProject(repoRoot),
  ]);

  const java = hasPom || hasGradleFile || hasSettingsGradle || hasGradleKts;

  return {
    jsTs: hasPkg,
    python: hasPyProject || hasReq || hasSetup,
    go: hasGo,
    rust: hasCargo,
    csharp,
    java,
    swift: hasSwiftPkg,
  };
}
