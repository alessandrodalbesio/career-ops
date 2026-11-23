"use client";

import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from "react";
import { NotionEditor } from "@/components/notion-editor";
import { JOB_PAGE_FRAME } from "@/components/page-frame";
import { Check, CloudOff, Loader2, Save, Upload, X } from "lucide-react";

import { Tip } from "@/components/ui/tip";

// Fork: tooltip text for the save button, which doubles as the save status.
function saveTip(label: string, canSave: boolean): string {
  if (canSave) return "Unsaved changes · click to save";
  if (label === "Saved") return "All changes saved";
  if (label === "Saving") return "Saving…";
  if (label === "Loading") return "Loading…";
  if (label === "No file yet") return "Nothing to save yet";
  return label;
}

// Fork: small icon transitions for the CV actions.
const CV_ACTION_CSS = `
@keyframes cv-icon-in { from { opacity: 0; transform: scale(.6) rotate(-20deg); } to { opacity: 1; transform: none; } }
@keyframes cv-check { 0% { transform: scale(.4); } 60% { transform: scale(1.25); } 100% { transform: scale(1); } }
.cv-icon-in { animation: cv-icon-in .22s ease-out; }
.cv-check { animation: cv-check .45s cubic-bezier(.3,1.6,.5,1); }
@media (prefers-reduced-motion: reduce) { .cv-icon-in, .cv-check { animation: none; } }
`;
import { cn } from "@/lib/cn";
import { CvIngest } from "@/components/cv/cv-ingest";
import {
  cvSaveUsesKeepalive,
  draftChange,
  draftFromStore,
  editorReducer,
  editorStatus,
  initialEditor,
  followUpJob,
  saveFollowUp,
  shouldSave,
} from "@/lib/cv-editor-state.mjs";

const DRAFT_KEY = "career-ops.cv-draft";
const AUTOSAVE_MS = 600;

function readDraft() {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    return draftFromStore(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function CvEditor() {
  // Fork: the visual editor owns typing; any other change to the text (first load,
  // an imported CV) remounts it with the new content.
  const emitted = useRef<string | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  const [state, dispatch] = useReducer(editorReducer, initialEditor());
  useEffect(() => {
    if (state.phase !== "ready") return;
    if (state.content !== emitted.current) {
      emitted.current = state.content;
      setEditorKey((k) => k + 1);
    }
  }, [state.phase, state.content]);
  const [importing, setImporting] = useState(false);
  const [importSaving, setImportSaving] = useState(false);
  const stateRef = useRef(state);
  const snapshotPriorRef = useRef(true);
  const runningRef = useRef(false);
  const pendingRef = useRef<{ text: string; keepalive: boolean } | null>(null);
  useLayoutEffect(() => {
    stateRef.current = state;
    if (state.snapshotPrior) snapshotPriorRef.current = true;
  }, [state]);

  const pump = useCallback((confirmed?: { content: string; exists: boolean }) => {
    if (runningRef.current) return;
    const job = pendingRef.current;
    const current = stateRef.current;
    const base = confirmed ?? { content: current.saved, exists: current.exists };
    if (!job || current.phase !== "ready" || job.text !== current.content || job.text === base.content) {
      pendingRef.current = null;
      return;
    }
    pendingRef.current = null;
    runningRef.current = true;
    const snapshot = job.text;
    const backup = snapshotPriorRef.current;
    const expected = { content: base.content, exists: base.exists };
    dispatch({ type: "save-start", content: snapshot });
    const payload = { content: snapshot, backup, expected };
    fetch("/api/cv", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: cvSaveUsesKeepalive(job.keepalive, payload),
    })
      .then(async (res) => {
        runningRef.current = false;
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          dispatch({
            type: "save-failed",
            content: snapshot,
            error: body.error || "Could not save. Your text is still in this tab.",
            conflict: res.status === 409,
          });
          return;
        }
        if (backup) snapshotPriorRef.current = false;
        dispatch({ type: "save-ok", content: snapshot });
        window.dispatchEvent(new CustomEvent("co-cv-saved"));
        const follow = saveFollowUp(stateRef.current, snapshot);
        if (follow) {
          pendingRef.current = followUpJob(job, pendingRef.current, follow.text);
          pump(follow.expected);
        }
      })
      .catch(() => {
        runningRef.current = false;
        dispatch({
          type: "save-failed",
          content: snapshot,
          error: "Could not save. Your text is still in this tab.",
        });
      });
  }, []);

  const startSave = useCallback((keepalive = false) => {
    const current = stateRef.current;
    if (current.phase !== "ready" || current.content === current.saved) return;
    pendingRef.current = { text: current.content, keepalive };
    pump();
  }, [pump]);

  // Fork: a change applied from the Miao chat reloads the CV here, unless there
  // is unsaved typing (then the normal conflict check on save takes over).
  useEffect(() => {
    const reload = () => {
      const cur = stateRef.current;
      if (cur.phase !== "ready" || cur.content !== cur.saved) return;
      fetch("/api/cv")
        .then((r) => (r.ok ? (r.json() as Promise<{ content?: unknown; exists?: unknown }>) : Promise.reject()))
        .then((data) => dispatch({ type: "loaded", content: typeof data.content === "string" ? data.content : "", exists: data.exists === true, draft: null }))
        .catch(() => {});
    };
    window.addEventListener("co-cv-changed", reload);
    return () => window.removeEventListener("co-cv-changed", reload);
  }, []);

  useEffect(() => {
    let live = true;
    fetch("/api/cv")
      .then(async (res) => {
        if (!res.ok) throw new Error("load failed");
        return res.json() as Promise<{ content?: unknown; exists?: unknown }>;
      })
      .then((data) => {
        if (!live) return;
        dispatch({
          type: "loaded",
          content: typeof data.content === "string" ? data.content : "",
          exists: data.exists === true,
          draft: readDraft(),
        });
      })
      .catch(() => {
        if (!live) return;
        dispatch({
          type: "load-failed",
          error: "The CV could not be loaded. Reload the page before editing, so an empty page cannot replace it.",
        });
      });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    const draft = draftChange(state);
    if (draft === undefined) return;
    try {
      if (!draft) sessionStorage.removeItem(DRAFT_KEY);
      else sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch (error) {
      if (!(error instanceof DOMException)) throw error;
    }
  }, [state]);

  useEffect(() => {
    const flush = () => startSave(true);
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [startSave]);

  useEffect(() => {
    if (importing || !shouldSave(state)) return;
    const timer = setTimeout(() => startSave(false), AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [state, startSave, importing]);

  const status = editorStatus(state);

  return (
    <div className={JOB_PAGE_FRAME}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl tracking-tight text-landing">Your CV</h1>
          <p className="mt-1 text-sm text-muted">
            Your base CV. Miao tailors it for each job.
            {state.phase === "ready" && !state.exists && state.content === "" && (
              <span className="ml-1 text-faint">No cv.md yet — start typing to create it.</span>
            )}
          </p>
        </div>
        {/* Fork: icon-only actions. Upload toggles the import panel; the save button doubles as the
            save status (spinner while saving, a check that pops in when saved, a pulsing dot when unsaved). */}
        <div className="flex items-center gap-1.5">
          <style>{CV_ACTION_CSS}</style>
          <Tip label={importing ? "Close upload" : "Upload a CV (PDF or TeX)"}>
          <button
            type="button"
            disabled={state.phase !== "ready" || importSaving || state.inflight !== null || state.conflict}
            aria-expanded={importing}
            aria-controls="cv-import"
            aria-label={importing ? "Close upload" : "Upload PDF / TeX"}
            onClick={() => setImporting(!importing)}
            className="inline-flex size-9 items-center justify-center rounded-xl border border-border bg-surface text-muted transition-all hover:-translate-y-px hover:border-brand-text/30 hover:text-foreground active:translate-y-0 active:scale-95 disabled:opacity-40 max-sm:size-11"
          >
            <span key={importing ? "x" : "up"} className="cv-icon-in inline-flex">
              {importing ? <X className="size-4" /> : <Upload className="size-4" />}
            </span>
          </button>
          </Tip>
          <p role="status" className="sr-only">{status.label}</p>
          <Tip label={saveTip(status.label, status.canSave && !importing)} align="end">
          <button
            type="button"
            onClick={() => startSave(false)}
            disabled={!status.canSave || importing}
            aria-label={status.canSave ? "Save" : status.label}
            className={cn(
              "relative inline-flex size-9 items-center justify-center rounded-xl transition-all max-sm:size-11",
              status.canSave && !importing
                ? "bg-brand text-brand-foreground shadow-sm hover:-translate-y-px hover:bg-brand-200 active:translate-y-0 active:scale-95"
                : "border border-border bg-surface text-muted",
            )}
          >
            <span key={status.label} className="cv-icon-in inline-flex">
              {status.label === "Saving" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : status.label === "Saved" ? (
                <Check className="cv-check size-4 text-emerald-800 dark:text-emerald-400" strokeWidth={2.5} />
              ) : status.canSave ? (
                <Save className="size-4" />
              ) : status.label === "Loading" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <CloudOff className="size-4" />
              )}
            </span>
            {status.label === "Unsaved" && (
              <span aria-hidden="true" className="absolute -right-0.5 -top-0.5 flex size-2.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-amber-400 opacity-60" />
                <span className="relative inline-flex size-2.5 rounded-full bg-amber-500" />
              </span>
            )}
          </button>
          </Tip>
        </div>
      </div>

      {state.error && (
        <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-300">
          {state.error}
          {state.conflict && " Reloading drops this text, because the file changed."}
        </p>
      )}

      {importing && state.phase === "ready" && !state.conflict && (
        <section id="cv-import" aria-label="Import CV" className="mt-6">
          <p className="mb-3 text-sm text-muted">
            Upload your CV, review the conversion, then update cv.md.
            {state.content !== state.saved && " Your unsaved edits stay in the editor until you update."}
          </p>
          <CvIngest
            variant="editor"
            onSavingChange={setImportSaving}
            onSaved={(markdown) => {
              if (stateRef.current.conflict) return;
              dispatch({ type: "imported", content: markdown });
              setImporting(false);
              setImportSaving(false);
            }}
          />
        </section>
      )}

      {state.phase === "loading" ? (
        <div className="mt-6 text-sm text-muted">Loading…</div>
      ) : state.phase === "load-error" ? null : (
        <div className={`mt-6 rounded-2xl border border-border bg-white py-10 pl-14 pr-8 shadow-sm sm:pl-16 sm:pr-14 ${importing ? "pointer-events-none opacity-50" : ""}`}>
          <NotionEditor
            key={editorKey}
            format="markdown"
            initialHtml={state.content}
            editable={!importing}
            placeholder="Start your CV here, or type '/' for blocks"
            onChange={(md) => { emitted.current = md; dispatch({ type: "edit", content: md }); }}
          />
        </div>
      )}

    </div>
  );
}
