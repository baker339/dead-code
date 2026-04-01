"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updatePathIgnoreGlobs } from "@/app/actions/user-settings";
import type { ActionResult } from "@/app/actions/repositories";

type Props = {
  initialGlobs: string[];
};

export function AnalysisSettings({ initialGlobs }: Props) {
  const router = useRouter();
  const [value, setValue] = useState(() => initialGlobs.join("\n"));
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const dirty = useMemo(
    () => value !== initialGlobs.join("\n"),
    [value, initialGlobs],
  );

  function handleResult(r: ActionResult) {
    if (r.ok) {
      setMessage("Saved. Next analysis will apply these patterns.");
      router.refresh();
    } else setMessage(r.error);
  }

  return (
    <section className="max-w-3xl space-y-10">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900">
          Analysis path ignores
        </h2>
        <p className="mt-2 text-base text-zinc-600">
          Glob patterns (one per line) excluded from file metrics and static
          findings on the <strong className="text-zinc-800">next</strong> run.
          Uses <code className="rounded bg-zinc-100 px-1 text-sm">picomatch</code>{" "}
          syntax — e.g.{" "}
          <code className="rounded bg-zinc-100 px-1 text-sm">
            **/generated/**
          </code>
          ,{" "}
          <code className="rounded bg-zinc-100 px-1 text-sm">
            packages/legacy/**/*.ts
          </code>
          .
        </p>
        <form
          className="mt-4 space-y-3"
          action={(fd) =>
            startTransition(() => updatePathIgnoreGlobs(fd).then(handleResult))
          }
        >
          <textarea
            name="globs"
            rows={6}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-sm text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
            placeholder={"**/dist/**\n**/generated/**"}
          />
          <button
            type="submit"
            disabled={pending || !dirty}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save patterns"}
          </button>
        </form>
        {message && (
          <p className="mt-2 text-sm text-zinc-600" role="status">
            {message}
          </p>
        )}
      </div>
    </section>
  );
}
