import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { careerOpsRoot } from "@/lib/career-ops";
import { atomicWriteWithBackup } from "@/lib/core/safe-write";
import { readJsonObject } from "@/lib/json-body";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Fork: apply ONE change Miao proposed in the chat and the user approved
// ("Apply" on the card). Exact text in, exact text out: the old text must be
// in cv.md exactly once, so a stale or ambiguous proposal is refused instead of
// editing the wrong line. The previous cv.md is kept as a backup.

export async function POST(req: Request) {
  const body = await readJsonObject<{ find?: unknown; replace?: unknown }>(req);
  const find = typeof body?.find === "string" ? body.find : "";
  const replace = typeof body?.replace === "string" ? body.replace : null;
  if (!find.trim() || replace === null || find.length > 5000 || replace.length > 5000) {
    return NextResponse.json({ error: "This change is not valid." }, { status: 400 });
  }
  const file = path.join(careerOpsRoot(), "cv.md");
  let cv: string;
  try {
    cv = fs.readFileSync(file, "utf8");
  } catch {
    return NextResponse.json({ error: "Your CV could not be read." }, { status: 500 });
  }
  const first = cv.indexOf(find);
  if (first < 0) return NextResponse.json({ error: "That text is no longer in your CV, so nothing was changed. Ask Miao to look again." }, { status: 409 });
  if (cv.indexOf(find, first + 1) >= 0) return NextResponse.json({ error: "That text appears more than once in your CV, so nothing was changed. Ask Miao to be more specific." }, { status: 409 });
  const next = cv.slice(0, first) + replace + cv.slice(first + find.length);
  try {
    atomicWriteWithBackup(file, next);
  } catch {
    return NextResponse.json({ error: "Your CV could not be saved." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
