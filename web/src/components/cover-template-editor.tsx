"use client";

// Fork: the Cover letter page. Greta's letter template (structure, voice, stories),
// edited in place with the same Notion-style editor as the CV. Changes save on
// their own to modes/_custom.md, its own section only.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, CloudOff, Loader2 } from "lucide-react";
import { Tip } from "@/components/ui/tip";
import { JOB_PAGE_FRAME } from "@/components/page-frame";
import { NotionEditor } from "@/components/notion-editor";

const AUTOSAVE_MS = 800;
type Status = { kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: "error" };

export function CoverTemplateEditor() {
  const [template, setTemplate] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const latest = useRef<string | null>(null);
  const saved = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The editor reports its content once on load; only save after Greta edits.
  const touched = useRef(false);

  useEffect(() => {
    fetch("/api/profile/cover-template", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ template: string }>) : Promise.reject()))
      .then((d) => { setTemplate(d.template); saved.current = d.template; })
      .catch(() => setLoadError(true));
  }, []);

  const save = useCallback(async () => {
    const next = latest.current;
    if (next === null || next === saved.current) return;
    setStatus({ kind: "saving" });
    try {
      const r = await fetch("/api/profile/cover-template", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ template: next }) });
      if (!r.ok) throw new Error();
      saved.current = next;
      setStatus({ kind: "saved" });
    } catch {
      setStatus({ kind: "error" });
    }
  }, []);

  const onChange = useCallback((next: string) => {
    latest.current = next;
    if (!touched.current) { saved.current = next; return; }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(save, AUTOSAVE_MS);
  }, [save]);

  // Save what is left when leaving the page.
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); void save(); }, [save]);

  const statusLabel = status.kind === "saving" ? "Saving…" : status.kind === "saved" ? "Saved" : status.kind === "error" ? "Not saved. Keep typing to try again." : "Changes save automatically";
  return (
    <div className={JOB_PAGE_FRAME}>
      {/* Fork: same layout as the CV page: title, one-line subtitle, save status on the right, the document on a white sheet. */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl tracking-tight text-landing">Your cover letter</h1>
          <p className="mt-1 text-sm text-muted">
            How Miao writes your cover letters. It follows this for every job. Short extra rules are on the <Link href="/rules" className="text-brand-text hover:underline">Rules</Link> page.
          </p>
        </div>
        {template !== null && (
          <Tip label={statusLabel} align="end">
            <span
              role="status"
              aria-label={statusLabel}
              className="inline-flex size-9 items-center justify-center rounded-xl border border-border bg-surface text-muted max-sm:size-11"
            >
              {status.kind === "saving" ? <Loader2 className="size-4 animate-spin" />
                : status.kind === "error" ? <CloudOff className="size-4 text-red-700" />
                : <Check className={status.kind === "saved" ? "size-4 text-emerald-800 dark:text-emerald-400" : "size-4"} strokeWidth={status.kind === "saved" ? 2.5 : 2} />}
            </span>
          </Tip>
        )}
      </div>

      {loadError && <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-300">The cover letter template could not be read.</p>}
      {status.kind === "error" && <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-300">Not saved. Keep typing to try again.</p>}

      {template === null && !loadError ? (
        <div className="mt-6 text-sm text-muted">Loading…</div>
      ) : template !== null ? (
        <div
          className="mt-6 rounded-2xl border border-border bg-white py-10 pl-14 pr-8 shadow-sm sm:pl-16 sm:pr-14"
          onKeyDownCapture={() => { touched.current = true; }}
          onPasteCapture={() => { touched.current = true; }}
          onDropCapture={() => { touched.current = true; }}
          onMouseDownCapture={() => { touched.current = true; }}
        >
          <NotionEditor initialHtml={template} onChange={onChange} format="markdown" placeholder="How should your cover letters look? Type '/' for blocks" />
        </div>
      ) : null}
    </div>
  );
}
