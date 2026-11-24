// Fork: the evaluation below the verdict, as a few calm cards instead of the raw
// report. Known sections (job summary, CV match, gaps, score, checks) are matched
// by heading and rendered as cards; developer sections are dropped; anything else
// stays available under "More details". Unparseable content falls back to markdown.
import type { ReactNode } from "react";
import { ChevronDown, ListChecks } from "lucide-react";
import { FoldCard } from "@/components/ui/fold-card";
import { cn } from "@/lib/cn";
import { ReportMarkdown } from "@/components/report-markdown";
import { cleanHeading } from "@/lib/report-sections.mjs";

type Section = { heading: string; content: string };

const is = (h: string, re: RegExp) => re.test(h.toLowerCase());
const plain = (s: string) => s.replace(/\*\*/g, "").replace(/`/g, "").trim();

function parseTable(md: string): { head: string[]; rows: string[][] } | null {
  const lines = md.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("|"));
  if (lines.length < 3) return null;
  const cells = (l: string) => l.replace(/^\||\|$/g, "").split("|").map((c) => plain(c));
  const head = cells(lines[0]).map((c) => c.toLowerCase());
  const rows = lines.slice(2).map(cells).filter((r) => r.some(Boolean));
  return { head, rows };
}

function withoutTables(md: string): string {
  return md.split("\n").filter((l) => !l.trim().startsWith("|")).join("\n").trim();
}

function Card({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-2xl border border-border bg-surface px-6 py-5", className)}>
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Prose({ md }: { md: string }) {
  return (
    <div className="report-prose text-sm [&_*]:!max-w-none [&>:last-child]:!mb-0 [&_li:last-child]:!mb-0">
      <ReportMarkdown>{md}</ReportMarkdown>
    </div>
  );
}

// ---- CV match: requirement + pill + evidence
function matchTone(cell: string): { label: string; cls: string } {
  if (/✅|strong/i.test(cell)) return { label: "Strong", cls: "bg-emerald-50 text-emerald-800 border-emerald-200" };
  if (/⚠|partial|weak/i.test(cell)) return { label: "Partial", cls: "bg-amber-50 text-amber-800 border-amber-200" };
  if (/❌|missing|gap|no\b/i.test(cell)) return { label: "Missing", cls: "bg-rose-50 text-rose-800 border-rose-200" };
  return { label: cell.replace(/[✅⚠️❌]/gu, "").trim() || "—", cls: "bg-surface-hover text-muted border-border" };
}

function MatchCard({ content }: { content: string }) {
  const t = parseTable(content);
  const col = (re: RegExp) => t?.head.findIndex((h) => re.test(h)) ?? -1;
  const req = col(/requirement|skill|criterion|need/);
  const match = col(/match|fit|status/);
  const ev = col(/evidence|proof|cv/);
  if (!t || req < 0 || match < 0) return <Card title="How you match"><Prose md={content} /></Card>;
  const order = { Strong: 0, Partial: 1, Missing: 2 } as Record<string, number>;
  const rows = t.rows
    .map((r) => ({ req: r[req], tone: matchTone(r[match] ?? ""), ev: ev >= 0 ? r[ev] : "" }))
    .sort((a, b) => (order[a.tone.label] ?? 3) - (order[b.tone.label] ?? 3));
  const strong = rows.filter((r) => r.tone.label === "Strong").length;
  return (
    <Card title="How you match">
      <p className="-mt-1 mb-3 text-sm text-muted">{strong} of {rows.length} requirements are a strong match.</p>
      <ul className="divide-y divide-border">
        {rows.map((r, i) => (
          <li key={i} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
            <span className={cn("mt-0.5 inline-flex w-16 shrink-0 justify-center rounded-full border px-2 py-0.5 text-[11px] font-medium", r.tone.cls)}>{r.tone.label}</span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{r.req}</p>
              {r.ev && <p className="mt-0.5 text-sm text-muted">{r.ev}</p>}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ---- Score breakdown: one bar per dimension
function ScoreCard({ content }: { content: string }) {
  const t = parseTable(content);
  const rows = (t?.rows ?? [])
    .map((r) => {
      const m = (r[1] ?? "").match(/(\d+(?:\.\d+)?)\s*\/\s*5/);
      const note = (r[1] ?? "").replace(/^[^(]*\(?/, "").replace(/\)$/, "").trim();
      return { label: r[0], value: m ? Number(m[1]) : null, raw: r[1] ?? "", note: m && /\(/.test(r[1] ?? "") ? note : "" };
    })
    .filter((r) => r.label && !/^global$|^total$/i.test(r.label));
  const extra = withoutTables(content);
  if (!rows.length) return <Card title="Score breakdown"><Prose md={content} /></Card>;
  return (
    <Card title="Score breakdown">
      <ul className="space-y-3">
        {rows.map((r, i) => (
          <li key={i}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="text-foreground">{r.label}</span>
              <span className="tabular-nums text-muted">{r.value !== null ? `${r.value}/5` : r.raw}</span>
            </div>
            {r.value !== null && (
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-hover">
                <div className="h-full rounded-full bg-brand" style={{ width: `${(r.value / 5) * 100}%` }} />
              </div>
            )}
            {r.note && <p className="mt-1 text-xs text-faint">{r.note}</p>}
          </li>
        ))}
      </ul>
      {extra && <div className="mt-4 border-t border-border pt-3"><Prose md={extra} /></div>}
    </Card>
  );
}

// ---- "Before you apply": the numbered checks inside Score Evidence
function checksFrom(content: string): string | null {
  const m = content.match(/verification priorities[^\n]*\n([\s\S]*)/i);
  if (!m) return null;
  const list = m[1].split("\n").filter((l) => /^\s*(\d+\.|-)\s/.test(l)).join("\n");
  return list || null;
}

function Folded({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="group rounded-2xl border border-border bg-surface">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-4 text-sm font-medium text-foreground">
        {title}
        <ChevronDown className="ml-auto size-4 text-faint transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-border px-5 py-4">{children}</div>
    </details>
  );
}

export function ApplyChecks({ sections }: { sections: Section[] }) {
  const evidence = sections.find((s) => is(s.heading, /score evidence/));
  const checks = evidence ? checksFrom(evidence.content) : null;
  if (!checks) return null;
  const count = checks.split("\n").filter((l) => /^\s*(\d+\.|-)\s/.test(l)).length;
  return (
    <FoldCard icon={<ListChecks className="size-5" />} title="Check before you apply" status={`${count} thing${count === 1 ? "" : "s"} to confirm`} className="mt-4">
      <Prose md={checks} />
    </FoldCard>
  );
}

export function EvaluationSections({ sections }: { sections: Section[] }) {
  const find = (re: RegExp) => sections.find((s) => is(s.heading, re));
  const job = find(/job summary|^summary$/) ?? find(/role summary/);
  const match = find(/match with cv|block b|requirement|fit and evidence|fit \/ requirement/);
  const gaps = find(/^gaps|risk summary/);
  const score = find(/global score|^score$/);
  const evidence = find(/score evidence/);
  const jd = find(/job description/);

  const used = new Set([job, match, gaps, score, evidence, jd].filter(Boolean));
  const dropped = /machine summary|keywords extracted|keyword coverage|posting check|legitimacy|block a|^a\)|role summary|submit/;
  const more = sections.filter((s) => !used.has(s) && !is(s.heading, dropped));

  const jobTable = job ? parseTable(job.content) : null;

  return (
    <div className="mt-14">
      <div className="mb-4 flex items-center gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-faint">Details</h2>
        <span className="h-px flex-1 bg-border" />
      </div>
      <div className="space-y-4">
      {job && (
        <Card title="The job">
          {jobTable && jobTable.head.length === 2 ? (
            <>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-[max-content_1fr]">
              {jobTable.rows.filter((r) => !/^tl;?dr$/i.test(r[0])).map((r, i) => (
                <div key={i} className="contents">
                  <dt className="text-muted">{r[0]}</dt>
                  <dd className="text-foreground">{r[1]}</dd>
                </div>
              ))}
            </dl>
            {withoutTables(job.content) && <div className="mt-4 border-t border-border pt-3"><Prose md={withoutTables(job.content)} /></div>}
            </>
          ) : (
            <Prose md={job.content} />
          )}
        </Card>
      )}
      {match && <MatchCard content={match.content} />}
      <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
        {gaps && <Card title="Gaps to prepare for"><Prose md={gaps.content} /></Card>}
        {score && withoutTables(score.content) && (
          <Card title="Your angle for the application">
            <Prose md={withoutTables(score.content).replace(/^\*{0,2}personal angles[^:]*:\*{0,2}\s*/i, "").replace(/^\w/, (c) => c.toUpperCase())} />
          </Card>
        )}
      </div>
      {more.length > 0 && (
        <Folded title="More details">
          {more.map((s, i) => (
            <article key={i} className="report-prose mt-6 text-sm first:mt-0">
              <h3>{cleanHeading(s.heading)}</h3>
              <ReportMarkdown>{s.content}</ReportMarkdown>
            </article>
          ))}
        </Folded>
      )}
      {jd && (
        <Folded title="Original job posting">
          <div className="whitespace-pre-line text-sm leading-relaxed text-muted">{jd.content.trim()}</div>
        </Folded>
      )}
      </div>
    </div>
  );
}
