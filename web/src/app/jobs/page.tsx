"use client";

import Link from "next/link";
import { Check, AlertTriangle, Loader2, Trash2, CirclePause } from "lucide-react";
import { useJobs, type Job } from "@/components/jobs/job-store";
import { Miao } from "@/components/miao";
import { evaluationGateForJob, jobStateLabel } from "@/lib/job-gate.mjs";
import { pillTone } from "@/components/jobs/worker-pills";
import { cn } from "@/lib/cn";

const TONE_CHIP = {
  good: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-400",
  warn: "bg-amber-500/15 text-amber-800 dark:text-amber-400",
  bad: "bg-red-500/15 text-red-700 dark:text-red-400",
  muted: "bg-surface-hover text-muted",
} as const;

function ago(ts: number): string {
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(ts).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function Row({ j }: { j: Job }) {
  const tone = pillTone(j);
  const gate = evaluationGateForJob(j);
  return (
    <li>
      <Link href={`/jobs/${j.id}`} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-hover">
        {j.status === "running" ? (
          <Loader2 className="size-4 shrink-0 animate-spin text-brand-text" />
        ) : gate || j.status === "gated" ? (
          <CirclePause className="size-4 shrink-0 text-amber-500" />
        ) : j.status === "error" ? (
          <AlertTriangle className="size-4 shrink-0 text-red-500" />
        ) : (
          <Check className="size-4 shrink-0 text-emerald-500" />
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-foreground">{j.title}</div>
          <div className="truncate text-xs text-muted">
            {j.status === "error" ? "Didn't finish" : gate || j.status === "gated" ? "Needs your review" : j.result?.summary || j.subtitle || jobStateLabel(j)}
          </div>
        </div>
        {j.status === "done" && j.result?.score != null && (
          <span className={cn("shrink-0 rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums", TONE_CHIP[tone])}>{j.result.score}/5</span>
        )}
        <span className="hidden w-20 shrink-0 text-right text-xs text-faint sm:block">{ago(j.startedAt)}</span>
      </Link>
    </li>
  );
}

export default function JobsHistory() {
  const { jobs, clearFinished } = useJobs();
  const running = jobs.filter((j) => j.status === "running");
  const earlier = jobs.filter((j) => j.status !== "running").sort((a, b) => b.startedAt - a.startedAt);

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <section className="flex flex-col items-center gap-5 rounded-2xl border border-border bg-surface px-6 py-7 text-center sm:flex-row sm:text-left">
        <div className="shrink-0"><Miao scale={3} busy={running.length > 0} /></div>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-2xl tracking-tight text-landing">Run history</h1>
          <p className="mt-1 text-sm text-muted">
            {running.length > 0
              ? `Miao is working on ${running.length === 1 ? "1 thing" : `${running.length} things`} right now.`
              : jobs.length > 0
                ? "Everything Miao did for you lately. Click one to see how it went."
                : "Nothing yet. When you ask Miao to check a job or write a CV, it shows up here."}
          </p>
        </div>
        {earlier.length > 0 && (
          <button
            onClick={clearFinished}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-xs text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
          >
            <Trash2 className="size-3.5" /> Clear finished
          </button>
        )}
      </section>

      {running.length > 0 && (
        <>
          <h2 className="mt-7 px-1 text-xs font-semibold uppercase tracking-[0.15em] text-faint">Running now</h2>
          <ul className="mt-2 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
            {running.map((j) => <Row key={j.id} j={j} />)}
          </ul>
        </>
      )}

      {earlier.length > 0 && (
        <>
          <h2 className="mt-7 px-1 text-xs font-semibold uppercase tracking-[0.15em] text-faint">Earlier</h2>
          <ul className="mt-2 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
            {earlier.map((j) => <Row key={j.id} j={j} />)}
          </ul>
        </>
      )}
    </div>
  );
}
