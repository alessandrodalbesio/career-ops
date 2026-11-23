"use client";

// Fork: compact tailored-CV control for a Pipeline table row. Same job as the
// report page's GeneratePdfButton (worker kind "pdf"), sized for a table cell:
// "Generate" → spinner while it runs → PDF link (+ a small regenerate icon).

import { useEffect, useMemo, useState } from "react";
import { PdfViewer } from "@/components/pipeline/pdf-viewer";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileDown, FileText, Loader2, RotateCcw } from "lucide-react";
import { useJobs } from "@/components/jobs/job-store";
import { Tip } from "@/components/ui/tip";
import { pdfButtonState, pdfJobRefreshesReport } from "@/lib/pdf-button-state.mjs";

// Fork: what the cell offers depends on the status. Evaluated: generate / view / regenerate.
// Discarded: nothing. Any other status: view the PDF if there is one, nothing else.
export function CvCell({ n, company, hasCv, status }: { n: string; company: string; hasCv: boolean; status: string }) {
  const { jobs, startJob } = useJobs();
  const router = useRouter();
  const [viewing, setViewing] = useState(false);

  // Refresh the row (hasCv comes from the server) when this row's CV finishes.
  useEffect(() => {
    const onDone = (event: Event) => {
      const detail = event instanceof CustomEvent ? event.detail : null;
      if (pdfJobRefreshesReport(detail, n)) router.refresh();
    };
    window.addEventListener("co-job-done", onDone);
    return () => window.removeEventListener("co-job-done", onDone);
  }, [n, router]);

  const job = useMemo(
    () => jobs.filter((j) => j.kind === "pdf" && j.input === n).sort((a, b) => b.startedAt - a.startedAt)[0],
    [jobs, n],
  );
  const state = pdfButtonState(job, hasCv);
  const generate = () =>
    startJob({ title: `CV PDF · ${company}`, subtitle: "tailored for this role", kind: "pdf", input: n, page: `/pipeline/${n}` });

  const canGenerate = status === "Evaluated";
  const none = <span className="text-faint">—</span>;
  if (status === "Discarded") return none;

  if (state.kind === "running") {
    return (
      <Link href={`/jobs/${state.jobId}`} className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-text">
        <Loader2 aria-hidden="true" className="size-3.5 animate-spin" /> Generating…
      </Link>
    );
  }

  if (state.kind === "ready") {
    return (
      <span className="inline-flex items-center gap-1">
        <Tip label="View the tailored CV">
          <button
            type="button"
            onClick={() => setViewing(true)}
            className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs font-medium text-brand-text transition-colors hover:bg-brand-soft"
          >
            <FileText aria-hidden="true" className="size-3.5" /> PDF
          </button>
        </Tip>
        <PdfViewer
          src={`/api/cv-pdf?application=${encodeURIComponent(n)}`}
          title={`Tailored CV · ${company}`}
          open={viewing}
          onClose={() => setViewing(false)}
        />
        {canGenerate && (
          <Tip label="Regenerate (uses AI)" align="end">
            <button
              type="button"
              onClick={generate}
              aria-label={`Regenerate the tailored CV for ${company}`}
              className="inline-flex size-6 items-center justify-center rounded-md text-faint transition-colors hover:bg-surface-hover hover:text-foreground"
            >
              <RotateCcw aria-hidden="true" className="size-3" />
            </button>
          </Tip>
        )}
      </span>
    );
  }

  if (!canGenerate) return none;
  return (
    <Tip label="Generate a tailored CV (uses AI)" align="end">
      <button
        type="button"
        onClick={generate}
        aria-label={`Generate a tailored CV for ${company}`}
        className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted transition-all hover:-translate-y-px hover:border-brand-text/30 hover:text-foreground active:translate-y-0 active:scale-95"
      >
        <FileDown aria-hidden="true" className="size-3.5" /> Generate
      </button>
    </Tip>
  );
}
