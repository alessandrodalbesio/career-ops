import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { careerOpsRoot } from "@/lib/career-ops";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Fork: files attached to a Miao chat message. Saved under the data root in
// .career-ops-web/uploads/, where the chat CLI (whose cwd is the data root) can
// open them with its Read tool. The chat stays read-only: it only reads them.

const UPLOAD_DIR = path.join(".career-ops-web", "uploads");
const MAX_BYTES = 15 * 1024 * 1024;
// Types the chat CLI can read: PDFs, images, and plain text.
const ALLOWED = /\.(pdf|png|jpe?g|webp|gif|txt|md|markdown|csv|json|ya?ml|html?|tex)$/i;

function safeName(name: string): string {
  const base = path.basename(name).normalize("NFKD").replace(/[^\w.\-]+/g, "-").replace(/-+/g, "-").replace(/^[-.]+/, "");
  return (base || "file").slice(-80);
}

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Send the file as form data." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file." }, { status: 400 });
  if (!ALLOWED.test(file.name)) {
    return NextResponse.json({ error: "Miao can read PDFs, images and text files. Save Word documents as PDF first." }, { status: 415 });
  }
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "That file is over 15 MB." }, { status: 413 });

  const root = careerOpsRoot();
  const dir = path.join(root, UPLOAD_DIR);
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const name = `${stamp}-${Math.random().toString(36).slice(2, 6)}-${safeName(file.name)}`;
  fs.writeFileSync(path.join(dir, name), Buffer.from(await file.arrayBuffer()));
  return NextResponse.json({ name: file.name, path: path.join(UPLOAD_DIR, name).split(path.sep).join("/"), size: file.size });
}
