"use client";

import { useMemo, useState, useTransition } from "react";
import {
  connectRepository,
  disconnectRepository,
  type ActionResult,
} from "@/app/actions/repositories";
import type { GithubRepoSummary } from "@/lib/github";

type ConnectedRepo = {
  id: string;
  fullName: string;
  defaultBranch: string;
};

export type PlanTier = "FREE" | "PRO" | "ENTERPRISE";

type Props = {
  connected: ConnectedRepo[];
  githubRepos: GithubRepoSummary[] | null;
  entitlements: {
    tier: PlanTier;
    max: number;
    count: number;
    canAddMore: boolean;
  };
};

export function RepositorySettings({
  connected,
  githubRepos,
  entitlements,
}: Props) {
  const [filter, setFilter] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const connectedIds = useMemo(
    () => new Set(connected.map((c) => c.fullName.toLowerCase())),
    [connected],
  );

  const filteredAvailable = useMemo(() => {
    if (!githubRepos) return [];
    const q = filter.trim().toLowerCase();
    return githubRepos.filter((r) => {
      if (connectedIds.has(r.fullName.toLowerCase())) return false;
      if (!q) return true;
      return r.fullName.toLowerCase().includes(q);
    });
  }, [githubRepos, connectedIds, filter]);

  function handleResult(r: ActionResult) {
    if (r.ok) setMessage(null);
    else setMessage(r.error);
  }

  return (
    <div className="max-w-3xl space-y-10">
      <section>
        <h2 className="text-lg font-semibold text-zinc-900">Your plan</h2>
        <p className="mt-2 text-base text-zinc-600">
          {entitlements.tier === "FREE" && (
            <>
              Free: <strong>1</strong> repository.{" "}
              <span className="text-zinc-500">
                (Pro and billing will unlock more.)
              </span>
            </>
          )}
          {entitlements.tier === "PRO" && (
            <>
              Pro: up to <strong>{entitlements.max}</strong> repositories (
              {entitlements.count} used).
            </>
          )}
          {entitlements.tier === "ENTERPRISE" && (
            <>
              Enterprise: up to <strong>{entitlements.max}</strong>{" "}
              repositories ({entitlements.count} used).
            </>
          )}
        </p>
      </section>

      {message && (
        <p
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-base text-red-800"
          role="alert"
        >
          {message}
        </p>
      )}

      <section>
        <h2 className="text-lg font-semibold text-zinc-900">
          Connected repositories
        </h2>
        {connected.length === 0 ? (
          <p className="mt-2 text-base text-zinc-600">
            None yet. Add one from the list below.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-zinc-200 rounded-lg border border-zinc-200">
            {connected.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-4 px-4 py-3 text-base"
              >
                <div>
                  <p className="font-medium text-zinc-900">{r.fullName}</p>
                  <p className="text-sm text-zinc-500">
                    default: {r.defaultBranch}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => {
                    setMessage(null);
                    startTransition(async () => {
                      handleResult(await disconnectRepository(r.id));
                    });
                  }}
                  className="shrink-0 rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold text-zinc-900">
          Add from GitHub
        </h2>
        {!githubRepos && (
          <p className="mt-2 text-base text-amber-800">
            Could not load repositories. Try signing out and signing in with
            GitHub again so we receive a valid token.
          </p>
        )}
        {githubRepos && (
          <>
            <p className="mt-2 text-base text-zinc-600">
              Repositories you can access (showing up to 200, most recently
              updated first).
            </p>
            <input
              type="search"
              placeholder="Filter by name…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="mt-3 w-full max-w-md rounded-md border border-zinc-300 px-3 py-2.5 text-base"
            />
            {!entitlements.canAddMore && (
              <p className="mt-3 text-base text-amber-800">
                You are at your repository limit. Remove a repo or upgrade to
                add another.
              </p>
            )}
            <ul className="mt-4 max-h-80 divide-y divide-zinc-200 overflow-y-auto rounded-lg border border-zinc-200">
              {filteredAvailable.length === 0 ? (
                <li className="px-4 py-6 text-center text-base text-zinc-500">
                  No matching repositories.
                </li>
              ) : (
                filteredAvailable.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center justify-between gap-4 px-4 py-2.5 text-base"
                  >
                    <span className="truncate text-zinc-800">{r.fullName}</span>
                    <button
                      type="button"
                      disabled={isPending || !entitlements.canAddMore}
                      onClick={() => {
                        setMessage(null);
                        startTransition(async () => {
                          handleResult(
                            await connectRepository(r.fullName),
                          );
                        });
                      }}
                      className="shrink-0 rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Connect
                    </button>
                  </li>
                ))
              )}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
