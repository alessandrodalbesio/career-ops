"use client";

// Fork: the latest brand briefing text for a report. A briefing this browser just
// ran wins; otherwise the one saved on the server (run on any device).
import { useEffect, useMemo, useState } from "react";
import { useJobs, type Job } from "@/components/jobs/job-store";
import { jobOutputForDisplay } from "@/lib/job-gate.mjs";

export function useBrandBrief(n: string): { job: Job | undefined; text: string } {
  const { jobs } = useJobs();
  const job = useMemo(
    () => jobs.filter((j) => j.kind === "brand-brief" && j.input === n).sort((a, b) => b.startedAt - a.startedAt)[0],
    [jobs, n],
  );
  const [saved, setSaved] = useState<{ text: string; savedAt: number } | null>(null);
  useEffect(() => {
    let live = true;
    fetch(`/api/brand-brief?n=${encodeURIComponent(n)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => live && setSaved(b && typeof b.text === "string" ? b : null))
      .catch(() => {});
    return () => { live = false; };
  }, [n, job?.status]);
  const local = job?.status === "done" ? jobOutputForDisplay(job) : "";
  const localNewer = local && (!saved || (job?.endedAt ?? job?.startedAt ?? 0) >= saved.savedAt);
  return { job, text: localNewer ? local : saved?.text ?? "" };
}
