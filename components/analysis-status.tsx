type RunStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";

const labels: Record<RunStatus, string> = {
  PENDING: "Pending",
  RUNNING: "Running",
  COMPLETED: "Completed",
  FAILED: "Failed",
};

export function AnalysisStatusBadge({ status }: { status: RunStatus }) {
  const color =
    status === "COMPLETED"
      ? "bg-emerald-100 text-emerald-800"
      : status === "FAILED"
        ? "bg-red-100 text-red-800"
        : status === "RUNNING"
          ? "bg-amber-100 text-amber-900"
          : "bg-zinc-100 text-zinc-700";

  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${color}`}
    >
      {labels[status]}
    </span>
  );
}
