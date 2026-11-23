"use client";

// Fork: starts an evaluation for a shared job link, once, then shows its progress.
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Loader2, TriangleAlert } from "lucide-react";
import { useJobs } from "@/components/jobs/job-store";
import { useEvaluationOptions } from "@/components/evaluation-options";
import { Miao } from "@/components/miao";

const STARTED_KEY = "miao:share-started";

function siteOf(u: string): string {
  try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; }
}

export function ShareEvaluate({ url }: { url: string }) {
  const { jobs, startJob } = useJobs();
  const { sections } = useEvaluationOptions();
  const router = useRouter();
  const [startedUrl, setStartedUrl] = useState("");
  const [closing, setClosing] = useState(false);
  const once = useRef(false);

  useEffect(() => {
    if (once.current) return;
    once.current = true;
    // Already started this exact link in this tab (e.g. the page was refreshed): don't run it twice.
    let previous = "";
    try { previous = sessionStorage.getItem(STARTED_KEY) ?? ""; } catch { /* storage blocked */ }
    if (url && previous !== url) {
      try { sessionStorage.setItem(STARTED_KEY, url); } catch { /* storage blocked */ }
      // Start after the job store has restored its saved list (its effect runs after this child's),
      // otherwise the restore would replace the list and drop the new run.
      setTimeout(() => {
        startJob({ title: "Evaluate · shared link", subtitle: url, kind: "evaluate", input: url, page: "/share", evaluationSections: sections });
      }, 50);
    }
    setStartedUrl(url || previous);
    // Drop the link from the address bar so a refresh cannot resubmit it.
    if (url) router.replace("/share");
    // Fork: runs now continue on the server, so when the installed app was opened from the
    // share sheet (Android), close it after a moment and land back in LinkedIn. Browsers that
    // refuse window.close() just keep the page, which tells the user they can go back.
    if (url && previous !== url && window.matchMedia("(display-mode: standalone)").matches) {
      setTimeout(() => setClosing(true), 1500);
      setTimeout(() => window.close(), 2500);
    }
  }, [url, sections, startJob, router]);

  const job = useMemo(
    () => jobs.filter((j) => j.kind === "evaluate" && j.input === startedUrl).sort((a, b) => b.startedAt - a.startedAt)[0],
    [jobs, startedUrl],
  );
  const running = job?.status === "running";
  const done = job?.status === "done";
  const failed = job?.status === "error";

  return (
    <div className="flex min-h-[80vh] flex-col items-center justify-center px-6 text-center">
      <Miao scale={5} busy={running} />
      {!startedUrl ? (
        <>
          <h1 className="mt-8 text-2xl font-semibold tracking-tight">No job link found</h1>
          <p className="mt-2 max-w-sm text-sm text-muted">Share a job posting from LinkedIn (or paste its link on the Home page).</p>
          <Link href="/" className="mt-6 text-sm text-brand-text hover:underline">Go to Home</Link>
        </>
      ) : (
        <>
          <h1 className="mt-8 text-2xl font-semibold tracking-tight">
            {done ? "Job evaluated" : failed ? "Evaluation stopped" : "Evaluating job…"}
          </h1>
          <p className="mt-2 text-sm text-muted">{siteOf(startedUrl)}</p>
          <p className="mt-4 inline-flex items-center gap-1.5 text-xs text-faint">
            {done ? <><Check className="size-3.5 text-emerald-800 dark:text-emerald-400" /> Done{job?.result?.score ? ` · ${job.result.score}` : ""}</>
              : failed ? <><TriangleAlert className="size-3.5 text-amber-800 dark:text-amber-400" /> Something went wrong. Try sharing it again.</>
              : closing ? <><Check className="size-3.5 text-emerald-800 dark:text-emerald-400" /> Started. Going back…</>
              : <><Loader2 className="size-3.5 animate-spin" /> This takes a few minutes. You can go back to LinkedIn: Miao keeps working.</>}
          </p>
          {(done || failed) && (
            <Link href="/pipeline" className="mt-6 inline-flex h-9 items-center rounded-xl bg-brand px-4 text-sm font-medium text-brand-foreground hover:bg-brand-200">
              Open Pipeline
            </Link>
          )}
        </>
      )}
    </div>
  );
}
