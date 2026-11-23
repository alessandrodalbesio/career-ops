// When the worker job list is written to localStorage.
//
// Every streamed chunk of a running job's output replaces the job list, and the
// provider used to serialize and store up to 40 jobs on each one, so a long
// evaluation rewrote the whole list hundreds of times. The stored copy only has
// to survive a reload, so while a job runs one write per `delayMs` is enough.
// A list with nothing running is written at once, because that is the state a
// reload must not lose (a job just finished or was removed), and `flush()`
// covers a page that goes away mid-stream.

/**
 * @template T
 * @param {object} options
 * @param {(jobs: T[]) => void} options.write - Store the list (the caller handles quota errors).
 * @param {(jobs: T[]) => boolean} options.isActive - True while any job is still running.
 * @param {number} [options.delayMs=1000] - At most one write per this many ms while active.
 * @param {(fn: () => void, ms: number) => unknown} [options.setTimer]
 * @param {(handle: unknown) => void} [options.clearTimer]
 */
export function createJobsPersister({ write, isActive, delayMs = 1000, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let pending = null; // the latest list not yet written, or null
  let timer = null;

  const writePending = () => {
    if (timer !== null) {
      clearTimer(timer);
      timer = null;
    }
    if (pending === null) return;
    const jobs = pending;
    pending = null;
    write(jobs);
  };

  return {
    /** Record the current list; written now if nothing runs, else within delayMs. */
    save(jobs) {
      pending = jobs;
      if (!isActive(jobs)) {
        writePending();
        return;
      }
      if (timer === null) timer = setTimer(writePending, delayMs);
    },
    /** Write whatever is pending now (page hide, unmount). */
    flush: writePending,
  };
}

export function restoreStoredJobs(stored, now) {
  if (!Array.isArray(stored)) return [];
  return stored.map((job) => {
    if (job?.status !== "running") return job;
    const steps = Array.isArray(job.steps) ? job.steps : [];
    return {
      ...job,
      status: "error",
      steps: [...steps, { kind: "status", label: "Interrupted (page reloaded)", ts: now }],
    };
  });
}

export function saveJobsAfterOpen(persister, ready, jobs) {
  if (!ready || !persister) return;
  persister.save(jobs);
}

/**
 * Merge the browser's job list with the runs the server knows (/api/runs/live).
 * Runs live on the server now (run-hub.mjs), so a reload no longer kills them:
 * a local "running" job the server still has is reattached, a server run this
 * browser never saw (started on another device) is adopted while it runs, and
 * only a running job the server has lost (restart) is marked interrupted.
 *
 * @template {{ id: string, status: string, steps?: unknown[] }} T
 * @param {T[]} local
 * @param {{ id: string, status: string, meta?: Record<string, any>, startedAt: number }[]} serverRuns
 * @param {{ now: number, initial: boolean, following: Set<string>, removed: Set<string> }} opts
 * @returns {{ jobs: T[], attach: string[], changed: boolean }}
 */
export function reconcileJobs(local, serverRuns, { now, initial, following, removed }) {
  const server = new Map(serverRuns.map((r) => [r.id, r]));
  /** @type {string[]} */
  const attach = [];
  let changed = false;
  let jobs = local.map((job) => {
    const run = server.get(job.id);
    if (!run) {
      // Only a reload can strand a job; a job started on this page is followed.
      if (!initial || job.status !== "running" || following.has(job.id)) return job;
      changed = true;
      return restoreStoredJobs([job], now)[0];
    }
    if (following.has(job.id)) return job;
    // Still running, or finished while nobody watched: replay it.
    if (run.status === "running" || job.status === "running") {
      attach.push(job.id);
      changed = true;
      return job.status === "running" ? job : { ...job, status: "running", endedAt: undefined };
    }
    return job;
  });
  const known = new Set(local.map((j) => j.id));
  const adopted = serverRuns
    .filter((r) => r.status === "running" && !known.has(r.id) && !removed.has(r.id) && !following.has(r.id))
    .map((r) => {
      const m = r.meta ?? {};
      attach.push(r.id);
      return /** @type {T} */ (/** @type {unknown} */ ({
        id: r.id,
        title: typeof m.title === "string" ? m.title : `${m.kind ?? "Run"}`,
        subtitle: typeof m.subtitle === "string" ? m.subtitle : undefined,
        page: typeof m.page === "string" ? m.page : undefined,
        input: typeof m.input === "string" ? m.input : undefined,
        kind: typeof m.kind === "string" ? m.kind : undefined,
        batchId: typeof m.batchId === "string" ? m.batchId : undefined,
        evaluationSections: Array.isArray(m.evaluationSections) ? m.evaluationSections : undefined,
        brief: m.brief && typeof m.brief === "object" ? m.brief : undefined,
        status: "running",
        steps: [],
        text: "",
        startedAt: r.startedAt,
      }));
    });
  if (adopted.length) {
    jobs = [...adopted, ...jobs];
    changed = true;
  }
  return { jobs, attach, changed };
}
