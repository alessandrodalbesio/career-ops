"use client";

// Fork: Greta's brand briefing (2026-11-24). Starts a read-only "brand-brief" run
// that researches the company and returns a short briefing plus four questions for
// her cover letter. The briefing folds open right on the report page; the questions
// are asked by the cover letter form.

import Link from "next/link";
import { Compass, Loader2, RefreshCw } from "lucide-react";
import { useJobs } from "@/components/jobs/job-store";
import { DocCard, ghostBtn, primaryBtn } from "@/components/ui/doc-card";
import { FoldCard } from "@/components/ui/fold-card";
import { Tip } from "@/components/ui/tip";
import { ReportMarkdown } from "@/components/report-markdown";
import { useBrandBrief } from "@/components/use-brand-brief";
import { briefingText } from "@/lib/brand-brief-text.mjs";

export function BrandBriefButton({ n, company }: { n: string; company: string }) {
  const { startJob } = useJobs();
  const { job, text: briefRaw } = useBrandBrief(n);
  const start = () =>
    startJob({ title: `Brand briefing · ${company}`, subtitle: "research for the cover letter", kind: "brand-brief", input: n, page: `/pipeline/${n}` });

  if (job?.status === "running")
    return (
      <DocCard icon={<Loader2 className="size-5 motion-safe:animate-spin" />} title="Brand briefing" status="Miao is looking them up…" tone="busy">
        <Link href={`/jobs/${job.id}`} className={ghostBtn}>See progress</Link>
      </DocCard>
    );

  const text = briefRaw ? briefingText(briefRaw) : "";
  if (text)
    return (
      <FoldCard
        icon={<Compass className="size-5" />}
        title="Brand briefing"
        status={`What ${company} stands for, its brands, what they look for`}
        tone="ready"
        actions={
          <Tip label="Look them up again" align="end">
            <button type="button" onClick={start} aria-label="Look them up again" className={ghostBtn}><RefreshCw className="size-4" /></button>
          </Tip>
        }
      >
        <div className="report-prose text-sm [&>:last-child]:!mb-0">
          <ReportMarkdown>{text}</ReportMarkdown>
        </div>
      </FoldCard>
    );

  const failed = job && (job.status === "error" || job.status === "gated");
  return (
    <DocCard
      icon={<Compass className="size-5" />}
      title="Brand briefing"
      status={failed ? "Didn't finish" : "Values, brands, what they look for"}
      footer={failed ? <Link href={`/jobs/${job.id}`} className="text-xs text-red-700 hover:underline">Open the run log</Link> : undefined}
    >
      <button type="button" onClick={start} className={primaryBtn}>Look them up</button>
    </DocCard>
  );
}
