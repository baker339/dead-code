/**
 * Optional webhook when a run reports one or more **critical** dependency advisories.
 * Set `CRITICAL_VULN_WEBHOOK_URL` to an HTTPS endpoint (e.g. Slack incoming webhook).
 */
export async function notifyCriticalVulns(params: {
  repoUserId: string;
  analysisRunId: string;
  repoFullName: string;
  criticalCount: number;
}): Promise<void> {
  const url = process.env.CRITICAL_VULN_WEBHOOK_URL;
  if (!url?.startsWith("https://")) return;

  const body = JSON.stringify({
    event: "repo.analysis.critical_vulnerabilities",
    ...params,
    at: new Date().toISOString(),
  });

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 10_000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: ac.signal,
    });
    if (!res.ok) {
      console.warn(
        "[notify-critical-vulns] webhook returned",
        res.status,
        await res.text().catch(() => ""),
      );
    }
  } catch (e) {
    console.warn("[notify-critical-vulns]", e);
  } finally {
    clearTimeout(t);
  }
}
