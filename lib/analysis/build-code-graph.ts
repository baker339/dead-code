import * as fs from "fs/promises";
import * as path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import type { CodeGraphV1 } from "@/lib/analysis/code-graph-types";

const execFileAsync = promisify(execFile);

const MAX_FILES = 1_200;
const MAX_EDGES = 4_000;
const MAX_NAMESPACE_TARGETS = 12;

function norm(p: string): string {
  return p.replace(/\\/g, "/");
}

const SOURCE_EXTS = [
  ".java",
  ".kt",
  ".cs",
  ".swift",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".py",
  ".go",
  ".rs",
];

async function gitSourceFiles(
  repoRoot: string,
  exts: string[],
): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["-c", "core.quotepath=false", "ls-files"],
      { cwd: repoRoot, maxBuffer: 20 * 1024 * 1024 },
    );
    const set = new Set(exts.map((e) => e.toLowerCase()));
    return stdout
      .toString()
      .split("\n")
      .map((l) => l.trim().replace(/\\/g, "/"))
      .filter((p) => {
        const i = p.lastIndexOf(".");
        if (i < 0) return false;
        return set.has(p.slice(i).toLowerCase());
      })
      .slice(0, MAX_FILES);
  } catch {
    return [];
  }
}

async function readHead(p: string, max = 120_000): Promise<string> {
  try {
    const buf = await fs.readFile(p);
    const s = buf.toString("utf8");
    return s.length > max ? s.slice(0, max) : s;
  } catch {
    return "";
  }
}

/** Walk up from `fromRel`’s directory until a Cargo.toml is found; returns dir relative to repo ("" = root). */
async function findCargoDir(
  repoRoot: string,
  fromRel: string,
): Promise<string | null> {
  let dir = path.dirname(fromRel);
  for (;;) {
    const relCargo =
      dir === "." || dir === ""
        ? "Cargo.toml"
        : norm(path.join(dir, "Cargo.toml"));
    try {
      await fs.access(path.join(repoRoot, relCargo));
      return dir === "." || dir === "" ? "" : norm(dir);
    } catch {
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  return null;
}

function langFromPath(rel: string): CodeGraphV1["nodes"][0]["language"] {
  const lower = rel.toLowerCase();
  if (lower.endsWith(".ts") || lower.endsWith(".tsx")) return "typescript";
  if (
    lower.endsWith(".js") ||
    lower.endsWith(".jsx") ||
    lower.endsWith(".mjs") ||
    lower.endsWith(".cjs")
  ) {
    return "javascript";
  }
  if (lower.endsWith(".py")) return "python";
  if (lower.endsWith(".go")) return "go";
  if (lower.endsWith(".rs")) return "rust";
  if (lower.endsWith(".java")) return "java";
  if (lower.endsWith(".kt")) return "kotlin";
  if (lower.endsWith(".cs")) return "csharp";
  if (lower.endsWith(".swift")) return "swift";
  return "javascript";
}

/** Java / Kotlin: full type name → relative path */
async function buildJavaIndex(
  repoRoot: string,
  jvmPaths: string[],
): Promise<Map<string, string>> {
  const idx = new Map<string, string>();
  for (const rel of jvmPaths) {
    const full = path.join(repoRoot, rel);
    const raw = await readHead(full);
    const pkg = raw.match(/^\s*package\s+([\w.]+)\s*;/m)?.[1];
    const cls =
      raw.match(
        /(?:public|protected|private)?\s*(?:abstract\s+)?(?:final\s+)?(?:strictfp\s+)?class\s+(\w+)/m,
      )?.[1] ??
      raw.match(
        /(?:public|protected|private)?\s*(?:abstract\s+)?(?:final\s+)?interface\s+(\w+)/m,
      )?.[1] ??
      raw.match(/(?:public\s+)?enum\s+(\w+)/m)?.[1] ??
      raw.match(
        /(?:public|internal|protected|private)?\s*(?:abstract\s+)?(?:sealed\s+)?class\s+(\w+)/m,
      )?.[1] ??
      raw.match(
        /(?:public|internal|protected|private)?\s*(?:abstract\s+)?interface\s+(\w+)/m,
      )?.[1] ??
      raw.match(/(?:public|internal)?\s*object\s+(\w+)/m)?.[1];
    if (pkg && cls) idx.set(`${pkg}.${cls}`, rel);
  }
  return idx;
}

/** C#: full type name (namespace.class) → path */
async function buildCsharpIndex(
  repoRoot: string,
  csPaths: string[],
): Promise<Map<string, string>> {
  const idx = new Map<string, string>();
  for (const rel of csPaths) {
    const full = path.join(repoRoot, rel);
    const raw = await readHead(full);
    const ns =
      raw.match(/^\s*namespace\s+([\w.]+)\s*[{;]/m)?.[1] ??
      raw.match(/^\s*namespace\s+([\w.]+)\s*$/m)?.[1];
    const cls =
      raw.match(
        /(?:public|internal|protected|private)?\s*(?:abstract\s+)?(?:partial\s+)?(?:sealed\s+)?class\s+(\w+)/m,
      )?.[1] ??
      raw.match(
        /(?:public|internal|protected|private)?\s*(?:abstract\s+)?(?:partial\s+)?(?:sealed\s+)?record\s+(\w+)/m,
      )?.[1] ??
      raw.match(
        /(?:public|internal|protected|private)?\s*(?:abstract\s+)?interface\s+(\w+)/m,
      )?.[1];
    if (ns && cls) idx.set(`${ns}.${cls}`, rel);
  }
  return idx;
}

async function readGoModulePrefix(repoRoot: string): Promise<string | null> {
  const gm = path.join(repoRoot, "go.mod");
  const raw = await readHead(gm, 64_000);
  const m = raw.match(/^module\s+(\S+)/m);
  return m?.[1]?.replace(/\/$/, "") ?? null;
}

function javaImportLines(raw: string): string[] {
  const out: string[] = [];
  for (const line of raw.split("\n")) {
    const t = line.trim();
    const im = t.match(/^import\s+(?:static\s+)?([\w.*]+);/);
    if (im) out.push(im[1]);
  }
  return out;
}

function csharpUsingLines(raw: string): string[] {
  const out: string[] = [];
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (t.startsWith("//") || t.startsWith("/*")) continue;
    const m = t.match(/^using\s+(?:static\s+)?([\w.]+)\s*;/);
    if (!m) continue;
    const u = m[1];
    if (
      u.startsWith("System") ||
      u.startsWith("Microsoft") ||
      u.startsWith("global::")
    ) {
      continue;
    }
    out.push(u);
  }
  return out;
}

function swiftImportLines(raw: string): string[] {
  const out: string[] = [];
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t.startsWith("import ")) continue;
    const rest = t.slice(7).trim();
    const m = rest.match(/^([\w.]+)/);
    if (m) out.push(m[1]);
  }
  return out;
}

function stripJsComments(raw: string): string {
  return raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

function extractJsImports(raw: string): string[] {
  const out = new Set<string>();
  const str = stripJsComments(raw);
  const patterns = [
    /\bfrom\s+['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bimport\s+['"]([^'"]+)['"]\s*;/g,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(str))) out.add(m[1]);
  }
  return [...out];
}

function resolveJsLike(
  fromRel: string,
  spec: string,
  fileSet: Set<string>,
): string | null {
  const s = spec.trim();
  if (!s.startsWith(".")) return null;
  if (s.startsWith("data:") || s.startsWith("node:") || s.startsWith("bun:")) {
    return null;
  }
  const dir = path.posix.dirname(fromRel);
  const merged = norm(path.posix.join(dir, s));
  const base = merged.replace(/\/$/, "");
  const variants = [
    base,
    base + ".ts",
    base + ".tsx",
    base + ".js",
    base + ".jsx",
    base + ".mjs",
    base + ".cjs",
    path.posix.join(base, "index.ts"),
    path.posix.join(base, "index.tsx"),
    path.posix.join(base, "index.js"),
    path.posix.join(base, "index.jsx"),
  ];
  for (const v of variants) {
    if (fileSet.has(v)) return v;
  }
  return null;
}

function extractPythonImports(raw: string): string[] {
  const out: string[] = [];
  for (let line of raw.split("\n")) {
    let t = line.trim();
    if (t.startsWith("#")) continue;
    if (t.includes("#")) t = t.split("#")[0]?.trim() ?? "";
    const fm = t.match(/^from\s+([\w.]+)\s+import\b/);
    if (fm) {
      out.push(fm[1]);
      continue;
    }
    const im = t.match(/^import\s+([\w.]+)\b/);
    if (im) out.push(im[1]);
  }
  return out;
}

function resolvePythonModule(mod: string, fileSet: Set<string>): string | null {
  const joined = mod.split(".").join("/");
  const tries = [`${joined}.py`, `${joined}/__init__.py`];
  for (const t of tries) {
    if (fileSet.has(t)) return t;
  }
  return null;
}

function extractGoImports(raw: string): string[] {
  const out = new Set<string>();
  const block = raw.match(/import\s*\(([\s\S]*?)\)/);
  if (block) {
    const re = /"([^"]+)"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(block[1]))) out.add(m[1]);
  }
  for (const line of raw.split("\n")) {
    const t = line.trim();
    const sm = t.match(/^import\s+"([^"]+)"/);
    if (sm) out.add(sm[1]);
  }
  return [...out];
}

function resolveGoImport(
  imp: string,
  fileSet: Set<string>,
  modulePrefix: string | null,
): string | null {
  if (!imp.includes("/")) return null;
  let rel = imp;
  if (modulePrefix && imp.startsWith(modulePrefix)) {
    rel = imp.slice(modulePrefix.length).replace(/^\//, "");
  }
  const tries = [
    rel + ".go",
    path.posix.join(rel, path.posix.basename(rel) + ".go"),
  ];
  for (const t of tries) {
    const n = norm(t);
    if (fileSet.has(n)) return n;
  }
  const last = imp.split("/").pop() ?? "";
  if (last) {
    for (const f of fileSet) {
      if (f.endsWith("/" + last + ".go")) return f;
    }
  }
  return null;
}

/** One-line `use crate::...;` (multiline `use` blocks are best-effort via stripped newlines). */
function extractRustCrateUses(raw: string): string[] {
  const out: string[] = [];
  const cleaned = raw
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  const oneLine = cleaned.replace(/\s+/g, " ");
  const re = /\buse\s+(crate::[^;]+)\s*;/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(oneLine))) {
    let p = m[1].trim();
    p = p.replace(/\s+as\s+\w+$/i, "").trim();
    const brace = p.indexOf("{");
    if (brace >= 0) {
      const prefix = p.slice(0, brace).trim().replace(/::\s*$/, "");
      const inner = p.slice(brace + 1, p.lastIndexOf("}"));
      for (const part of inner.split(",")) {
        const seg = part.trim().split(/\s+as\s+/)[0]?.trim();
        if (!seg) continue;
        if (seg.startsWith("self")) continue;
        const full = seg.includes("::") ? seg : `${prefix}::${seg}`;
        if (full.startsWith("crate::")) out.push(full);
      }
    } else {
      if (p.startsWith("crate::")) out.push(p);
    }
  }
  return out;
}

function extractRustMods(raw: string): string[] {
  const out: string[] = [];
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (t.startsWith("//")) continue;
    const m = t.match(/^mod\s+(\w+)\s*;/);
    if (m) out.push(m[1]);
  }
  return out;
}

function resolveRustUsePath(
  usePath: string,
  crateDir: string,
  fileSet: Set<string>,
): string | null {
  if (!usePath.startsWith("crate::")) return null;
  const rest = usePath.slice("crate::".length);
  const parts = rest.split("::").filter(Boolean);
  if (parts.length === 0) return null;
  const srcBase = crateDir ? `${crateDir}/src` : "src";
  for (let n = parts.length; n >= 1; n--) {
    const sub = parts.slice(0, n).join("/");
    const cands = [
      `${srcBase}/${sub}.rs`,
      `${srcBase}/${sub}/mod.rs`,
    ];
    for (const c of cands) {
      const nn = norm(c);
      if (fileSet.has(nn)) return nn;
    }
  }
  return null;
}

function resolveRustMod(
  fromRel: string,
  modName: string,
  crateDir: string,
  fileSet: Set<string>,
): string | null {
  const fromDir = path.posix.dirname(fromRel);
  const srcBase = crateDir ? `${crateDir}/src` : "src";
  const tries = [
    path.posix.join(fromDir, modName + ".rs"),
    path.posix.join(fromDir, modName, "mod.rs"),
    path.posix.join(srcBase, modName + ".rs"),
    path.posix.join(srcBase, modName, "mod.rs"),
  ];
  for (const t of tries) {
    const n = norm(t);
    if (fileSet.has(n)) return n;
  }
  return null;
}

function resolveJavaImport(
  imp: string,
  javaIndex: Map<string, string>,
): string | null {
  if (imp.endsWith(".*")) {
    const prefix = imp.slice(0, -2);
    const paths: string[] = [];
    for (const key of javaIndex.keys()) {
      if (key.startsWith(prefix + ".")) {
        const p = javaIndex.get(key);
        if (p) paths.push(p);
      }
    }
    return paths[0] ?? null;
  }
  return javaIndex.get(imp) ?? null;
}

function resolveCsharpUsing(
  usingNs: string,
  csIndex: Map<string, string>,
): string[] {
  const targets: string[] = [];
  const prefix = usingNs + ".";
  let n = 0;
  for (const [fq, p] of csIndex) {
    if (fq === usingNs || fq.startsWith(prefix)) {
      targets.push(p);
      n++;
      if (n >= MAX_NAMESPACE_TARGETS) break;
    }
  }
  return targets;
}

/**
 * Import / module graph from tracked source files (JVM, C#, Swift, JS/TS, Python, Go, Rust).
 */
export async function buildCodeGraph(
  repoRoot: string,
  ignoredPaths: Set<string>,
): Promise<CodeGraphV1 | null> {
  const tracked = await gitSourceFiles(repoRoot, SOURCE_EXTS);
  const paths = tracked.map(norm).filter((p) => !ignoredPaths.has(p));
  const fileSet = new Set(paths);

  const javaPaths = paths.filter((p) => p.endsWith(".java"));
  const ktPaths = paths.filter((p) => p.endsWith(".kt"));
  const csPaths = paths.filter((p) => p.endsWith(".cs"));
  const swiftPaths = paths.filter((p) => p.endsWith(".swift"));
  const jsLikePaths = paths.filter((p) =>
    /\.(tsx?|jsx?|mjs|cjs)$/i.test(p),
  );
  const pyPaths = paths.filter((p) => p.endsWith(".py"));
  const goPaths = paths.filter((p) => p.endsWith(".go"));
  const rsPaths = paths.filter((p) => p.endsWith(".rs"));

  if (paths.length === 0) {
    return null;
  }

  const jvmIndex = await buildJavaIndex(repoRoot, [...javaPaths, ...ktPaths]);
  const csIndex = await buildCsharpIndex(repoRoot, csPaths);
  const goModulePrefix = await readGoModulePrefix(repoRoot);

  const nodeMap = new Map<string, CodeGraphV1["nodes"][0]>();
  function addFileNode(rel: string, lang: CodeGraphV1["nodes"][0]["language"]) {
    const id = `file:${rel}`;
    if (!nodeMap.has(id)) {
      nodeMap.set(id, {
        id,
        path: rel,
        label: rel.split("/").pop() ?? rel,
        language: lang,
      });
    }
  }

  for (const rel of paths) {
    addFileNode(rel, langFromPath(rel));
  }

  const edgeKey = new Set<string>();
  const edges: CodeGraphV1["edges"] = [];

  function addEdge(
    fromRel: string,
    toId: string,
    kind: CodeGraphV1["edges"][0]["kind"],
  ) {
    if (edges.length >= MAX_EDGES) return;
    const from = `file:${norm(fromRel)}`;
    const k = `${from}|${toId}|${kind}`;
    if (edgeKey.has(k)) return;
    edgeKey.add(k);
    edges.push({ from, to: toId, kind });
  }

  for (const rel of [...javaPaths, ...ktPaths]) {
    if (ignoredPaths.has(rel)) continue;
    const raw = await readHead(path.join(repoRoot, rel));
    for (const imp of javaImportLines(raw)) {
      const resolved = resolveJavaImport(imp, jvmIndex);
      if (resolved && resolved !== rel) {
        addEdge(rel, `file:${norm(resolved)}`, "import");
      }
    }
  }

  for (const rel of csPaths) {
    if (ignoredPaths.has(rel)) continue;
    const raw = await readHead(path.join(repoRoot, rel));
    for (const u of csharpUsingLines(raw)) {
      for (const target of resolveCsharpUsing(u, csIndex)) {
        if (target !== rel) addEdge(rel, `file:${norm(target)}`, "using");
      }
    }
  }

  for (const rel of swiftPaths) {
    if (ignoredPaths.has(rel)) continue;
    const raw = await readHead(path.join(repoRoot, rel));
    for (const mod of swiftImportLines(raw)) {
      if (mod === "Foundation" || mod === "Swift" || mod === "SwiftUI") {
        continue;
      }
      const mid = `mod:swift:${mod}`;
      if (!nodeMap.has(mid)) {
        nodeMap.set(mid, {
          id: mid,
          path: mod,
          label: mod,
          language: "module",
        });
      }
      addEdge(rel, mid, "swift-module");
    }
  }

  for (const rel of jsLikePaths) {
    if (ignoredPaths.has(rel)) continue;
    const raw = await readHead(path.join(repoRoot, rel));
    for (const spec of extractJsImports(raw)) {
      const resolved = resolveJsLike(rel, spec, fileSet);
      if (resolved && resolved !== rel) {
        addEdge(rel, `file:${norm(resolved)}`, "relative");
      }
    }
  }

  for (const rel of pyPaths) {
    if (ignoredPaths.has(rel)) continue;
    const raw = await readHead(path.join(repoRoot, rel));
    for (const mod of extractPythonImports(raw)) {
      const resolved = resolvePythonModule(mod, fileSet);
      if (resolved && resolved !== rel) {
        addEdge(rel, `file:${norm(resolved)}`, "python");
      }
    }
  }

  for (const rel of goPaths) {
    if (ignoredPaths.has(rel)) continue;
    const raw = await readHead(path.join(repoRoot, rel));
    for (const imp of extractGoImports(raw)) {
      const resolved = resolveGoImport(imp, fileSet, goModulePrefix);
      if (resolved && resolved !== rel) {
        addEdge(rel, `file:${norm(resolved)}`, "go");
      }
    }
  }

  const rustCargoCache = new Map<string, string | null>();
  async function cargoDirFor(rel: string): Promise<string | null> {
    if (rustCargoCache.has(rel)) return rustCargoCache.get(rel) ?? null;
    const d = await findCargoDir(repoRoot, rel);
    rustCargoCache.set(rel, d);
    return d;
  }

  for (const rel of rsPaths) {
    if (ignoredPaths.has(rel)) continue;
    if (edges.length >= MAX_EDGES) break;
    const raw = await readHead(path.join(repoRoot, rel));
    const crateDir = await cargoDirFor(rel);
    if (crateDir === null) continue;

    for (const usePath of extractRustCrateUses(raw)) {
      const resolved = resolveRustUsePath(usePath, crateDir, fileSet);
      if (resolved && resolved !== rel) {
        addEdge(rel, `file:${norm(resolved)}`, "rust");
      }
    }
    for (const modName of extractRustMods(raw)) {
      const resolved = resolveRustMod(rel, modName, crateDir, fileSet);
      if (resolved && resolved !== rel) {
        addEdge(rel, `file:${norm(resolved)}`, "rust");
      }
    }
  }

  const nodes = [...nodeMap.values()];
  const inDeg = new Map<string, number>();
  const outDeg = new Map<string, number>();
  for (const n of nodes) {
    inDeg.set(n.id, 0);
    outDeg.set(n.id, 0);
  }
  for (const e of edges) {
    inDeg.set(e.to, (inDeg.get(e.to) ?? 0) + 1);
    outDeg.set(e.from, (outDeg.get(e.from) ?? 0) + 1);
  }

  const fileNodes = nodes.filter((n) => n.id.startsWith("file:"));
  const rootsHint = fileNodes
    .filter((n) => (inDeg.get(n.id) ?? 0) === 0)
    .map((n) => n.id)
    .slice(0, 80);
  const leavesHint = fileNodes
    .filter((n) => (outDeg.get(n.id) ?? 0) === 0)
    .map((n) => n.id)
    .slice(0, 80);

  return {
    v: 1,
    generatedAt: new Date().toISOString(),
    nodeCount: nodes.length,
    edgeCount: edges.length,
    nodes,
    edges,
    rootsHint,
    leavesHint,
  };
}
