"use client";

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { startAnalysis } from "@/app/actions/analysis";

export function RunAnalysisButton({ repositoryId }: { repositoryId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setMessage(null);
          startTransition(async () => {
            const r = await startAnalysis(repositoryId);
            if (!r.ok) setMessage(r.error);
            else {
              setMessage(
                "Queued. This page auto-refreshes until the run finishes; then open Files for per-path metrics.",
              );
              router.refresh();
            }
          });
        }}
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
      >
        {pending ? "Starting…" : "Run analysis"}
      </button>
      {message && (
        <p className="max-w-md text-sm text-zinc-600" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
