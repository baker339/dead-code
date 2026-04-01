export function MetricsExplainer() {
  return (
    <details className="group rounded-lg border border-zinc-200 bg-zinc-50/80 px-4 py-3 text-base text-zinc-700">
      <summary className="cursor-pointer list-none font-medium text-zinc-900 [&::-webkit-details-marker]:hidden">
        <span className="text-zinc-500 group-open:hidden">▸ </span>
        <span className="hidden text-zinc-500 group-open:inline">▾ </span>
        How should I read these numbers?
      </summary>
      <div className="mt-3 space-y-3 border-t border-zinc-200 pt-3 text-sm leading-relaxed text-zinc-600">
        <p>
          <strong className="text-zinc-800">Debt score (0–100)</strong> is a{" "}
          <em>maintenance-risk heuristic</em>, not proof that code is unused. It
          blends how long a file has been idle, how much line churn it saw in
          the sampled git window, and static signals (unused exports/files,
          redundant deps, advisories, etc.).
        </p>
        <p>
          <strong className="text-zinc-800">Static findings</strong> come from
          analyzers (e.g. Knip on JS/TS). They are closer to “actionable”
          candidates but still need human review—especially in dynamic or
          meta-programmed codebases.
        </p>
        <p>
          <strong className="text-zinc-800">Git metrics</strong> use a shallow
          clone and a bounded history window; very old commits outside that
          window won’t appear in churn stats.
        </p>
        <p>
          <strong className="text-zinc-800">Contributor share</strong> uses full
          non-merge history to flag bus-factor risk (few authors owning most
          commits).
        </p>
      </div>
    </details>
  );
}
