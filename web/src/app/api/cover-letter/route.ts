import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { editedPath, loadCoverLetter, readN } from "@/lib/cover-letter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Fork: read, save and reset the cover letter for one application.

export async function GET(req: Request) {
  const n = readN(new URL(req.url).searchParams.get("n"));
  if (!n) return NextResponse.json({ error: "n required" }, { status: 400 });
  const letter = loadCoverLetter(n);
  return letter ? NextResponse.json(letter) : NextResponse.json({ error: "none" }, { status: 404 });
}

export async function PUT(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { n?: unknown; html?: unknown };
  const n = readN(body.n);
  if (!n || typeof body.html !== "string" || body.html.length > 60000) return NextResponse.json({ error: "bad request" }, { status: 400 });
  fs.mkdirSync(path.dirname(editedPath(n)), { recursive: true });
  fs.writeFileSync(editedPath(n), body.html, "utf8");
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const n = readN(new URL(req.url).searchParams.get("n"));
  if (!n) return NextResponse.json({ error: "n required" }, { status: 400 });
  fs.rmSync(editedPath(n), { force: true });
  return NextResponse.json({ ok: true });
}
