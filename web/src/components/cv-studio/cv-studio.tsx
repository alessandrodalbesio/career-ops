"use client";

import { JOB_PAGE_FRAME } from "@/components/page-frame";
import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Check, FileText, Loader2, RotateCcw, Save, Undo2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { BackLink } from "@/components/back-link";
import { Tip } from "@/components/ui/tip";

const iconBtn =
  "inline-flex size-9 items-center justify-center rounded-xl border border-border bg-surface text-muted transition-all hover:-translate-y-px hover:border-brand-text/30 hover:text-foreground active:translate-y-0 active:scale-95 disabled:opacity-40 disabled:hover:translate-y-0 max-sm:size-11";
import { pipelineQuery } from "@/lib/pipeline-navigation.mjs";
import { arrange, renderBlocks, type BlockTree } from "@/lib/cv-studio/html-blocks.mjs";
import { bulletShown, applyRecordedEdit, emptyEdits, isStudioUndoKey, resolveStudio, studioReducer, type StudioAction, type StudioDoc, type StudioEdits } from "@/lib/cv-studio/studio.mjs";
import { editSaveStatus, inflightEdits, ownsStatus, postWroteEdits, shouldPutAfterPost, shouldSendEdits } from "@/lib/cv-studio/put-order.mjs";
import { SectionCard, isSummarySection, needsCheck } from "./section-card";
import { friendlyWarnings, type FriendlyItem } from "@/lib/cv-studio/friendly-warnings";
import { CvPreview } from "./cv-preview";
import { CoverageMeter } from "./coverage-meter";

type Loaded = { ok: true; reportNum: string; company: string; file: string; tree: BlockTree; doc: StudioDoc; edits: StudioEdits; stale: boolean; hasBase: boolean; pdfExport?: { ok: false; error: string } | null };
type LoadState = { kind: "loading" } | { kind: "error"; reason: string } | { kind: "ready"; data: Loaded };
type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; pdf: string; indexed: boolean; warnings: string[] }
  | { kind: "outdated"; pdf: string }
  | { kind: "failed"; error: string };

const REASONS: Record<string, { title: string; body: string }> = {
  "no-tailored-cv": { title: "No tailored CV yet", body: "Generate a tailored CV from the report page first. The Studio opens it for review once it exists." },
  "unreadable-layout": { title: "This CV layout is not supported yet", body: "The Studio reads CVs built from the career-ops templates. Open the PDF from the report page instead." },
  "no-report": { title: "Report not found", body: "There is no evaluation report with this number." },
};

const STALE = "This CV was regenerated in another tab. Reload the Studio.";
const KEEPALIVE_BYTES = 60_000;
const SAVE_ERRORS: Record<string, string> = { stale: STALE, busy: "This CV is already being saved. Wait for that save to finish." };

export function CvStudio({ n }: { n: string }) {
  const listQuery = pipelineQuery(useSearchParams().toString());
  const reportHref = `/pipeline/${encodeURIComponent(n)}${listQuery ? `?${listQuery}` : ""}`;
  const [load, setLoad] = useState<LoadState>({ kind: "loading" });
  useEffect(() => {
    let live = true;
    fetch(`/api/cv-studio/${encodeURIComponent(n)}`)
      .then(async (r) => (r.ok ? { kind: "ready" as const, data: (await r.json()) as Loaded } : { kind: "error" as const, reason: ((await r.json().catch(() => ({}))) as { error?: string }).error ?? "failed" }))
      .catch(() => ({ kind: "error" as const, reason: "failed" }))
      .then((s) => live && setLoad(s));
    return () => {
      live = false;
    };
  }, [n]);

  return (
    <div className={JOB_PAGE_FRAME}>
      <BackLink href={reportHref} className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-brand-text">
        <ArrowLeft className="size-4" /> Back to the job
      </BackLink>
      {load.kind === "loading" && <div className="mt-6 h-[70vh] animate-pulse rounded-2xl bg-muted/15" aria-label="Loading the CV Studio" />}
      {load.kind === "error" && (
        <div className="mt-8 max-w-xl rounded-2xl border border-border bg-surface/40 px-6 py-5">
          <h1 className="font-display text-xl text-landing">{REASONS[load.reason]?.title ?? "The CV Studio could not open this CV"}</h1>
          <p className="mt-2 text-sm text-muted">{REASONS[load.reason]?.body ?? "Reload the page to try again."}</p>
        </div>
      )}
      {load.kind === "ready" && <Studio n={n} data={load.data} />}
    </div>
  );
}

function Studio({ n, data }: { n: string; data: Loaded }) {
  const { doc, tree } = data;
  const [edits, dispatchEdit] = useReducer((e: StudioEdits, a: StudioAction) => studioReducer(e, a, doc), data.edits);
  const history = useRef<StudioEdits[]>([]);
  const editsRef = useRef(edits);
  const [canUndo, setCanUndo] = useState(false);
  // Handlers set these before dispatch. This effect stores the committed
  // objects. A discarded render must not write them, or a save can send an edit that was undone.
  const latestEdits = useRef(edits);
  useLayoutEffect(() => {
    latestEdits.current = edits;
    editsRef.current = edits;
  }, [edits]);
  const recordEdit = useCallback((action: StudioAction) => {
    const applied = applyRecordedEdit(latestEdits.current, action, doc, history.current);
    if (!applied.recorded) return;
    history.current = applied.history;
    latestEdits.current = applied.edits;
    editsRef.current = applied.edits;
    setCanUndo(true);
    dispatchEdit(action);
  }, [doc]);
  const undo = useCallback(() => {
    const prev = history.current.pop();
    setCanUndo(history.current.length > 0);
    if (!prev) return;
    latestEdits.current = prev;
    editsRef.current = prev;
    dispatchEdit({ type: "replace", edits: prev });
  }, []);
  // Fork: the CV is always one page, worded close to her own CV (no choice shown).
  useEffect(() => {
    if (edits.preset.length !== "one-page" || edits.preset.tone !== "conservative")
      dispatchEdit({ type: "preset", preset: { length: "one-page", tone: "conservative" } });
  }, [edits.preset.length, edits.preset.tone]);
  const rejectedOnLoad = data.pdfExport?.ok === false;
  const [pdfRejected, setPdfRejected] = useState(rejectedOnLoad);
  const [save, setSave] = useState<SaveState>(rejectedOnLoad ? { kind: "failed", error: data.pdfExport?.error ?? "Saving failed." } : { kind: "idle" });
  const [autosaveError, setAutosaveError] = useState<string | null>(null);
  const resolved = useMemo(() => resolveStudio(doc, edits), [doc, edits]);
  const html = useMemo(() => renderBlocks(tree, resolved.view, { added: resolved.added }), [tree, resolved]);
  const tailoredPresent = useMemo(() => resolveStudio(doc, emptyEdits(doc.sourceHash)).coverage.present, [doc]);
  const dropped = tailoredPresent.filter((k) => resolved.coverage.missing.includes(k));

  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const send = useCallback(
    (method: "PUT" | "POST", body: object, keepalive = false) => {
      const payload = JSON.stringify(body);
      const bytes = new TextEncoder().encode(payload).length;
      const start = () =>
        fetch(`/api/cv-studio/${encodeURIComponent(n)}`, {
          method,
          headers: { "Content-Type": "application/json" },
          body: payload,
          keepalive: keepalive && bytes < KEEPALIVE_BYTES,
        });
      // A keepalive request is the page-exit flush. It starts now: queued
      // behind an autosave, it might never start before the page is gone.
      // The server drops it if an older PUT from this tab lands after it.
      const sent = keepalive ? start() : queue.current.then(start);
      queue.current = Promise.all([queue.current, sent]).catch(() => {});
      return sent;
    },
    [n],
  );

  const savedJsonRef = useRef(JSON.stringify(data.edits));
  // The action that started last owns the notice. A save that returns after
  // Reset still records its edits, and it does not put its notice back.
  const statusEpoch = useRef(0);
  const autosaveUncertainRef = useRef(false);
  const savingJsonRef = useRef<string | null>(null);
  const postingJsonRef = useRef<string | null>(null);
  const tabRef = useRef(Math.random().toString(36).slice(2, 12));
  const revRef = useRef(0);
  const [, rerender] = useState(0);
  const showStatus = useCallback(() => rerender((n) => n + 1), []);

  const putEdits = useCallback(
    (payload: StudioEdits, keepalive: boolean) => {
      const serialized = JSON.stringify(payload);
      const inflight = inflightEdits(savingJsonRef.current, postingJsonRef.current, serialized);
      if (!shouldSendEdits(savedJsonRef.current, serialized, inflight, keepalive, autosaveUncertainRef.current)) return;
      savingJsonRef.current = serialized;
      showStatus();
      revRef.current += 1;
      send("PUT", { edits: payload, tab: tabRef.current, rev: revRef.current }, keepalive)
        .then((r) => {
          if (savingJsonRef.current !== serialized) return;
          savingJsonRef.current = null;
          if (!r.ok) {
            setAutosaveError(r.status === 409 ? STALE : "Autosave failed. Your latest changes are not saved yet.");
            showStatus();
            return;
          }
          // The server now holds this payload. If the edits moved on, even back
          // to what was saved before it, send them.
          const latest = JSON.stringify(editsRef.current);
          setAutosaveError(null);
          savedJsonRef.current = serialized;
          autosaveUncertainRef.current = false;
          if (latest !== serialized) putEdits(editsRef.current, keepalive);
          showStatus();
        })
        .catch(() => {
          if (savingJsonRef.current === serialized) savingJsonRef.current = null;
          // The response was lost, so the server may already hold this payload.
          // Do not send again from here. The next edit or page exit does.
          autosaveUncertainRef.current = true;
          setAutosaveError("Autosave failed. Is the dashboard still running?");
          showStatus();
        });
    },
    [showStatus, send],
  );

  useEffect(() => {
    const flush = () => putEdits(editsRef.current, true);
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [putEdits]);

  useEffect(() => {
    const serialized = JSON.stringify(edits);
    const sameAsSaved = !autosaveUncertainRef.current && serialized === savedJsonRef.current;
    if (sameAsSaved || serialized === savingJsonRef.current || serialized === postingJsonRef.current) return;
    setSave((s) => (s.kind === "saved" || s.kind === "outdated" ? { kind: "idle" } : s));
    const timer = setTimeout(() => putEdits(edits, false), 500);
    return () => clearTimeout(timer);
  }, [edits, putEdits]);

  const editsJson = JSON.stringify(edits);
  const editStatus = editSaveStatus(savedJsonRef.current, editsJson, savingJsonRef.current, postingJsonRef.current, autosaveUncertainRef.current, pdfRejected);

  const saveForApply = useCallback(async () => {
    statusEpoch.current += 1;
    const epoch = statusEpoch.current;
    const publishStatus = (next: SaveState) => {
      if (ownsStatus(epoch, statusEpoch.current)) setSave(next);
    };
    const publishRejected = (rejected: boolean) => {
      if (ownsStatus(epoch, statusEpoch.current)) setPdfRejected(rejected);
    };
    publishStatus({ kind: "saving" });
    const sent = edits;
    const serialized = JSON.stringify(sent);
    // Save for apply writes this payload before it renders. Undo can put the
    // screen back while the request is still out, and the page-exit flush has
    // to see that payload or it will skip the restored edits.
    postingJsonRef.current = serialized;
    try {
      revRef.current += 1;
      const r = await send("POST", { op: "save", edits: sent, tab: tabRef.current, rev: revRef.current });
      const body = (await r.json()) as { pdf?: string; indexed?: boolean; warnings?: string[]; error?: string; superseded?: boolean };
      const wrote = postWroteEdits(r.status, body.superseded === true, body.error);
      // Drop the in-flight Save for apply before the follow-up PUT. Otherwise
      // the same payload looks like it is already on the wire and is skipped.
      if (postingJsonRef.current === serialized) postingJsonRef.current = null;
      if (wrote) {
        savedJsonRef.current = serialized;
        autosaveUncertainRef.current = false;
        setAutosaveError(null);
      }
      if (shouldPutAfterPost(wrote, serialized, JSON.stringify(editsRef.current))) putEdits(editsRef.current, false);
      if (body.superseded) {
        publishStatus({ kind: "failed", error: "A newer edit was saved while this one was sending. Save again to export the latest." });
        return;
      }
      if (!r.ok || !body.pdf) {
        publishRejected(true);
        publishStatus({ kind: "failed", error: SAVE_ERRORS[body.error ?? ""] ?? body.error ?? "Saving failed." });
      } else if (latestEdits.current !== sent) {
        publishRejected(false);
        publishStatus({ kind: "outdated", pdf: body.pdf });
      } else {
        publishRejected(false);
        publishStatus({ kind: "saved", pdf: body.pdf, indexed: body.indexed === true, warnings: body.warnings ?? [] });
      }
    } catch {
      // The response never arrived. The server may already have stored this
      // payload. Send the screen even when it still matches that payload, so a
      // later undo is measured against the write that may have landed.
      putEdits(editsRef.current, true);
      if (postingJsonRef.current === serialized) postingJsonRef.current = null;
      publishStatus({ kind: "failed", error: "Saving failed. Is the dashboard still running?" });
    }
  }, [edits, putEdits, send]);

  useEffect(() => {
    const undoShortcut = (event: KeyboardEvent) => {
      if (!isStudioUndoKey(event)) return;
      const target = event.target;
      if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement || (target instanceof HTMLElement && target.isContentEditable)) return;
      event.preventDefault();
      undo();
    };
    window.addEventListener("keydown", undoShortcut);
    return () => window.removeEventListener("keydown", undoShortcut);
  }, [undo]);

  const resetStudio = useCallback(() => {
    statusEpoch.current += 1;
    const epoch = statusEpoch.current;
    recordEdit({ type: "reset" });
    setSave({ kind: "idle" });
    void send("POST", { op: "restore-full-pdf" }).then(async (r) => {
      if (!ownsStatus(epoch, statusEpoch.current)) return;
      if (!r.ok) throw new Error("restore-full-pdf failed");
      const body = (await r.json().catch(() => ({}))) as { restored?: boolean; reason?: string };
      if (!ownsStatus(epoch, statusEpoch.current)) return;
      if (body.reason === "missing") {
        setSave({ kind: "failed", error: "Reset cleared the preview. Apply still has the shortened PDF, because the full PDF is not on disk." });
        return;
      }
      setPdfRejected(false);
      setSave({ kind: "idle" });
    }).catch(() => {
      if (!ownsStatus(epoch, statusEpoch.current)) return;
      setSave({ kind: "failed", error: "Reset cleared the preview. Apply may still have the shortened PDF." });
    });
  }, [recordEdit, send]);

  // Fork: lines Miao wrote from scratch that she has not marked "Looks good" yet.
  const checkKey = `miao:cv-checked:${n}:${doc.sourceHash}`;
  const [checked, setChecked] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(checkKey) ?? "[]") as string[]); } catch { return new Set(); }
  });
  const onCheck = useCallback((id: string) => {
    setChecked((prev) => {
      const next = new Set(prev).add(id);
      try { localStorage.setItem(checkKey, JSON.stringify([...next])); } catch { /* storage blocked */ }
      return next;
    });
  }, [checkKey]);
  const toCheck = doc.sections
    .filter((sec) => !isSummarySection(sec.title) && !resolved.view.hidden.has(sec.id))
    .flatMap((sec) => sec.items.filter((it) => !resolved.view.hidden.has(it.id)).flatMap((it) => it.bullets))
    .filter((b) => needsCheck(b, bulletShown(b, edits).source, false) && !checked.has(b.id) && !resolved.view.hidden.has(b.id));
  const jumpToNext = () => {
    const el = document.querySelector<HTMLElement>("[data-check]");
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    el?.animate([{ boxShadow: "0 0 0 3px rgb(251 191 36 / .5)" }, { boxShadow: "0 0 0 0 transparent" }], { duration: 900 });
  };

  const changed = doc.sections.flatMap((s) => s.items.flatMap((i) => i.bullets)).filter((b) => b.change !== "same").length;
  const pdfHref = `/api/cv-pdf?n=${encodeURIComponent(data.reportNum)}`;

  return (
    <>
      <header className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Your CV for {data.company}</h1>
          <p className="mt-1 text-sm text-muted">
            Miao changed {changed} {changed === 1 ? "line" : "lines"} from your base CV.
          </p>
          {toCheck.length > 0 ? (
            <button
              type="button"
              onClick={jumpToNext}
              className="mt-3 inline-flex items-center gap-2 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-sm font-medium text-amber-900 transition-colors hover:bg-amber-100"
            >
              <span className="size-2 rounded-full bg-amber-400" />
              {toCheck.length} {toCheck.length === 1 ? "line" : "lines"} not from your CV
            </button>
          ) : (
            <p className="mt-3 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-800">
              <Check className="size-3.5" /> Every line checked
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <p role="status" className="sr-only">{editStatus}</p>
          <Tip label="Undo last change">
            <button type="button" onClick={undo} disabled={!canUndo} aria-label="Undo" className={iconBtn}>
              <Undo2 className="size-4" />
            </button>
          </Tip>
          <Tip label="Start over from Miao's version">
            <button
              type="button"
              aria-label="Start over"
              onClick={() => { if (window.confirm("Throw away all your changes and go back to Miao's version?")) resetStudio(); }}
              className={iconBtn}
            >
              <RotateCcw className="size-4" />
            </button>
          </Tip>
          <Tip label={save.kind === "saved" ? "Saved as PDF" : "Save CV as PDF"} align="end">
            <button
              onClick={saveForApply}
              disabled={save.kind === "saving"}
              aria-label="Save CV"
              className="inline-flex size-9 items-center justify-center rounded-xl bg-brand text-brand-foreground shadow-sm transition-all hover:-translate-y-px hover:bg-brand-200 active:translate-y-0 active:scale-95 disabled:opacity-60 max-sm:size-11"
            >
              {save.kind === "saving" ? <Loader2 className="size-4 animate-spin" /> : save.kind === "saved" ? <Check className="size-4" strokeWidth={2.5} /> : <Save className="size-4" />}
            </button>
          </Tip>
        </div>
      </header>

      {data.stale && <Notice tone="warn">This CV was regenerated since your last visit, so earlier edits were cleared.</Notice>}
      {!data.hasBase && <Notice tone="warn">No cv.md found, so changes cannot be compared with your base CV.</Notice>}
      {save.kind === "saved" && (
        <Notice tone={save.indexed ? "ok" : "warn"}>
          {save.indexed ? (
            <>
              Saved.{" "}
              <a href={pdfHref} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium underline">
                <FileText className="size-3.5" /> Open the PDF
              </a>
            </>
          ) : (
            <>Saved {save.pdf}, but data/pdf-index.tsv was not updated, so Apply still uploads the earlier PDF.</>
          )}
        </Notice>
      )}
      {save.kind === "saved" && <DoubleCheck items={friendlyWarnings(save.warnings)} />}
      {save.kind === "outdated" && (
        <Notice tone="warn">Saved {save.pdf} from the CV as it was when you clicked Save. You changed it since, so save again.</Notice>
      )}
      {save.kind === "failed" && <Notice tone="error">{save.error}</Notice>}
      {autosaveError && <Notice tone="error">{autosaveError}</Notice>}

      <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <CoverageMeter coverage={resolved.coverage} dropped={dropped} />
          {arrange(doc.sections, edits.order.root).map((s, k, all) => (
            <SectionCard key={s.id} n={n} section={s} edits={edits} hidden={resolved.view.hidden} dispatch={recordEdit} checked={checked} onCheck={onCheck} siblings={all.map((x) => x.id)} first={k === 0} last={k === all.length - 1} />
          ))}
        </div>
        <div className="lg:sticky lg:top-4 lg:self-start">
          <CvPreview html={html} pdfHref={pdfHref} />
        </div>
      </div>
    </>
  );
}

function Notice({ tone, children }: { tone: "ok" | "warn" | "error"; children: React.ReactNode }) {
  const styles = {
    ok: "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300",
    warn: "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300",
    error: "border-red-500/40 bg-red-500/10 text-red-800 dark:text-red-300",
  }[tone];
  return <div role={tone === "error" ? "alert" : "status"} className={cn("mt-4 rounded-xl border px-4 py-2.5 text-sm", styles)}>{children}</div>;
}

// Fork: the save-time fact check, in plain words.
function DoubleCheck({ items }: { items: FriendlyItem[] }) {
  if (!items.length) return null;
  return (
    <div role="status" className="mt-3 rounded-xl border border-amber-300/70 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      <p className="font-medium">
        {items.length === 1 ? "1 thing" : `${items.length} things`} to double-check before you send it
      </p>
      <ul className="mt-2 space-y-2">
        {items.map((it, i) => (
          <li key={i} className="flex gap-2">
            <span className="mt-2 size-1.5 shrink-0 rounded-full bg-amber-500" />
            <div className="min-w-0">
              {it.kind === "differs" && (
                <>
                  <p>This line says more than your CV:</p>
                  <p className="mt-0.5 text-amber-900/80">&ldquo;{it.cv}&rdquo;</p>
                  <p className="mt-1 text-xs text-amber-900/70">Your CV says: &ldquo;{it.source}&rdquo;</p>
                </>
              )}
              {it.kind === "skills" && (
                <p>
                  Skills Miao added that are not in your CV: <span className="font-medium">{it.names.join(", ")}</span>. Keep them only if they fit you.
                </p>
              )}
              {it.kind === "other" && <p>{it.text}</p>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
