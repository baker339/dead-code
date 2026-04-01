"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Refetches the current route on an interval while analysis is in flight,
 * so the UI updates when Inngest completes (no WebSockets required).
 */
export function AnalysisRunsPoller({
  active,
  intervalMs = 3000,
}: {
  active: boolean;
  intervalMs?: number;
}) {
  const router = useRouter();

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      router.refresh();
    }, intervalMs);
    return () => clearInterval(id);
  }, [active, intervalMs, router]);

  return null;
}
