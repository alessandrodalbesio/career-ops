import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { careerOpsRoot } from "@/lib/career-ops";
import { atomicWriteWithBackup } from "@/lib/core/safe-write";
import { RULE_GROUPS, adoptOtherRules, readRules, writeRules, type RuleGroupId } from "@/lib/profile-rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Fork: read and save Greta's rules for Miao (modes/_custom.md). Only the
// "## Rules from the Profile page" section is ever rewritten.

const customPath = () => path.join(careerOpsRoot(), "modes", "_custom.md");
const readText = () => { try { return fs.readFileSync(customPath(), "utf8"); } catch { return ""; } };

export async function GET() {
  let text = readText();
  // Rules written elsewhere in the file are moved into their group first, so
  // every rule is shown (and editable) in Cover letters / CVs / Everything.
  const adopted = adoptOtherRules(text);
  if (adopted.moved) {
    try {
      atomicWriteWithBackup(customPath(), adopted.text);
      text = adopted.text;
    } catch { /* show what is on disk */ }
  }
  return NextResponse.json({ groups: readRules(text) });
}

export async function PUT(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { group?: string; rules?: unknown };
  const group = RULE_GROUPS.find((g) => g.id === body.group)?.id as RuleGroupId | undefined;
  if (!group || !Array.isArray(body.rules)) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  const rules = body.rules.map((r) => String(r).replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 40).map((r) => r.slice(0, 3000));
  try {
    const text = readText() || "# Custom Instructions -- career-ops\n";
    const groups = { ...readRules(text), [group]: rules };
    const next = writeRules(text, groups);
    if (next !== text) {
      fs.mkdirSync(path.dirname(customPath()), { recursive: true });
      atomicWriteWithBackup(customPath(), next);
    }
    return NextResponse.json({ ok: true, rules });
  } catch {
    return NextResponse.json({ error: "Your rules could not be saved." }, { status: 500 });
  }
}
