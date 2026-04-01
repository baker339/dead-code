import picomatch from "picomatch";

export function parsePathIgnoreGlobs(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    .map((s) => s.trim());
}

export function pathMatchesUserIgnore(normPath: string, globs: string[]): boolean {
  if (globs.length === 0) return false;
  const path = normPath.replace(/\\/g, "/");
  for (const g of globs) {
    try {
      const match = picomatch(g, { dot: true });
      if (match(path)) return true;
    } catch {
      if (path.includes(g)) return true;
    }
  }
  return false;
}
