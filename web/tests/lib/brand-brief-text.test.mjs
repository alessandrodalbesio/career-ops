// Fork: tests for splitting a brand briefing into the briefing and its questions.
import { test } from "node:test";
import assert from "node:assert/strict";
import { briefingQuestions, briefingText, splitQuestion } from "../../src/lib/brand-brief-text.mjs";

const ANSWER = `I looked them up.

## Brand briefing

- **Values:** care (from their site)

## Questions for your letter

1. **The hook moment:** Is there a Nivea moment you remember?
2. **The brand today:** Do you use any Nivea product today?
3. **The value link:** Is there a small daily ritual of care?
4. **The wink:** How many creams live in your bag?

VERDICT: 5/5 — care, closeness, trust`;

test("briefingText: keeps only the briefing", () => {
  assert.equal(briefingText(ANSWER), "- **Values:** care (from their site)");
});

test("briefingQuestions: maps each question to its form field", () => {
  assert.deepEqual(briefingQuestions(ANSWER), {
    hook: "Is there a Nivea moment you remember?",
    today: "Do you use any Nivea product today?",
    value: "Is there a small daily ritual of care?",
    wink: "How many creams live in your bag?",
  });
});

test("briefingQuestions: an answer with no questions gives none", () => {
  assert.deepEqual(briefingQuestions("## Brand briefing\n- x"), {});
});

test("splitQuestion: separates the examples, keeping commas inside parentheses", () => {
  assert.deepEqual(
    splitQuestion("Is there a Nivea moment you remember? For example, the blue tin at home (whose was it, where was it kept?), or sunscreen on the beach."),
    { question: "Is there a Nivea moment you remember?", examples: ["The blue tin at home (whose was it, where was it kept?)", "Sunscreen on the beach"] },
  );
});

test("splitQuestion: reads the pipe-separated format newer briefings use", () => {
  assert.deepEqual(splitQuestion("Q? | A | B"), { question: "Q?", examples: ["A", "B"] });
});

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readBrandBrief, saveBrandBrief } from "../../src/lib/brand-brief-store.mjs";
import { buildPrompt } from "../../src/lib/run-prompts.mjs";

test("brand brief store: saves per report and refuses text that is not a briefing", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "brief-"));
  assert.equal(saveBrandBrief(root, "19", "no briefing here"), false);
  assert.equal(saveBrandBrief(root, "../x", ANSWER), false);
  assert.equal(saveBrandBrief(root, "019", ANSWER), true);
  assert.equal(readBrandBrief(root, "19").text.trim(), ANSWER);
  assert.equal(readBrandBrief(root, "20"), null);
});

test("cover prompt: reuses a saved briefing instead of researching again", () => {
  const args = { kind: "cover", input: "19", memory: "", today: "2026-11-24", reportFile: "reports/019-x.md", coverBrief: { hook: "a", today: "b", value: "c", wink: "", tone: "conversational" } };
  const withBrief = buildPrompt({ ...args, brandBrief: ANSWER });
  assert.match(withBrief, /instead of searching the web again/);
  assert.ok(withBrief.includes("care (from their site)"));
  assert.ok(!withBrief.includes("How many creams live in your bag"), "the questions stay out; only the briefing goes in");
  assert.doesNotMatch(buildPrompt(args), /instead of searching the web again/);
});
