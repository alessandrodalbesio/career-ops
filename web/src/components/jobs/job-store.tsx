"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { scoreTone } from "@/lib/format";
import { resolveCliId } from "@/lib/saved-cli";
import { createWorkerFeedback } from "@/lib/worker-feedback.mjs";
import { readJobStream } from "@/lib/job-stream.mjs";
import { createJobsPersister, reconcileJobs, restoreStoredJobs, saveJobsAfterOpen } from "@/lib/jobs-persist.mjs";
import type { EVALUATION_GATE_REASONS } from "@/lib/evaluation-gate.mjs";
import { createRunSlots, DEFAULT_MAX_PARALLEL_RUNS, MAX_PARALLEL_RUNS_KEY, parseMaxParallelRuns } from "@/lib/run-slots.mjs";

export type JobStep = { kind: "tool" | "status"; label: string; ts: number };
export type JobGate = { reason: (typeof EVALUATION_GATE_REASONS)[number]; message: string; confirmationRequired: boolean };
export type JobResult = { score: number | null; summary: string; tone: "good" | "warn" | "bad" | "muted" };

export type Job = {
  id: string;
  title: string;
  subtitle?: string;
  page?: string; // route the job was launched from / refers to
  input?: string; // the URL/posting it processed (links inbox rows to their worker)
  kind?: string;
  evaluationSections?: string[];
  // A cover run's answers to modes/cover.md Step 6, kept so a failed run still
  // shows them on its run page and refills the form (#7441). Read through
  // storedCoverBrief(): a job restored from localStorage may predate this.
  brief?: Record<string, string>;
  batchId?: string; // groups jobs fired together (e.g. "evaluate all Anthropic")
  status: "running" | "done" | "error" | "gated";
  gate?: JobGate;
  steps: JobStep[];
  text: string;
  result?: JobResult;
  cost?: { tokens: number; usd?: number }; // per-run token cost (Claude result event) — local only
  reportN?: number | null;
  startedAt: number;
  endedAt?: number;
};

type StartOpts = { title: string; subtitle?: string; kind: string; input: string; page?: string; batchId?: string; brief?: Record<string, string>; evaluationSections?: string[] };

type Ctx = {
  jobs: Job[];
  ready: boolean;
  startJob: (opts: StartOpts) => string | null;
  removeJob: (id: string) => void;
  /** Stop a running job on the server (its CLI is killed). */
  cancelJob: (id: string) => void;
  clearFinished: () => void;
};

const JobsContext = createContext<Ctx | null>(null);
export function useJobs() {
  const c = useContext(JobsContext);
  if (!c) throw new Error("useJobs must be used within <JobsProvider>");
  return c;
}

const JOBS_KEY = "career-ops:jobs";

function maxParallelRuns(): number {
  try {
    return parseMaxParallelRuns(localStorage.getItem(MAX_PARALLEL_RUNS_KEY));
  } catch {
    return DEFAULT_MAX_PARALLEL_RUNS;
  }
}
// One pool per tab, shared by every JobsProvider render.
const runSlots = createRunSlots(maxParallelRuns);

function parseVerdict(text: string): JobResult {
  const m = text.match(/VERDICT:\s*([\d.]+)\s*\/\s*5\s*[—:|-]+\s*(.+)/i);
  if (m) {
    const score = parseFloat(m[1]);
    return { score, summary: m[2].trim().replace(/\s+/g, " ").slice(0, 90), tone: scoreTone(`${score}`) };
  }
  const s = text.match(/\b([0-5](?:\.\d)?)\s*\/\s*5\b/);
  if (s) {
    const score = parseFloat(s[1]);
    return { score, summary: "", tone: scoreTone(`${score}`) };
  }
  return { score: null, summary: "", tone: "muted" };
}

export function JobsProvider({ children }: { children: React.ReactNode }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [ready, setReady] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const feedback = useRef<ReturnType<typeof createWorkerFeedback> | null>(null);
  useEffect(() => {
    const owner = createWorkerFeedback(setAnnouncement);
    feedback.current = owner;
    return () => { owner.dispose(); feedback.current = null; };
  }, []);
  const seq = useRef(0);
  const jobsRef = useRef<Job[]>([]);
  jobsRef.current = jobs;
  // Jobs whose server stream this tab is reading right now.
  const following = useRef(new Set<string>());
  // Jobs removed while queued for a run slot; they must never start.
  const removed = useRef(new Set<string>());

  // Restore first. setReady in this effect, and save only on a later render
  // where ready is already true. Saving from a ref flipped in this same
  // commit still sees the initial empty list and writes it over storage.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(JOBS_KEY);
      const arr = raw ? JSON.parse(raw) : null;
      // Running jobs stay running here: the server still owns them, and
      // reconcile() below reattaches or marks them interrupted.
      if (Array.isArray(arr)) {
        jobsRef.current = arr;
        setJobs(arr);
      }
    } catch {
      /* ignore */
    }
    setReady(true);
  }, []);

  // persist. Every streamed chunk replaces `jobs`, so writes go through the
  // persister: at once when nothing runs, at most once a second while a job
  // streams, and flushed when the page is hidden or the provider unmounts.
  const persister = useRef<ReturnType<typeof createJobsPersister<Job>> | null>(null);
  if (persister.current === null) {
    persister.current = createJobsPersister<Job>({
      write: (list) => {
        try {
          localStorage.setItem(JOBS_KEY, JSON.stringify(list.slice(0, 40)));
        } catch {
          /* quota */
        }
      },
      isActive: (list) => list.some((j) => j.status === "running"),
    });
  }
  useEffect(() => {
    const owner = persister.current;
    const flush = () => owner?.flush();
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, []);
  useEffect(() => {
    saveJobsAfterOpen(persister.current, ready, jobs);
  }, [jobs, ready]);

  const patch = useCallback((id: string, fn: (j: Job) => Job) => {
    setJobs((js) => js.map((j) => (j.id === id ? fn(j) : j)));
  }, []);


  // Read a run's NDJSON stream (the POST that started it, or a reattach to
  // /api/runs/live/[id]) into the job. Shared so a reloaded tab or another
  // device shows exactly what the starting tab would have.
  const follow = useCallback(
    async (job: Job, res: Response | null, steps: JobStep[]) => {
      const id = job.id;
      following.current.add(id);
      let text = "";
      let verdictLine = ""; // latched separately so the 8000-char tail can't drop it
      let doneTokens = 0; // per-run token cost, forwarded on the done event (#6)
      let doneCostUsd: number | null = null;
      let doneReportN: number | null = null;
      let finished = false;
      const finish = (status: "done" | "error" | "gated", lastLabel?: string, gate?: JobGate) => {
        if (finished) return;
        finished = true;
        feedback.current?.push({ ...job, status });
        const result = status === "done" ? parseVerdict(verdictLine || text) : undefined;
        const cost = status !== "error" && doneTokens > 0 ? { tokens: doneTokens, usd: doneCostUsd ?? undefined } : undefined;
        patch(id, (j) => ({
          ...j,
          status,
          gate,
          result,
          cost,
          reportN: doneReportN,
          endedAt: Date.now(),
          steps: lastLabel ? [...j.steps, { kind: "status", label: lastLabel, ts: Date.now() }] : j.steps,
        }));
        // persist a readable log file so the CLI/assistant can read past runs
        if (status === "done" || status === "gated") {
          fetch("/api/runs/save", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, title: job.title, subtitle: job.subtitle, page: job.page, input: job.input, status, gate, result, cost, steps, output: text }),
          }).catch(() => {});
          // Tell server-snapshot surfaces (Today, pipeline) to refetch — the
          // worker just wrote a real tracker row / report they don't yet see.
          if (status === "done" && typeof window !== "undefined" && (job.kind === "evaluate" || job.kind === "pdf")) {
            window.dispatchEvent(new CustomEvent("co-job-done", { detail: { kind: job.kind, input: job.input } }));
          }
        }
      };

      try {
        if (!res) {
          finish("error", "Connection error");
          return;
        }
        if (!res.ok || !res.body) {
          const e = await res.json().catch(() => ({}));
          finish("error", e.error || "Failed to start");
          return;
        }
        const completion = await readJobStream(res.body, (ev) => {
          if (ev.type === "tool") {
            steps.push({ kind: "tool", label: ev.name, ts: Date.now() });
            patch(id, (j) => ({ ...j, steps: [...j.steps, { kind: "tool", label: ev.name, ts: Date.now() }] }));
          } else if (ev.type === "status") {
            steps.push({ kind: "status", label: ev.label, ts: Date.now() });
            patch(id, (j) => ({ ...j, steps: [...j.steps, { kind: "status", label: ev.label, ts: Date.now() }] }));
          } else if (ev.type === "text") {
            const full = text + ev.text;
            const vm = full.match(/VERDICT:[^\n]*/i);
            if (vm) verdictLine = vm[0];
            text = full.slice(-8000);
            patch(id, (j) => ({ ...j, text }));
          }
        });
        if (completion.status === "error") {
          finish("error", completion.message);
          return;
        }
        doneTokens = completion.tokens ?? 0;
        doneCostUsd = completion.costUsd ?? null;
        if (completion.status === "gated") {
          finish("gated", "Evaluation stopped — review the reason", {
            reason: completion.reason,
            message: completion.message,
            confirmationRequired: completion.confirmationRequired,
          });
          return;
        }
        doneReportN = typeof completion.reportN === "number" ? completion.reportN : null;
        finish("done", "Done");
      } catch {
        finish("error", "Connection error");
      } finally {
        following.current.delete(id);
      }
    },
    [patch],
  );

  // Pick up runs the server holds: reattach this tab's own (after a reload or a
  // dropped connection) and adopt ones started on another device.
  const reconcile = useCallback(
    async (initial: boolean) => {
      let runs: { id: string; status: string; meta?: Record<string, unknown>; startedAt: number }[];
      try {
        const res = await fetch("/api/runs/live", { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        runs = (await res.json()).runs ?? [];
      } catch {
        // Server unreachable: a running job from before the reload can't be followed.
        if (initial) setJobs((js) => restoreStoredJobs(js, Date.now()));
        return;
      }
      const opts = { now: Date.now(), initial, following: new Set(following.current), removed: removed.current };
      const { jobs: next, attach, changed } = reconcileJobs(jobsRef.current, runs, opts);
      // Applied as an updater so stream patches queued meanwhile are kept.
      if (changed) setJobs((js) => reconcileJobs(js, runs, opts).jobs);
      for (const id of attach) {
        const job = next.find((j) => j.id === id);
        if (!job || following.current.has(id)) continue;
        following.current.add(id);
        // The replay carries the whole log again.
        patch(id, (j) => ({ ...j, status: "running", steps: [], text: "" }));
        const res = await fetch(`/api/runs/live/${encodeURIComponent(id)}`, { cache: "no-store" }).catch(() => null);
        void follow({ ...job, status: "running" }, res, []);
      }
    },
    [follow, patch],
  );

  useEffect(() => {
    if (!ready) return;
    void reconcile(true);
    const tick = () => {
      if (document.visibilityState === "visible") void reconcile(false);
    };
    const timer = setInterval(tick, 15_000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [ready, reconcile]);

  const startJob = useCallback(
    (opts: StartOpts): string | null => {
      const id = `job-${Date.now()}-${seq.current++}`;
      const job: Job = {
        id,
        title: opts.title,
        subtitle: opts.subtitle,
        page: opts.page,
        input: opts.input,
        kind: opts.kind,
        evaluationSections: opts.evaluationSections ? [...opts.evaluationSections] : undefined,
        brief: opts.brief ? { ...opts.brief } : undefined,
        batchId: opts.batchId,
        status: "running",
        steps: [{ kind: "status", label: "Starting…", ts: Date.now() }],
        text: "",
        startedAt: Date.now(),
      };
      setJobs((js) => [job, ...js]);
      // Ours from the start, so a reconcile never attaches a second reader.
      following.current.add(id);

      // Declared before resolveCliId() so its stale-CLI notice lands in the log
      // sent to /api/runs/save, not only in the live job.
      const steps: JobStep[] = [];
      (async () => {
        // Heavy runs wait for a free slot (run-slots.mjs), so a shortlist does
        // not start every evaluation at once.
        const release = await runSlots.acquire(opts.kind, (position) => {
          const step: JobStep = { kind: "status", label: `Queued: ${position} waiting (at most ${maxParallelRuns()} at once)`, ts: Date.now() };
          steps.push(step);
          patch(id, (j) => ({ ...j, steps: [...j.steps, step] }));
        });
        // Removed from the list while it waited: never start it.
        if (removed.current.has(id)) {
          removed.current.delete(id);
          following.current.delete(id);
          release();
          return;
        }
        try {
          // resolveCliId() validates the saved id against what is installed; a
          // bare readSavedCliId() here would short-circuit that check and launch
          // a run against an uninstalled CLI (#4012).
          // A stale saved id is replaced silently otherwise — name the switch in
          // the job log so a transient "not installed" can't rewrite the user's
          // choice without a record.
          const cliId = await resolveCliId((stale, replacement) => {
            const label = replacement
              ? `Saved CLI '${stale}' is not installed — using '${replacement}'`
              : `Saved CLI '${stale}' is not installed`;
            const step: JobStep = { kind: "status", label, ts: Date.now() };
            steps.push(step);
            patch(id, (j) => ({ ...j, steps: [...j.steps, step] }));
          });
          if (!cliId) {
            feedback.current?.push({ ...job, status: "error" });
            patch(id, (j) => ({
              ...j,
              status: "error",
              endedAt: Date.now(),
              steps: [...j.steps, { kind: "status", label: "No CLI configured — open Config and click Save config", ts: Date.now() }],
            }));
            return;
          }
          const res = await fetch("/api/run", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              kind: opts.kind, input: opts.input, cliId, brief: opts.brief, evaluationSections: opts.evaluationSections,
              // The server keeps the run under this id, so a reload can find it again.
              runId: id,
              meta: { title: opts.title, subtitle: opts.subtitle, page: opts.page, batchId: opts.batchId, evaluationSections: opts.evaluationSections, brief: opts.brief },
            }),
          }).catch(() => null);
          await follow(job, res, steps);
        } finally {
          following.current.delete(id);
          release();
        }
      })();

      return id;
    },
    [patch, follow],
  );

  const cancelJob = useCallback((id: string) => {
    void fetch(`/api/runs/live/${encodeURIComponent(id)}/cancel`, { method: "POST" }).catch(() => {});
  }, []);

  const removeJob = useCallback((id: string) => {
    removed.current.add(id);
    // Runs live on the server now, so dismissing a running job must stop it,
    // or it would keep going (and writing the tracker) with no card to show it.
    if (jobsRef.current.some((j) => j.id === id && j.status === "running")) cancelJob(id);
    setJobs((js) => js.filter((j) => j.id !== id));
  }, [cancelJob]);
  const clearFinished = useCallback(() => setJobs((js) => js.filter((j) => j.status === "running")), []);

  // A new object only when the list or an action changes, not on every render
  // of this provider (the screen-reader announcement re-renders it too).
  const value = useMemo(() => ({ jobs, ready, startJob, removeJob, cancelJob, clearFinished }), [jobs, ready, startJob, removeJob, cancelJob, clearFinished]);

  return (
    <JobsContext.Provider value={value}>
      {children}
      <div role="status" aria-label="Worker task status" aria-live="polite" aria-atomic="true" className="sr-only">{announcement}</div>
    </JobsContext.Provider>
  );
}
