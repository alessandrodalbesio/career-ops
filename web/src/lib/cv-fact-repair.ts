// Fork: one automatic retry when the PDF fact gate blocks a tailored CV.
// The agent's CV JSON, the gate's message and cv.md go to the model (Opus, via
// runRewrite → cvRunEnv); it returns the same JSON with only the flagged lines
// fixed. The fixed JSON goes through the same build, fact check and render again.
import fs from "node:fs";
import path from "node:path";
import { careerOpsRoot } from "@/lib/career-ops";
import { runRewrite } from "@/lib/cv-studio/rewrite-run";

export const isFactGateError = (msg: string) => /Fact check failed/i.test(msg);

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
): Promise<{ ok: true; payload: Record<string, unknown> } | { ok: false; detail: string }> {
  const digest = readSource("article-digest.md");
  const prompt = [
    "A tailored CV was blocked by a fact check. Fix ONLY what the fact check names and return the corrected CV JSON.",
    "",
    "How to fix each kind of problem:",
    "- drift (a bullet opens with a verb its cv.md bullet does not use, or two cv.md bullets were joined): rewrite that bullet so it starts with the cv.md bullet's own verb and restates ONE cv.md bullet. If two were joined, split them or keep only the stronger one.",
    "- tool / skill not in sources: make each skills item a bare name exactly as cv.md writes it, with no brackets or descriptions; remove a tool cv.md does not name.",
    "- award / employer / education / certification not in sources: that field must match cv.md word for word (e.g. an award title is only the role or prize name as cv.md writes it; move any description out of it or drop it).",
    "- metric not in sources: use the number exactly as cv.md states it, or remove it.",
    "Change nothing else. Never add a fact that is not in cv.md. Keep the same JSON keys and structure. The CV must still fit on one page, so never make it longer.",
    "",
    "Reply with the full corrected JSON between <<cv-json>> and <</cv-json>>, and nothing else.",
    "",
    "## Fact check message",
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
