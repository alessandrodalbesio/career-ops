"use client";

// Fork: a calm run page. Miao plays while the run works; the page shows one
// line about what is happening, then the result. If the run failed, only the
// error is shown up front. Every step and the full output stay behind
// "Show details".
import { use } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { noMarkdownImages } from "@/lib/markdown-options.mjs";
import { ArrowLeft, Check, ChevronRight, CirclePause, Loader2, TriangleAlert } from "lucide-react";
import { evaluationGateForJob, isLegacyMissingReportMessage, jobOutputForDisplay } from "@/lib/job-gate.mjs";
import { notFound } from "next/navigation";
import { useJobs, type Job } from "@/components/jobs/job-store";
import { missingWorker } from "@/lib/job-route.mjs";
import JobLoading from "./loading";
import { BackLink } from "@/components/back-link";
import { Badge } from "@/components/ui/badge";
import { CoverAnswers } from "@/components/jobs/cover-answers";
import { Miao } from "@/components/miao";
import { cn } from "@/lib/cn";

// "Using Read" → "Reading files", etc. Unknown tools keep their name.
const TOOL_WORDS: Record<string, string> = {
  Read: "Reading files",
  Glob: "Looking through files",
  Grep: "Searching files",
  Write: "Writing a file",
  Edit: "Editing a file",
  MultiEdit: "Editing a file",
  Bash: "Running a command",
  WebFetch: "Reading a web page",
  WebSearch: "Searching the web",
  TodoWrite: "Planning the next steps",
};
const stepText = (s: Job["steps"][number]) => (s.kind === "tool" ? TOOL_WORDS[s.label] ?? `Using ${s.label}` : s.label);

function duration(job: Job): string | null {
  const end = job.endedAt ?? (job.status === "running" ? Date.now() : undefined);
  if (!end) return null;
  const s = Math.max(1, Math.round((end - job.startedAt) / 1000));
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60 ? `${s % 60} s` : ""}`.trim();
}

export default function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { jobs, ready } = useJobs();
  const job = jobs.find((j) => j.id === id);

  if (!ready) return <JobLoading />;
  if (missingWorker({ ready, ids: jobs.map((j) => j.id), id })) notFound();
  if (!job) notFound();

  const gate = evaluationGateForJob(job);
  const displayOutput = jobOutputForDisplay(job);
  const running = job.status === "running";
  const failed = job.status === "error" && !gate;
  const lastStep = job.steps.at(-1);
  const lastStatus = [...job.steps].reverse().find((s) => s.kind === "status");
  const errorText = failed ? lastStatus?.label ?? "Something went wrong." : null;
  const took = duration(job);

  const state = running
    ? { icon: <Loader2 className="size-3.5 animate-spin" />, label: "Working", cls: "bg-brand-soft text-brand-text" }
    : gate || job.status === "gated"
      ? { icon: <CirclePause className="size-3.5" />, label: "Needs your review", cls: "bg-amber-500/15 text-amber-800 dark:text-amber-400" }
      : job.status === "done"
        ? { icon: <Check className="size-3.5" />, label: "Done", cls: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-400" }
        : { icon: <TriangleAlert className="size-3.5" />, label: "Didn't finish", cls: "bg-red-500/10 text-red-700 dark:text-red-400" };

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <BackLink href="/jobs" className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-brand-text">
        <ArrowLeft className="size-4" /> Run history
      </BackLink>

      <section className="mt-5 flex flex-col items-center gap-5 rounded-2xl border border-border bg-surface px-6 py-8 text-center sm:flex-row sm:items-center sm:text-left">
        <div className="shrink-0">
          <Miao scale={4} busy={running} />
        </div>
        <div className="min-w-0 flex-1">
          <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium", state.cls)}>
            {state.icon} {state.label}
          </span>
          <h1 className="mt-2 font-display text-2xl tracking-tight text-landing">{job.title}</h1>
          {job.subtitle && <p className="mt-0.5 text-sm text-muted">{job.subtitle}</p>}
          {running && (
            <p className="mt-3 text-sm text-muted">
              {lastStep ? `${stepText(lastStep)}…` : "Getting started…"}
              {took && <span className="text-faint"> · {took}</span>}
            </p>
          )}
          {!running && took && <p className="mt-3 text-xs text-faint">Took {took}</p>}
        </div>
      </section>

      {job.status === "done" && job.result && (job.result.score != null || job.result.summary) && (
        <section className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface px-6 py-4">
          {job.result.score != null && <Badge tone={job.result.tone}>{job.result.score}/5</Badge>}
          {job.result.summary && <span className="text-sm text-foreground">{job.result.summary}</span>}
          {job.page && (
            <Link href={job.page} className="ml-auto inline-flex items-center gap-1 text-sm font-medium text-brand-text hover:underline">
              Open <ChevronRight className="size-4" />
            </Link>
          )}
        </section>
      )}

      {errorText && (
        <section aria-label="What went wrong" className="mt-4 rounded-2xl border border-red-300/60 bg-red-50 px-6 py-4 dark:border-red-500/30 dark:bg-red-500/10">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-red-800 dark:text-red-300">
            <TriangleAlert className="size-4" /> What went wrong
          </h2>
          <p className="mt-1.5 break-words text-sm text-red-900/90 dark:text-red-200">
            {gate?.legacy && isLegacyMissingReportMessage(errorText) ? "The run returned no report." : errorText}
          </p>
          <p className="mt-2 text-xs text-red-900/70 dark:text-red-300/80">You can start it again from where you launched it. The details below show the last steps.</p>
        </section>
      )}

      {gate && (
        <section aria-label="Evaluation needs review" className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/5 px-6 py-4">
          <h2 className="text-sm font-semibold text-foreground">{gate.confirmationRequired ? "Review your conditions before continuing" : "Stopped by your conditions"}</h2>
          <p className="mt-1.5 text-sm text-muted">{gate.message}</p>
          <p className="mt-1.5 text-sm text-muted">
            {gate.legacy ? "This earlier run recorded a stop; its details are kept below." : "No score or report was created. Your conditions were kept."}
          </p>
          <button type="button" onClick={() => window.dispatchEvent(new CustomEvent("co-assistant"))} className="mt-3 rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-hover">
            Ask Miao about it
          </button>
        </section>
      )}

      {job.kind === "cover" && <CoverAnswers brief={job.brief} />}

      {(job.steps.length > 0 || job.text) && (
        <details className="group mt-6 rounded-2xl border border-border bg-surface" open={failed && job.steps.length <= 6 ? true : undefined}>
          <summary className="flex cursor-pointer list-none items-center gap-2 px-6 py-3 text-sm text-muted hover:text-foreground">
            <ChevronRight className="size-4 transition-transform group-open:rotate-90" />
            Show details
            <span className="text-faint">· {job.steps.length} steps{job.text ? " · full answer" : ""}</span>
          </summary>
          <div className="space-y-5 border-t border-border px-6 py-4">
            {job.steps.length > 0 && (
              <ol className="space-y-1.5">
                {job.steps.map((s, i) => (
                  <li key={i} className={cn("text-sm", s.kind === "tool" ? "text-muted" : "text-foreground", failed && i === job.steps.length - 1 && "text-red-700 dark:text-red-400")}>
                    {stepText(s)}
                  </li>
                ))}
              </ol>
            )}
            {job.text && (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-faint">Full answer</h3>
                <div className="report-prose mt-2">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} {...noMarkdownImages}>{displayOutput}</ReactMarkdown>
                </div>
                {displayOutput !== job.text && (
                  <details className="mt-3 text-sm text-muted">
                    <summary className="cursor-pointer">Raw output</summary>
                    <pre className="mt-2 whitespace-pre-wrap break-words rounded-lg border border-border p-3 text-xs">{job.text}</pre>
                  </details>
                )}
              </div>
            )}
          </div>
        </details>
      )}
    </div>
  );
}
