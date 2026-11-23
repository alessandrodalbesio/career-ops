import { ArrowLeft, FileText, ExternalLink, ChevronDown } from "lucide-react";
import type { Application } from "@/lib/career-ops";
import { Badge } from "@/components/ui/badge";
import { parseReport } from "@/lib/format";
import {
  applyLineLabel,
  cleanHeading,
  isVerdictHeading,
  splitSections,
  verdictReason,
} from "@/lib/report-sections.mjs";
import { StatusSelect } from "@/components/status-select";
import { BackLink } from "@/components/back-link";
import { CompanyLogo } from "@/components/company-logo";
import { GeneratePdfButton } from "@/components/generate-pdf-button";
import { CoverDraftButton } from "@/components/cover-draft-button";
import { DeleteFromTracker } from "@/components/delete-from-tracker";
import { ApplyChecks, EvaluationSections } from "@/components/evaluation-sections";
import { companyPresentation } from "@/lib/company-presentation.mjs";
import { cvDiskState } from "@/lib/cv-disk-state.mjs";
import { reportSpendActions } from "@/lib/report-spend-actions.mjs";
import { applyPostingUrl } from "@/lib/posting-url.mjs";
import { PageFrame } from "@/components/page-frame";

// Progressive disclosure of the report. Current oferta.md writes letter F as
// Interview Plan (STAR+R), not a verdict — never promote by letter (#3416).
// The score + 4.0 apply line + legitimacy live in one Peak-End callout (#4203).
// Block B (CV Match) stays open; everything else, including Role Summary and
// STAR+R, is collapsed (#4205). Machine artifacts stay in the Technical tier.

function isMachine(heading: string): boolean {
  return /machine summary|submitted|submit[-\s]?log/i.test(heading);
}

export function ReportView({
  id,
  app,
  report,
  canDelete = false,
  pdfFileReady = false,
  applyPdfReady = false,
  trackerMarkedPdf = false,
  coverReady = false,
  backHref = "/pipeline",
  applyHref,
  reportNum = null,
}: {
  id: string;
  app: Application | null;
  report: string | null;
  /** kept in the props contract (the page passes it) but no longer surfaced —
   *  the raw .md filename is a dev artifact, not header content. */
  file?: string | null;
  canDelete?: boolean;
  /** A tailored CV file is on disk (index or a matching cv-* name). Not the tracker mark. */
  pdfFileReady?: boolean;
  applyPdfReady?: boolean;
  /** The tracker cell has a PDF mark. That mark can exist with no file. */
  trackerMarkedPdf?: boolean;
  /** A tailored cover letter for THIS application exists in output/ (resolved by
   *  the page, see resolveTailoredCover). The page drafts letters through the
   *  cover run but does not render them, so this link only finds CLI PDFs. */
  coverReady?: boolean;
  backHref?: string;
  applyHref?: string;
  reportNum?: number | null;
}) {
  const meta = report ? parseReport(report) : null;
  const field = (label: string) => meta?.fields.find((f) => f.label === label)?.value;
  const score = app?.score || field("Score");
  const date = app?.date || field("Date");
  const url = field("URL");
  const line = applyLineLabel(score ?? "", meta?.legitimacy);
  const recommended = line === "Recommended";
  const applyUrl = applyPostingUrl(url, app?.url, app?.applyLink) || undefined;
  const disk = cvDiskState({ onDisk: pdfFileReady, trackerMarked: trackerMarkedPdf });
  const spend = reportSpendActions(Boolean(report));
  const company = app ? companyPresentation(app) : null;
  const companyName = company?.label ?? app?.company ?? meta?.title ?? id;
  // Fork: a calm job page. Header, verdict, the CV / cover letter actions, the
  // full evaluation folded away, and "remove" at the very bottom.
  const body = report ? splitSections(meta?.body ?? report) : null;
  const verdictSection = body?.sections.find((s) => isVerdictHeading(s.heading));
  const reason = report
    ? verdictReason({ report, intro: body?.intro ?? "", verdictContent: verdictSection?.content })
    : "";
  const fullReport = (body?.sections ?? []).filter((s) => s !== verdictSection && !isMachine(s.heading));

  return (
    <PageFrame className="max-w-5xl">
      <BackLink
        href={backHref}
        className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-brand-text print:hidden"
      >
        <ArrowLeft className="size-4" /> Pipeline
      </BackLink>

      <header className="mt-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <CompanyLogo name={company?.logoName ?? meta?.title ?? `Report #${id}`} size={44} />
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight text-foreground">{companyName}</h1>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-muted">
              {app?.role && <span>{app.role}</span>}
              {applyUrl && (
                <a href={applyUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-text hover:underline">
                  posting <ExternalLink className="size-3" />
                </a>
              )}
            </p>
          </div>
        </div>
        {app && (
          <div className="flex items-center gap-1.5 pt-1">
            <StatusSelect n={id} current={app.status} inline applicationLabel={companyName} />
            {canDelete && <DeleteFromTracker n={id} compact />}
          </div>
        )}
      </header>

      {report ? (
        <>
          <section className="mt-8 rounded-2xl border border-border bg-surface px-6 py-5">
            <div className="flex items-baseline gap-3">
              {score ? (
                <p className="text-4xl font-semibold tabular-nums tracking-tight text-foreground">{score}</p>
              ) : (
                <p className="text-sm text-muted">No score on this report.</p>
              )}
              {line && <Badge tone={recommended ? "good" : line === "Below the apply line" ? "muted" : "warn"}>{line}</Badge>}
              {date && <span className="ml-auto text-xs tabular-nums text-faint">{date}</span>}
            </div>
            {reason && <p className="mt-4 text-[15px] leading-relaxed text-foreground">{reason}</p>}
          </section>

          <ApplyChecks sections={fullReport} />

          <div className="mt-6 grid grid-cols-1 items-start gap-4 sm:grid-cols-2 print:hidden">
            {spend.generateCv && (
              <GeneratePdfButton n={id} company={app?.company || meta?.title || id} onDisk={disk.exists} />
            )}
            {app && (
              <CoverDraftButton
                n={id}
                company={companyName}
                pdfHref={coverReady ? `/api/cover-pdf?application=${encodeURIComponent(id)}` : undefined}
              />
            )}
          </div>

          <EvaluationSections sections={fullReport} />
        </>
      ) : (
        <p className="mt-8 rounded-2xl border border-dashed border-border p-5 text-sm text-muted">{spend.explanation}</p>
      )}

    </PageFrame>
  );
}
