"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FilePlus2, FileText, FileUser, Hourglass, Loader2, Sparkles, SquarePen, TriangleAlert } from "lucide-react";
import { useJobs } from "@/components/jobs/job-store";
import { DocCard, iconPrimary, iconSecondary } from "@/components/ui/doc-card";
import { Tip } from "@/components/ui/tip";
import { PdfViewer } from "@/components/pipeline/pdf-viewer";
import { pdfButtonState, pdfJobRefreshesReport, type PdfFailure } from "@/lib/pdf-button-state.mjs";
import { pipelineQuery } from "@/lib/pipeline-navigation.mjs";

// Fires the real career-ops `pdf` mode (worker kind "pdf") to generate an
// ATS-optimized CV tailored to THIS offer → output/cv-… + marks the tracker.
export function GeneratePdfButton({ n, company, onDisk }: { n: string; company: string; onDisk: boolean }) {
  const { jobs, startJob } = useJobs();
  const router = useRouter();
  const listQuery = pipelineQuery(useSearchParams().toString());
  useEffect(() => {
    const onDone = (event: Event) => {
      const detail = event instanceof CustomEvent ? event.detail : null;
      if (pdfJobRefreshesReport(detail, n)) router.refresh();
    };
    window.addEventListener("co-job-done", onDone);
    return () => window.removeEventListener("co-job-done", onDone);
  }, [n, router]);
  const jobQuery = listQuery ? `?${listQuery}` : "";
  const studioHref = `/pipeline/${encodeURIComponent(n)}/cv-studio${jobQuery}`;
  const viewHref = `/api/cv-pdf?n=${encodeURIComponent(n)}&company=${encodeURIComponent(company)}`;
  const job = useMemo(
    () => jobs.filter((j) => j.kind === "pdf" && j.input === n).sort((a, b) => b.startedAt - a.startedAt)[0],
    [jobs, n],
  );
  const generate = () =>
    startJob({ title: `CV PDF · ${company}`, subtitle: "tailored for this role", kind: "pdf", input: n, page: `/pipeline/${n}` });

  const state = pdfButtonState(job, onDisk);
  const [confirming, setConfirming] = useState(false);
  const [viewing, setViewing] = useState(false);

  const icon = <FileUser className="size-5" />;
  if (state.kind === "running")
    return (
      <DocCard icon={<Loader2 className="size-5 animate-spin" />} title="CV" status="Miao is writing it…" tone="busy">
        <Tip label="See progress" align="end">
          <Link href={`/jobs/${state.jobId}${jobQuery}`} aria-label="See progress" className={iconSecondary}><Hourglass className="size-4" /></Link>
        </Tip>
      </DocCard>
    );

  if (state.kind === "ready")
    return (
      <DocCard
        icon={icon}
        title="CV"
        status="Ready"
        tone="ready"
        footer={
          <>
            {confirming && (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm">
                <span className="text-foreground">Miao rewrites the CV from scratch. Your edits will be lost.</span>
                <button onClick={() => { setConfirming(false); generate(); }} className="ml-auto rounded-lg bg-foreground px-3 py-1 text-xs font-medium text-background">Rewrite</button>
                <button onClick={() => setConfirming(false)} className="rounded-lg px-2 py-1 text-xs text-muted hover:text-foreground">Cancel</button>
              </div>
            )}
            <FailureNote failure={state.failure} jobQuery={jobQuery} />
          </>
        }
      >
        <Tip label="Open CV">
          <button onClick={() => setViewing(true)} aria-label="Open CV" className={iconPrimary}><FileText className="size-4" /></button>
        </Tip>
        <PdfViewer src={viewHref} title={`CV · ${company}`} open={viewing} onClose={() => setViewing(false)} />
        <Tip label="Edit CV">
          <Link href={studioHref} aria-label="Edit CV" className={iconSecondary}><SquarePen className="size-4" /></Link>
        </Tip>
        <Tip label="Rewrite it with Miao" align="end">
          <button onClick={() => setConfirming(true)} aria-label="New version" className={iconSecondary}><Sparkles className="size-4" /></button>
        </Tip>
      </DocCard>
    );

  return (
    <DocCard icon={icon} title="CV" status="Not created yet" footer={<FailureNote failure={state.failure} jobQuery={jobQuery} />}>
      <Tip label="Create CV for this job" align="end">
        <button onClick={generate} aria-label="Create CV" className={iconPrimary}><FilePlus2 className="size-4" /></button>
      </Tip>
    </DocCard>
  );
}

function FailureNote({ failure, jobQuery }: { failure: PdfFailure; jobQuery: string }) {
  if (!failure) return null;
  return (
    <Link
      href={`/jobs/${failure.jobId}${jobQuery}`}
      role="alert"
      title="Open the run log"
      className="inline-flex max-w-md items-start gap-1 text-xs text-red-700 hover:underline dark:text-red-400"
    >
      <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
      <span>CV not generated. {failure.reason}</span>
    </Link>
  );
}
