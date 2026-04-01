"use client";

import Link from "next/link";
import { useTransition } from "react";
import { dismissOnboarding } from "@/app/actions/user-settings";

export function OnboardingBanner() {
  const [pending, startTransition] = useTransition();

  return (
    <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-4 text-base text-sky-950">
      <h2 className="text-lg font-semibold text-sky-950">Get started</h2>
      <ol className="mt-3 list-decimal space-y-2 pl-5 text-sky-900/90">
        <li>
          <Link
            href="/dashboard/settings"
            className="font-medium text-sky-950 underline-offset-2 hover:underline"
          >
            Connect a repository
          </Link>{" "}
          in Settings (uses your GitHub access).
        </li>
        <li>
          On the Dashboard, run <strong className="font-medium">Run analysis</strong>{" "}
          on that repo. We clone it, scan git history, and run static tools.
        </li>
        <li>
          Open{" "}
          <Link
            href="/dashboard/files"
            className="font-medium text-sky-950 underline-offset-2 hover:underline"
          >
            Files
          </Link>{" "}
          for per-path scores and findings,{" "}
          <Link
            href="/dashboard/graph"
            className="font-medium text-sky-950 underline-offset-2 hover:underline"
          >
            Code graph
          </Link>{" "}
          for import structure, and optionally set{" "}
          <Link
            href="/dashboard/settings"
            className="font-medium text-sky-950 underline-offset-2 hover:underline"
          >
            path ignore patterns
          </Link>{" "}
          before the next run.
        </li>
      </ol>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          startTransition(() => {
            void dismissOnboarding();
          });
        }}
        className="mt-4 rounded-md bg-sky-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-800 disabled:opacity-60"
      >
        {pending ? "Saving…" : "Got it, hide this"}
      </button>
    </div>
  );
}
