// Fork: one automatic retry when the PDF fact gate blocks a tailored CV.
// The agent's CV JSON, the gate's message and cv.md go to the model (Opus, via
// runRewrite → cvRunEnv); it returns the same JSON with only the flagged lines
// fixed. The fixed JSON goes through the same build, fact check and render again.
import fs from "node:fs";
import path from "node:path";
import { careerOpsRoot } from "@/lib/career-ops";
import { runRewrite } from "@/lib/cv-studio/rewrite-run";

export const isFactGateError = (msg: string) => /Fact check failed/i.test(msg);
export const isOverflowError = (msg: string) => /the allowed maximum is \d+ pages?/i.test(msg);

const LENGTH_TASK = [
  "A tailored CV came out longer than one page. The message below says how many lines spill onto page 2 and where the spill starts. Make it fit on ONE page and return the corrected CV JSON.",
  "",
  "Cut only what is needed: the number of spilled lines plus one line of margin, no more. A 2-line spill usually means removing ONE bullet (a bullet that wraps to 2 lines). If the message gives no line count, cut about 3 lines.",
  "How to cut, in this order, stopping as soon as the target is reached:",
  "- If there are two projects, remove the less relevant one first. Always keep one project.",
  "- Then remove the bullet least relevant to the job (the job is described by the summary and the CV's focus); prefer a long one. Never take a job below 2 bullets or a project below 1.",
  "- Only as a last resort shorten the summary.",
  "Never change the wording of the lines you keep. Never add anything. Never remove contact details, job titles, employers, schools or dates. Keep the same JSON keys and structure.",
];

// Fork: lines whose last line holds only a word or two (cv-line-fit.mjs).
const LINES_TASK = [
  "In a tailored CV, some lines wrap so that their last line holds only a word or two, which wastes space and looks cut. The message below lists each one, with how many characters to cut or add. Rewrite ONLY those lines and return the corrected CV JSON.",
  "",
  "For each listed line:",
  "- Prefer cutting so the line takes one line less: tighten the wording, drop filler words (\"in order to\", \"various\", \"successfully\"), use a shorter synonym, shorten a list. Cut a few more characters than asked, for margin.",
  "- Keep the line's opening verb, every number exactly as written, its tools and the job keywords: the fact check compares each bullet with cv.md.",
  "- Only if cutting would lose the point, fill the last line instead, and only with wording or facts that cv.md already has for that same entry. Never invent.",
  "- For a skills line, drop or reorder the least relevant items rather than rewording them; items stay bare names exactly as cv.md writes them.",
  "Change nothing else. Never add a fact that is not in cv.md. Keep the same JSON keys and structure. The CV must still fit on one page, so never make it longer.",
];

function readSource(name: string): string {
  try {
    return fs.readFileSync(path.join(careerOpsRoot(), name), "utf8");
  } catch {
    return "";
  }
}

function extractJson(reply: string): Record<string, unknown> | null {
  const fenced = /<<cv-json>>([\s\S]*?)<<\/cv-json>>/.exec(reply)?.[1];
  const raw = fenced ?? reply.slice(reply.indexOf("{"), reply.lastIndexOf("}") + 1);
  try {
    const v = JSON.parse(raw.trim());
    return v && typeof v === "object" && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

export async function repairCvPayload(
  cliId: string,
  payload: Record<string, unknown>,
  gateError: string,
  problem: "facts" | "length" | "lines" = "facts",
): Promise<{ ok: true; payload: Record<string, unknown> } | { ok: false; detail: string }> {
  const digest = readSource("article-digest.md");
  const factTask = [
    "A tailored CV was blocked by a fact check. Fix ONLY what the fact check names and return the corrected CV JSON.",
    "",
    "How to fix each kind of problem:",
    "- drift (a bullet opens with a verb its cv.md bullet does not use, or two cv.md bullets were joined): rewrite that bullet so it starts with the cv.md bullet's own verb and restates ONE cv.md bullet. If two were joined, split them or keep only the stronger one.",
    "- tool / skill not in sources: make each skills item a bare name exactly as cv.md writes it, with no brackets or descriptions; remove a tool cv.md does not name.",
    "- award / employer / education / certification not in sources: that field must match cv.md word for word (e.g. an award title is only the role or prize name as cv.md writes it; move any description out of it or drop it).",
    "- metric not in sources: use the number exactly as cv.md states it, or remove it.",
    "Change nothing else. Never add a fact that is not in cv.md. Keep the same JSON keys and structure. The CV must still fit on one page, so never make it longer.",
  ];
  const prompt = [
    ...(problem === "length" ? LENGTH_TASK : problem === "lines" ? LINES_TASK : factTask),
    "",
    "Reply with the full corrected JSON between <<cv-json>> and <</cv-json>>, and nothing else.",
    "",
    problem === "length" ? "## Render message" : problem === "lines" ? "## Lines to fix" : "## Fact check message",
    gateError,
    "",
    "## cv.md",
    readSource("cv.md"),
    ...(digest.trim() ? ["", "## article-digest.md", digest] : []),
    "",
    "## CV JSON to fix",
    JSON.stringify(payload, null, 2),
  ].join("\n");
  const run = await runRewrite(cliId, prompt);
  if (!run.ok) return { ok: false, detail: run.detail ?? run.reason };
  const fixed = extractJson(run.reply);
  return fixed ? { ok: true, payload: fixed } : { ok: false, detail: "the fix did not come back as CV JSON" };
}
