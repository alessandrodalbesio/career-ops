"use client";

// Fork: the whole Home is one job: paste a posting URL and evaluate it.
// Same worker as the old Quick Evaluate box (kind "evaluate"), with the saved
// evaluation options; progress shows in the sidebar worker pills.
import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowUp, Check, ChevronRight, Link2 } from "lucide-react";
import { CompanyLogo } from "@/components/company-logo";
import { Badge } from "@/components/ui/badge";
import { scoreTone } from "@/lib/format";
import { useJobs } from "@/components/jobs/job-store";
import { useEvaluationOptions } from "@/components/evaluation-options";
import { MiaoFace } from "@/components/miao";
import { cn } from "@/lib/cn";

type NextRole = { n: string; company: string; role: string; score: string; why: string | null };

export function SimpleHome({ next = [] }: { next?: NextRole[] }) {
  const { startJob } = useJobs();
  const { sections } = useEvaluationOptions();
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [started, setStarted] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const valid = /^https?:\/\/\S+$/i.test(url.trim());

  function run() {
    const u = url.trim();
    if (!/^https?:\/\//i.test(u)) {
      setError("Paste the full link to the job posting (starting with https://).");
      input.current?.focus();
      return;
    }
    startJob({ title: "Evaluate · pasted URL", subtitle: u, kind: "evaluate", input: u, page: "/", evaluationSections: sections });
    setUrl("");
    setError("");
    setStarted(true);
  }

  return (
    <div className={cn("flex flex-col items-center px-6", next.length ? "pb-16 pt-[14vh]" : "min-h-[80vh] justify-center")}>
      <MiaoFace height={34} />
      <h1 className="mt-6 text-center text-3xl font-semibold tracking-tight text-foreground">Evaluate a job</h1>
      <p className="mt-2 text-center text-sm text-muted">Paste the link to a job posting and Miao will tell you if it fits.</p>

      <form
        noValidate
        onSubmit={(e) => { e.preventDefault(); run(); }}
        className={cn(
          "mt-8 flex w-full max-w-xl items-center gap-2 rounded-2xl border bg-surface py-2 pl-4 pr-2 shadow-sm transition-colors",
          error ? "border-red-300" : "border-border focus-within:border-brand-text/40",
        )}
      >
        <Link2 aria-hidden="true" className="size-4 shrink-0 text-faint" />
        <input
          ref={input}
          autoFocus
          type="url"
          inputMode="url"
          aria-label="Job posting URL"
          value={url}
          onChange={(e) => { setUrl(e.target.value); setError(""); setStarted(false); }}
          placeholder="https://…"
          className="min-w-0 flex-1 bg-transparent py-1.5 text-sm outline-none placeholder:text-faint"
        />
        <button
          type="submit"
          aria-label="Evaluate"
          className={cn(
            "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-3.5 text-sm font-medium transition-all active:scale-95",
            valid ? "bg-brand text-brand-foreground hover:bg-brand-200" : "bg-surface-hover text-faint",
          )}
        >
          Evaluate <ArrowUp aria-hidden="true" className="size-4 rotate-45" />
        </button>
      </form>

      <p role="status" className="mt-3 h-5 text-center text-xs">
        {error ? (
          <span className="text-red-700 dark:text-red-400">{error}</span>
        ) : started ? (
          <span className="inline-flex items-center gap-1.5 text-muted">
            <Check aria-hidden="true" className="size-3.5 text-emerald-600" />
            Evaluation started. It will appear in your <Link href="/pipeline" className="text-brand-text underline-offset-2 hover:underline">Pipeline</Link> when ready.
          </span>
        ) : null}
      </p>

      {next.length > 0 && (
        <section aria-labelledby="keep-going" className="mt-10 w-full max-w-xl">
          <h2 id="keep-going" className="mb-3 text-center text-xs font-medium text-faint">Or keep going with these</h2>
          <ul className="space-y-2">
            {next.map((r) => (
              <li key={r.n}>
                <Link
                  href={`/pipeline/${encodeURIComponent(r.n)}`}
                  className="group flex items-center gap-3 rounded-xl border border-border bg-surface px-3.5 py-3 transition-all hover:-translate-y-px hover:border-brand-text/25 hover:shadow-sm"
                >
                  <CompanyLogo name={r.company} size={28} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      <span className="truncate text-sm font-medium text-foreground">{r.company}</span>
                      <span className="truncate text-xs text-muted">{r.role}</span>
                    </span>
                    {r.why && <span className="mt-0.5 block truncate text-xs text-faint">{r.why}</span>}
                  </span>
                  {r.score && <Badge tone={scoreTone(r.score)}>{r.score}</Badge>}
                  <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-faint transition-transform group-hover:translate-x-0.5" />
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-3 text-center">
            <Link href="/pipeline" className="text-xs text-brand-text underline-offset-2 hover:underline">See all in Pipeline</Link>
          </div>
        </section>
      )}
    </div>
  );
}
