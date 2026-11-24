import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { careerOpsRoot } from "@/lib/career-ops";
import { atomicWriteWithBackup } from "@/lib/core/safe-write";
import { readCoverTemplate, writeCoverTemplate } from "@/lib/cover-template";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Fork: read and save Greta's cover letter template (modes/_custom.md, its own section).

const customPath = () => path.join(careerOpsRoot(), "modes", "_custom.md");
const readText = () => { try { return fs.readFileSync(customPath(), "utf8"); } catch { return ""; } };

export async function GET() {
  return NextResponse.json({ template: readCoverTemplate(readText()) });
}

export async function PUT(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { template?: unknown };
  if (typeof body.template !== "string" || body.template.length > 40000) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  // A "## " line would end the section early and leak into the next one.
  const template = body.template.replace(/^##(?!#)\s*/gm, "### ");
  try {
    const text = readText() || "# Custom Instructions -- career-ops\n";
    const next = writeCoverTemplate(text, template);
    if (next !== text) {
      fs.mkdirSync(path.dirname(customPath()), { recursive: true });
      atomicWriteWithBackup(customPath(), next);
    }
    return NextResponse.json({ ok: true, template: readCoverTemplate(next) });
  } catch {
    return NextResponse.json({ error: "The template could not be saved." }, { status: 500 });
  }
}
