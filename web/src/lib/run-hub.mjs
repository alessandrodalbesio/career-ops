// Server-side registry of dashboard runs (evaluate, pdf, cover...), so a run
// outlives the browser request that started it.
//
// /api/run used to kill its CLI child when the client disconnected, and the
// browser kept the only record of the run, so reloading or closing the tab lost
// a several-minute evaluation. Now the route publishes every NDJSON event here;
// any number of HTTP streams subscribe (the starting request, a reloaded tab, a
// phone), each getting a replay of the events so far and then the live tail.
//
// The registry is held on globalThis (one per Node process, surviving dev HMR)
// and mirrored to <dataRoot>/.career-ops-web/runs/live/{id}.json, so a run that
// finished while nobody watched can still be replayed, and a run that was alive
// when the server stopped is reported as interrupted rather than running forever.

import fs from "node:fs";
import path from "node:path";

const TERMINAL = new Set(["done", "error", "gated"]);
const KEEP_MS = 7 * 24 * 60 * 60 * 1000;
const PERSIST_DELAY_MS = 1000;

/** @returns {{ runs: Map<string, any>, loadedDirs: Set<string> }} */
function state() {
  const g = /** @type {any} */ (globalThis);
  if (!g.__careerOpsRunHub) g.__careerOpsRunHub = { runs: new Map(), loadedDirs: new Set() };
  return g.__careerOpsRunHub;
}

export function runsDir(root) {
  return path.join(root, ".career-ops-web", "runs", "live");
}

/** Ids come from the browser: keep them to a safe filename alphabet. */
export function safeRunId(id) {
  const s = String(id ?? "").replace(/[^a-z0-9_-]/gi, "").slice(0, 80);
  return s || null;
}

function snapshot(run) {
  return { id: run.id, meta: run.meta, status: run.status, startedAt: run.startedAt, endedAt: run.endedAt ?? null, events: run.events };
}

function persistNow(run) {
  if (run.timer) { clearTimeout(run.timer); run.timer = null; }
  if (!run.dir) return;
  try {
    fs.mkdirSync(run.dir, { recursive: true });
    const file = path.join(run.dir, `${run.id}.json`);
    fs.writeFileSync(`${file}.tmp`, JSON.stringify(snapshot(run)));
    fs.renameSync(`${file}.tmp`, file);
  } catch {
    // The live run still works from memory; only reload-after-restart is lost.
  }
}

function persistSoon(run) {
  if (run.timer || !run.dir) return;
  run.timer = setTimeout(() => persistNow(run), PERSIST_DELAY_MS);
  run.timer.unref?.();
}

/** Load runs persisted by an earlier server process (once per data dir). */
/** @param {string | null} dir @param {number} now */
function loadDir(dir, now) {
  const st = state();
  if (!dir || st.loadedDirs.has(dir)) return;
  st.loadedDirs.add(dir);
  /** @type {string[]} */
  let names = [];
  try { names = fs.readdirSync(dir).filter((n) => n.endsWith(".json")); } catch { return; }
  for (const name of names) {
    const file = path.join(dir, name);
    let data;
    try { data = JSON.parse(fs.readFileSync(file, "utf8")); } catch { continue; }
    const id = safeRunId(data?.id);
    if (!id || st.runs.has(id)) continue;
    if (now - (data.endedAt || data.startedAt || 0) > KEEP_MS) {
      try { fs.rmSync(file, { force: true }); } catch { /* */ }
      continue;
    }
    const run = {
      id, dir, meta: data.meta ?? {}, status: data.status, startedAt: data.startedAt, endedAt: data.endedAt ?? undefined,
      events: Array.isArray(data.events) ? data.events : [], subscribers: new Set(), cancel: null, timer: null, ended: true,
    };
    if (run.status === "running") {
      // Its process died with the previous server.
      run.events.push({ type: "error", msg: "Interrupted (the server restarted while this run was in progress)" });
      run.status = "error";
      run.endedAt = now;
      persistNow(run);
    }
    st.runs.set(id, run);
  }
}

/**
 * Register a new run. `dir` is runsDir(dataRoot), or null to keep it in memory only.
 * @param {{ id: string, meta?: Record<string, unknown>, dir?: string | null, now?: number }} opts
 */
export function createRun({ id, meta = {}, dir = null, now = Date.now() }) {
  const st = state();
  loadDir(dir, now);
  const run = { id, dir, meta, status: "running", startedAt: now, endedAt: undefined, events: [], subscribers: new Set(), cancel: null, timer: null, ended: false };
  st.runs.set(id, run);
  persistNow(run);
  return run;
}

/** Append an event (keepalives are fanned out but not stored). */
export function publish(id, event) {
  const run = state().runs.get(id);
  if (!run || run.ended) return;
  if (event?.type !== "keepalive") {
    const last = run.events[run.events.length - 1];
    // Consecutive text deltas are merged so the stored log stays small.
    if (event?.type === "text" && last?.type === "text") last.text += event.text;
    else run.events.push(event?.type === "text" ? { ...event } : event);
    if (run.status === "running" && TERMINAL.has(event?.type)) run.status = event.type;
    persistSoon(run);
  }
  for (const fn of run.subscribers) {
    try { fn(event); } catch { /* a broken subscriber must not stop the run */ }
  }
}

/** The run is over: no more events. Closes every subscriber. */
export function endRun(id, now = Date.now()) {
  const run = state().runs.get(id);
  if (!run || run.ended) return;
  run.ended = true;
  run.cancel = null;
  // A stream that ended with no verdict is a failure, same as readJobStream.
  if (run.status === "running") run.status = "error";
  run.endedAt = now;
  persistNow(run);
  for (const fn of run.subscribers) {
    try { fn(null); } catch { /* */ }
  }
  run.subscribers.clear();
}

/** Register how to stop the run (kills the CLI child). */
export function setCancel(id, fn) {
  const run = state().runs.get(id);
  if (run && !run.ended) run.cancel = fn;
}

export function cancelRun(id) {
  const run = state().runs.get(id);
  if (!run || run.ended || !run.cancel) return false;
  run.cancel();
  return true;
}

/**
 * Replay a run's events, then follow it live. `fn(null)` marks the end.
 * Returns an unsubscribe function, or null when the run is unknown.
 */
/** @param {string} id @param {(ev: any) => void} fn @param {string | null} [dir] */
export function subscribe(id, fn, dir = null) {
  loadDir(dir, Date.now());
  const run = state().runs.get(id);
  if (!run) return null;
  for (const ev of run.events) fn(ev);
  if (run.ended) {
    fn(null);
    return () => {};
  }
  run.subscribers.add(fn);
  return () => run.subscribers.delete(fn);
}

/** Summaries, newest first. */
/** @param {string | null} [dir] @param {number} [now] */
export function listRuns(dir = null, now = Date.now()) {
  loadDir(dir, now);
  return [...state().runs.values()]
    .filter((r) => !dir || r.dir === dir)
    .map((r) => ({ id: r.id, meta: r.meta, status: r.status, startedAt: r.startedAt, endedAt: r.endedAt ?? null }))
    .sort((a, b) => b.startedAt - a.startedAt);
}

export function hasRun(id) {
  return state().runs.has(id);
}

/** Tests only. */
export function resetRunHub() {
  const st = state();
  for (const r of st.runs.values()) if (r.timer) clearTimeout(r.timer);
  st.runs.clear();
  st.loadedDirs.clear();
}

/**
 * An NDJSON ReadableStream over a run: replay, then live, with its own
 * keepalive so proxies don't drop a quiet connection. Cancelling the stream
 * (client gone) only unsubscribes: the run keeps going.
 */
/** @param {string} id @param {string | null} [dir] @param {number} [keepaliveMs] @returns {ReadableStream<Uint8Array>} */
export function runResponseStream(id, dir = null, keepaliveMs = 10_000) {
  const enc = new TextEncoder();
  let unsubscribe = null;
  let heartbeat = null;
  let done = false;
  const stop = () => {
    done = true;
    if (heartbeat) clearInterval(heartbeat);
    unsubscribe?.();
  };
  return new ReadableStream({
    start(controller) {
      const write = (ev) => {
        if (done) return;
        if (ev === null) {
          stop();
          try { controller.close(); } catch { /* */ }
          return;
        }
        try {
          controller.enqueue(enc.encode(JSON.stringify(ev) + "\n"));
        } catch {
          stop();
        }
      };
      unsubscribe = subscribe(id, write, dir);
      if (unsubscribe === null) {
        write({ type: "error", msg: "This run is no longer known to the server." });
        write(null);
        return;
      }
      if (!done) heartbeat = setInterval(() => write({ type: "keepalive" }), keepaliveMs);
    },
    cancel() {
      stop();
    },
  });
}
