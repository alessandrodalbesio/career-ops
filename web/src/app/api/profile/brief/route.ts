import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { careerOpsRoot } from "@/lib/career-ops";
import { atomicWriteWithBackup } from "@/lib/core/safe-write";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Fork: the triage brief (modes/_brief.md) — the short version of the profile
// that triage/scan scoring reads. GET reads it, PUT saves it, POST drafts a new
// one from the profile with Claude (returned only; nothing is saved until PUT).

const file = (name: string) => path.join(careerOpsRoot(), name);
const read = (name: string) => { try { return fs.readFileSync(file(name), "utf8"); } catch { return ""; } };
const BRIEF = "modes/_brief.md";

export async function GET() {
  return NextResponse.json({ text: read(BRIEF) });
}

export async function PUT(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { text?: unknown };
  if (typeof body.text !== "string" || !body.text.trim()) return NextResponse.json({ error: "The brief is empty." }, { status: 400 });
  try {
    atomicWriteWithBackup(file(BRIEF), body.text.replace(/\s+$/, "") + "\n");
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "The brief could not be saved." }, { status: 500 });
  }
}

const PROMPT = (profile: string, yml: string, brief: string) => `You rewrite a job-search triage brief so it matches the candidate's profile.

The brief is a short summary that a fast first-pass filter reads to score job postings. The profile is the source of truth.

Rules:
- Keep the brief's exact structure, headings and order.
- Update every fact that the profile states differently: archetypes, proof points, languages and levels, location policy and location scores, start date, comp, hard disqualifiers.
- Never invent facts that are in neither file.
- Keep the "Soft Red Flags" and "Priority Override List" sections exactly as they are in the current brief unless the profile contradicts them.
- Output ONLY the new brief as Markdown. No preamble, no code fence.

=== modes/_profile.md ===
${profile}

=== config/profile.yml ===
${yml}

=== current modes/_brief.md ===
${brief}
`;

export async function POST() {
  const prompt = PROMPT(read("modes/_profile.md"), read("config/profile.yml"), read(BRIEF));
  const denied = ["Write", "Edit", "MultiEdit", "NotebookEdit", "Bash", "Task", "WebFetch", "WebSearch", "Read", "Glob", "Grep"];
  try {
    const text = await new Promise<string>((resolve, reject) => {
      const child = spawn("claude", ["-p", "--output-format", "text", "--disallowedTools", ...denied], {
        cwd: careerOpsRoot(),
        stdio: ["pipe", "pipe", "pipe"],
      });
      let out = "";
      let err = "";
      const timer = setTimeout(() => { child.kill("SIGTERM"); reject(new Error("Took too long.")); }, 240_000);
      child.stdout.on("data", (d) => { out += d; });
      child.stderr.on("data", (d) => { err += d; });
      child.on("error", (e) => { clearTimeout(timer); reject(e); });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (code === 0 && out.trim()) resolve(out.trim().replace(/^```(?:markdown|md)?\n([\s\S]*)\n```$/, "$1"));
        else reject(new Error(err.trim().slice(0, 300) || `claude exited with ${code}`));
      });
      child.stdin.end(prompt);
    });
    return NextResponse.json({ text });
  } catch (e) {
    return NextResponse.json({ error: `Could not rebuild the brief: ${e instanceof Error ? e.message : "unknown error"}` }, { status: 500 });
  }
}
