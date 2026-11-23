// Runs outlive the request that started them (run-hub.mjs): a reload or a
// second device replays the log and follows the live tail.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { cancelRun, setCancel, createRun, endRun, listRuns, publish, resetRunHub, runResponseStream, subscribe } from "../../src/lib/run-hub.mjs";
import { reconcileJobs } from "../../src/lib/jobs-persist.mjs";

beforeEach(() => resetRunHub());

async function readAll(stream) {
  const reader = stream.getReader();
  const dec = new TextDecoder();
  let out = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return out.trim().split("\n").map((l) => JSON.parse(l));
    out += dec.decode(value);
  }
}

test("a late subscriber gets the replay, then the live tail, then the end", () => {
  createRun({ id: "r1" });
  publish("r1", { type: "status", label: "a" });
  publish("r1", { type: "text", text: "he" });
  publish("r1", { type: "text", text: "llo" });
  const seen = [];
  subscribe("r1", (ev) => seen.push(ev));
  publish("r1", { type: "keepalive" });
  publish("r1", { type: "done" });
  endRun("r1");
  assert.deepEqual(seen, [
    { type: "status", label: "a" },
    { type: "text", text: "hello" },
    { type: "keepalive" },
    { type: "done" },
    null,
  ]);
  assert.equal(listRuns()[0].status, "done");
});

test("cancelling a response stream does not stop the run", async () => {
  createRun({ id: "r2" });
  const s = runResponseStream("r2", null, 60_000);
  const reader = s.getReader();
  publish("r2", { type: "status", label: "x" });
  await reader.read();
  await reader.cancel();
  publish("r2", { type: "done" });
  endRun("r2");
  const events = await readAll(runResponseStream("r2"));
  assert.deepEqual(events, [{ type: "status", label: "x" }, { type: "done" }]);
});

test("an ended run with no verdict is an error; cancel calls the registered stop", () => {
  createRun({ id: "r3" });
  let stopped = false;
  assert.equal(cancelRun("r3"), false, "nothing to stop yet");
  setCancel("r3", () => { stopped = true; });
  assert.equal(cancelRun("r3"), true);
  assert.equal(stopped, true);
  endRun("r3");
  assert.equal(listRuns()[0].status, "error");
  assert.equal(cancelRun("r3"), false, "an ended run cannot be cancelled");
});

test("a run alive when the server stopped is reported as interrupted", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "run-hub-"));
  createRun({ id: "r4", dir, meta: { title: "T" } });
  publish("r4", { type: "status", label: "working" });
  resetRunHub(); // simulate a new server process
  const [run] = listRuns(dir);
  assert.equal(run.id, "r4");
  assert.equal(run.status, "error");
  assert.equal(run.meta.title, "T");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("reconcileJobs reattaches, adopts and interrupts", () => {
  const local = [
    { id: "a", status: "running", steps: [] }, // server still has it
    { id: "b", status: "running", steps: [] }, // server lost it
    { id: "c", status: "done", steps: [] },
    { id: "d", status: "error", steps: [] }, // dropped connection, still running server-side
  ];
  const server = [
    { id: "a", status: "running", startedAt: 1 },
    { id: "c", status: "done", startedAt: 1 },
    { id: "d", status: "running", startedAt: 1 },
    { id: "e", status: "running", startedAt: 2, meta: { title: "From phone", kind: "evaluate" } },
    { id: "f", status: "done", startedAt: 2 },
  ];
  const { jobs, attach, changed } = reconcileJobs(local, server, { now: 9, initial: true, following: new Set(), removed: new Set() });
  assert.equal(changed, true);
  assert.deepEqual(attach.sort(), ["a", "d", "e"]);
  const by = Object.fromEntries(jobs.map((j) => [j.id, j]));
  assert.equal(by.b.status, "error");
  assert.equal(by.d.status, "running");
  assert.equal(by.e.title, "From phone");
  assert.equal(by.f, undefined, "a finished run never seen here is not adopted");
  const again = reconcileJobs(jobs, server, { now: 9, initial: false, following: new Set(["a", "d", "e"]), removed: new Set() });
  assert.equal(again.changed, false);
});
