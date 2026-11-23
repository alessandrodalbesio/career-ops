"use client";

import { JOB_PAGE_FRAME } from "@/components/page-frame";
// Fork: the cover letter page, laid out like a Notion page: a slim top bar,
// a big title, a callout with Miao's notes, then the document (NotionEditor).
import { useCallback, useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { ArrowLeft, Check, ChevronDown, Copy, Download, Lightbulb, Loader2, RotateCcw } from "lucide-react";
import { BackLink } from "@/components/back-link";
import { Tip } from "@/components/ui/tip";
import { NotionEditor } from "@/components/notion-editor";

type Loaded = { html: string; draftHtml: string; edited: boolean; notes: string[] };
type Status = "idle" | "saving" | "saved" | "error";

const iconBtn =
  "inline-flex size-9 items-center justify-center rounded-xl border border-border bg-surface text-muted transition-all hover:-translate-y-px hover:border-brand-text/30 hover:text-foreground active:translate-y-0 active:scale-95 disabled:opacity-40 max-sm:size-11";

// Fork: Miao's notes are written for the agent ("she", "JD", "cv.md", "option b").
// Split off the short label and say the rest in plain words, to Greta.
const LABELS: [RegExp, string][] = [
  [/^keywords? not used/i, "Job words left out"],
  [/^gaps? omitted/i, "Gaps the letter doesn't mention"],
  [/^candidate answers?/i, "Your answers"],
  [/^tone/i, "Tone"],
];
function friendlyNote(raw: string): { label: string; text: string } {
  const clean = raw.replace(/\*\*/g, "").replace(/`/g, "").trim();
  const m = clean.match(/^([^:]{2,40}):\s*([\s\S]+)$/);
  let label = m ? m[1].trim() : "";
  let text = m ? m[2].trim() : clean;
  label = label.replace(/\s*\(option [a-z]\)/i, "");
  for (const [re, nice] of LABELS) if (re.test(label)) { label = nice; break; }
  label = label.replace(/^Bullet (\d+)$/i, "Bullet point $1");
  text = text
    .replace(/\bvoice-dna\.md\b/g, "your writing style")
    .replace(/\bcv\.md\b/g, "your CV")
    .replace(/\bthe JD\b/g, "the job post")
    .replace(/\bJD's\b/g, "job post's")
    .replace(/\bJD\b/g, "job post")
    .replace(/\bA, B and C\b/g, "Your three answers")
    .replace(/\bShe can\b/g, "You can").replace(/\bshe can\b/g, "you can")
    .replace(/\bshe should\b/g, "you should").replace(/\bShe should\b/g, "You should")
    .replace(/\bshe has\b/g, "you have").replace(/\bShe has\b/g, "You have")
    .replace(/\bshe does not\b/g, "you don't").replace(/\bshe wants\b/g, "you want")
    .replace(/\bshe is\b/g, "you are").replace(/\bher\b/g, "your")
    .replace(/\bI left out\b/g, "Miao left out").replace(/\bI changed\b/g, "Miao changed").replace(/\bI mirrored\b/g, "Miao matched")
    .replace(/\bis my addition\b/g, "was added by Miao")
    .replace(/^\w/, (c) => c.toUpperCase());
  return { label, text };
}

export function CoverStudio({ n, company }: { n: string; company: string }) {
  const [data, setData] = useState<Loaded | null>(null);
  const [missing, setMissing] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");
  const [notesOpen, setNotesOpen] = useState(false);
  const [version, setVersion] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorRef = useRef<Editor | null>(null);

  useEffect(() => {
    fetch(`/api/cover-letter?n=${encodeURIComponent(n)}`)
      .then((r) => (r.ok ? (r.json() as Promise<Loaded>) : Promise.reject()))
      .then(setData)
      .catch(() => setMissing(true));
  }, [n]);

  const put = useCallback((html: string) =>
    fetch("/api/cover-letter", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ n, html }) }), [n]);

  const onChange = useCallback((html: string) => {
    if (timer.current) clearTimeout(timer.current);
    setStatus("saving");
    timer.current = setTimeout(() => {
      put(html).then((r) => setStatus(r.ok ? "saved" : "error")).catch(() => setStatus("error"));
    }, 700);
  }, [put]);

  const onReady = useCallback((e: Editor) => { editorRef.current = e; }, []);
  const text = () => editorRef.current?.getText({ blockSeparator: "\n\n" }).trim() ?? "";

  const reset = async () => {
    if (!data || !window.confirm("Throw away your changes and go back to Miao's draft?")) return;
    if (timer.current) clearTimeout(timer.current);
    await fetch(`/api/cover-letter?n=${encodeURIComponent(n)}`, { method: "DELETE" }).catch(() => {});
    setData({ ...data, html: data.draftHtml, edited: false });
    setVersion((v) => v + 1);
    setStatus("idle");
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text());
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard blocked */ }
  };

  const download = async () => {
    const e = editorRef.current;
    if (!e || downloading) return;
    setDownloading(true);
    setError("");
    try {
      if (timer.current) clearTimeout(timer.current);
      await put(e.getHTML());
      setStatus("saved");
      const r = await fetch(`/api/cover-letter/pdf?n=${encodeURIComponent(n)}`);
      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(/allowed maximum/.test(body.error ?? "") ? "The letter is too long for one page. Shorten it a little and try again." : "The PDF could not be made. Try again.");
      }
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `Cover letter - ${company}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The PDF could not be made.");
    } finally {
      setDownloading(false);
    }
  };


  return (
    <div className={JOB_PAGE_FRAME}>
      <BackLink href={`/pipeline/${encodeURIComponent(n)}`} className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-brand-text">
        <ArrowLeft className="size-4" /> Back to the job
      </BackLink>

      <header className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Your cover letter for {company}</h1>
        </div>
        {data && (
          <div className="flex items-center gap-1.5">
            <Tip label="Back to Miao's draft">
              <button type="button" onClick={reset} aria-label="Back to Miao's draft" className={iconBtn}><RotateCcw className="size-4" /></button>
            </Tip>
            <Tip label={copied ? "Copied" : "Copy as text"}>
              <button type="button" onClick={copy} aria-label="Copy as text" className={iconBtn}>
                {copied ? <Check className="size-4 text-emerald-700" strokeWidth={2.5} /> : <Copy className="size-4" />}
              </button>
            </Tip>
            <Tip label="Download PDF" align="end">
              <button
                type="button"
                onClick={download}
                disabled={downloading}
                aria-label="Download PDF"
                className="inline-flex size-9 items-center justify-center rounded-xl bg-brand text-brand-foreground shadow-sm transition-all hover:-translate-y-px hover:bg-brand-200 active:translate-y-0 active:scale-95 disabled:opacity-60 max-sm:size-11"
              >
                {downloading ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
              </button>
            </Tip>
          </div>
        )}
      </header>
      {error && <p role="alert" className="mt-3 rounded-xl border border-red-300/60 bg-red-50 px-4 py-2.5 text-sm text-red-800">{error}</p>}

      {!data && !missing && <div className="mt-6 flex h-[60vh] items-center justify-center text-muted"><Loader2 className="size-5 animate-spin" /></div>}
      {missing && (
        <div className="mt-8 max-w-xl rounded-2xl border border-border bg-surface px-6 py-5">
          <h2 className="text-lg font-semibold">No cover letter yet</h2>
          <p className="mt-1 text-sm text-muted">Write one from the job page first.</p>
        </div>
      )}

      {data && (
        <>
          {data.notes.length > 0 && (
            <section className="mt-5 rounded-2xl border border-border bg-surface">
              <button type="button" onClick={() => setNotesOpen((o) => !o)} aria-expanded={notesOpen} className="flex w-full items-center gap-3 px-6 py-4 text-left">
                <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-800">
                  <Lightbulb className="size-4" />
                </span>
                <span className="flex-1">
                  <span className="block text-base font-semibold text-foreground">Before you send it</span>
                  <span className="block text-sm text-muted">{data.notes.length} {data.notes.length === 1 ? "thing" : "things"} Miao wants you to check</span>
                </span>
                <ChevronDown className={`size-4 text-faint transition-transform ${notesOpen ? "rotate-180" : ""}`} />
              </button>
              {notesOpen && (
                <ol className="divide-y divide-border border-t border-border">
                  {data.notes.map(friendlyNote).map((note, i) => (
                    <li key={i} className="flex gap-4 px-6 py-3.5">
                      <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-[11px] font-semibold text-amber-900">{i + 1}</span>
                      <div className="min-w-0 text-sm leading-relaxed">
                        {note.label && <p className="font-medium text-foreground">{note.label}</p>}
                        <p className="text-muted">{note.text}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          )}
          <div className="mt-5 rounded-2xl border border-border bg-white py-10 pl-14 pr-8 shadow-sm sm:pl-16 sm:pr-14">
            <NotionEditor key={version} initialHtml={data.html} onChange={onChange} onReady={onReady} />
          </div>
        </>
      )}
    </div>
  );
}
