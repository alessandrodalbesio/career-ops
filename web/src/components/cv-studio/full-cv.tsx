"use client";

// Fork: the whole base CV (cv.md) inside the CV studio, in the same Notion-like
// editor as the /cv page. Edits save to cv.md on their own (POST /api/cv with
// the last saved text as `expected`, so a change made elsewhere is not overwritten).
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Loader2, TriangleAlert } from "lucide-react";
import { NotionEditor } from "@/components/notion-editor";

type Status = { kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: "error"; message: string };
const AUTOSAVE_MS = 800;

export function FullCv() {
  const [md, setMd] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const saved = useRef("");
  const latest = useRef("");
  const backup = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const running = useRef(false);

  useEffect(() => {
    fetch("/api/cv", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ content?: string }>) : Promise.reject()))
      .then((d) => {
        saved.current = latest.current = d.content ?? "";
        setMd(d.content ?? "");
      })
      .catch(() => setError(true));
  }, []);

  const save = useCallback(async () => {
    if (running.current || latest.current === saved.current) return;
    running.current = true;
    const content = latest.current;
    setStatus({ kind: "saving" });
    try {
      const r = await fetch("/api/cv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, backup: backup.current, expected: { content: saved.current, exists: true } }),
      });
      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as { error?: string };
        setStatus({ kind: "error", message: r.status === 409 ? "Your CV was changed somewhere else. Reload the page to see it." : body.error ?? "Not saved." });
        return;
      }
      backup.current = false;
      saved.current = content;
      setStatus({ kind: "saved" });
      window.dispatchEvent(new CustomEvent("co-cv-saved"));
    } catch {
      setStatus({ kind: "error", message: "Not saved. Is the dashboard still running?" });
    } finally {
      running.current = false;
      if (latest.current !== saved.current) timer.current = setTimeout(save, AUTOSAVE_MS);
    }
  }, []);

  const onChange = useCallback((next: string) => {
    latest.current = next;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(save, AUTOSAVE_MS);
  }, [save]);

  // Save what is left when leaving the tab or the page.
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); void save(); }, [save]);

  if (error) return <p className="p-4 text-sm text-red-700">Your CV could not be read.</p>;
  if (md === null) return <div className="flex justify-center p-10 text-muted"><Loader2 className="size-5 animate-spin" /></div>;
  return (
    <div>
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-2.5 text-xs text-muted">
        <span>Your whole CV, including what Miao left out. Changes save to your CV.</span>
        <span className={status.kind === "error" ? "inline-flex items-center gap-1 text-red-700" : "inline-flex items-center gap-1 text-faint"}>
          {status.kind === "saving" && <><Loader2 className="size-3 animate-spin" /> Saving…</>}
          {status.kind === "saved" && <><Check className="size-3 text-emerald-700" /> Saved</>}
          {status.kind === "error" && <><TriangleAlert className="size-3" /> {status.message}</>}
        </span>
      </div>
      <div className="px-3 py-4">
        <NotionEditor initialHtml={md} onChange={onChange} format="markdown" placeholder="Your CV" />
      </div>
    </div>
  );
}
