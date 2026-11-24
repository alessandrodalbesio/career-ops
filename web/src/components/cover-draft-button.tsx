"use client";

import { useEffect, useId, useMemo, useState, type FormEvent } from "react";
import { Modal } from "@/components/ui/modal";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FilePlus2, FileText, Hourglass, Loader2, Mail, Sparkles, SquarePen, TriangleAlert } from "lucide-react";
import { useJobs } from "@/components/jobs/job-store";
import { PdfViewer } from "@/components/pipeline/pdf-viewer";
import { DocCard, ghostBtn, iconPrimary, iconSecondary, primaryBtn } from "@/components/ui/doc-card";
import { Tip } from "@/components/ui/tip";
import { CostBadge } from "@/components/cost/cost-badge";
import { coverDraftButtonState } from "@/lib/pdf-button-state.mjs";
import { COVER_QUESTIONS, storedCoverBrief } from "@/lib/cover-answers.mjs";
import { pipelineQuery } from "@/lib/pipeline-navigation.mjs";
import { useBrandBrief } from "@/components/use-brand-brief";
import { briefingQuestions, splitQuestion } from "@/lib/brand-brief-text.mjs";

// Fires the real career-ops `cover` mode (worker kind "cover") for THIS
// application. cover.md will not draft until the candidate answers its four
// Step 6 prompts, so the button opens those questions first. The draft lands in
// the run log. Rendering it to PDF is still the CLI's Step 9.

const fieldClass =
  "mt-1.5 w-full resize-none rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-faint focus:border-brand/50 focus:bg-background focus:outline-none";

export function CoverDraftButton({ n, company, pdfHref }: { n: string; company: string; pdfHref?: string }) {
  const { jobs, startJob } = useJobs();
  const listQuery = pipelineQuery(useSearchParams().toString());
  const jobQuery = listQuery ? `?${listQuery}` : "";
  const [open, setOpen] = useState(false);
  const [viewing, setViewing] = useState(false);
  const formTitleId = useId();
  // Fork: a letter drafted on another device or before a reload still counts as ready.
  const [hasLetter, setHasLetter] = useState(false);
  const [savedBrief, setSavedBrief] = useState<Record<string, string> | null>(null);
  const job = useMemo(
    () => jobs.filter((j) => j.kind === "cover" && j.input === n).sort((a, b) => b.startedAt - a.startedAt)[0],
    [jobs, n],
  );
  // Fork: a finished brand briefing (this browser or saved on the server) writes
  // these questions for this brand.
  const { text: briefText } = useBrandBrief(n);
  const brandQuestions = useMemo(() => briefingQuestions(briefText), [briefText]) as Record<string, string | undefined>;
  const state = coverDraftButtonState(job);
  useEffect(() => {
    let live = true;
    fetch(`/api/cover-letter?n=${encodeURIComponent(n)}`).then((r) => live && setHasLetter(r.ok)).catch(() => {});
    return () => { live = false; };
  }, [n, job?.status]);
  // savedBrief is lost when the user leaves the page, typically to read a failed
  // run's log, so fall back to the answers that run kept (#7441).
  const prefill = savedBrief ?? storedCoverBrief(job?.brief);

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const brief = Object.fromEntries([...COVER_QUESTIONS.map((q) => q.name), "tone"].map((k) => [k, String(data.get(k) ?? "")]));
    setSavedBrief(brief);
    startJob({ title: `Cover letter · ${company}`, subtitle: "draft for this role", kind: "cover", input: n, page: `/pipeline/${n}`, brief });
    setOpen(false);
  };

  if (state.kind === "running")
    return (
      <DocCard icon={<Loader2 className="size-5 motion-safe:animate-spin" />} title="Cover letter" status="Miao is writing it…" tone="busy">
        <Tip label="See progress" align="end">
          <Link href={`/jobs/${state.jobId}${jobQuery}`} aria-label="See progress" className={iconSecondary}><Hourglass className="size-4" /></Link>
        </Tip>
      </DocCard>
    );

  const failure = state.failure && (
    <Link
      href={`/jobs/${state.failure.jobId}${jobQuery}`}
      role="alert"
      title="Open the run log"
      className="inline-flex max-w-md items-start gap-1 text-xs text-red-700 hover:underline"
    >
      <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
      <span>Cover letter not written. {state.failure.reason}</span>
    </Link>
  );

  const ready = hasLetter || (state.kind === "ready" && job);
  return (
    <DocCard
      icon={<Mail className="size-5" />}
      title="Cover letter"
      status={ready ? "Draft ready" : "Not written yet"}
      tone={ready ? "ready" : "idle"}
      footer={
        <>
          {failure}
      <Modal isOpen={open} onClose={() => setOpen(false)} labelledBy={formTitleId} panelClassName="max-w-2xl p-0">
        <form onSubmit={submit} aria-label="Cover letter questions">
          <div className="border-b border-border px-6 py-4">
            <h2 id={formTitleId} className="text-base font-semibold text-foreground">Cover letter for {company}</h2>
            <p className="mt-0.5 text-sm text-muted">
              {Object.keys(brandQuestions).length ? "Questions from the brand briefing. A few words each is enough." : "Look up the brand first for questions about this company. A few words each is enough."}
            </p>
          </div>
          <div className="max-h-[70vh] space-y-6 overflow-y-auto px-6 py-5">
            {/* Fork: the voice comes from the letter template, so the tone is fixed. */}
            <input type="hidden" name="tone" value="conversational" />
            {COVER_QUESTIONS.map((q) => {
              const optional = "optional" in q && q.optional;
              const asked = brandQuestions[q.name];
              const question = asked ? splitQuestion(asked).question : q.hint.replace(/^Optional\.\s*/, "");
              const full = asked?.replace(/\s+\|\s+/g, " ");
              return (
                <div key={q.name}>
                  <div>
                    <div>
                      <p className="text-[15px] font-medium leading-snug text-foreground">{question}</p>
                      {full && full !== question ? (
                        <details className="group">
                          <summary className="mt-0.5 flex cursor-pointer list-none items-center gap-1.5 text-xs text-faint [&::-webkit-details-marker]:hidden">
                            <span>{q.label}{optional ? " · optional" : ""}</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-medium text-brand-text hover:underline">
                              <span className="group-open:hidden">Show examples</span>
                              <span className="hidden group-open:inline">Hide examples</span>
                            </span>
                          </summary>
                          <p className="mt-2 rounded-xl bg-surface-hover/60 px-3.5 py-2.5 text-sm leading-relaxed text-muted">{full}</p>
                        </details>
                      ) : (
                        <p className="mt-0.5 text-xs text-faint">{q.label}{optional ? " · optional" : ""}</p>
                      )}
                      <textarea
                        name={q.name}
                        required={!optional}
                        maxLength={1000}
                        rows={3}
                        defaultValue={prefill?.[q.name] ?? ""}
                        placeholder="Your answer, in your own words"
                        aria-label={question}
                        className={fieldClass}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
            <button type="button" onClick={() => setOpen(false)} className={ghostBtn}>Cancel</button>
            <button type="submit" className={primaryBtn}>
              <Sparkles className="size-4" /> Write letter
            </button>
          </div>
        </form>
      </Modal>
        </>
      }
    >
      {ready ? (
        <>
          <Tip label="Open letter">
            <button onClick={() => setViewing(true)} aria-label="Open letter" className={iconPrimary}><FileText className="size-4" /></button>
          </Tip>
          <PdfViewer src={`/api/cover-letter/pdf?n=${encodeURIComponent(n)}&inline=1`} title={`Cover letter · ${company}`} open={viewing} onClose={() => setViewing(false)} />
          <Tip label="Edit letter">
            <Link href={`/pipeline/${encodeURIComponent(n)}/cover`} aria-label="Edit letter" className={iconSecondary}><SquarePen className="size-4" /></Link>
          </Tip>
          <Tip label="Rewrite it with Miao" align="end">
            <button onClick={() => setOpen(true)} aria-label="New version" className={iconSecondary}><Sparkles className="size-4" /></button>
          </Tip>
        </>
      ) : (
        <Tip label="Write cover letter" align="end">
          <button onClick={() => setOpen(true)} aria-label="Write cover letter" className={iconPrimary}><FilePlus2 className="size-4" /></button>
        </Tip>
      )}
    </DocCard>
  );
}
