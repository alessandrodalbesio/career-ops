import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { careerOpsRoot, findApplication } from "@/lib/career-ops";
import { loadCoverLetter, readN } from "@/lib/cover-letter";
import { resolveCodeRoot } from "@/lib/core/code-root.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Fork: the edited cover letter as a downloadable A4 PDF, rendered by the same
// generate-pdf.mjs as the CV (scripts off, network blocked).

const page = (body: string) => `<!doctype html>
<html><head><meta charset="utf-8"><title>Cover letter</title>
<style>
  @page { size: A4; margin: 0; }
  html, body { margin: 0; }
  body { font-family: "Helvetica Neue", Arial, sans-serif; color: #1a1a1a; font-size: 10.5pt; line-height: 1.42; }
  .page { padding: 16mm 20mm 14mm; }
  p { margin: 0 0 7pt; }
  h1, h2, h3 { margin: 12pt 0 6pt; line-height: 1.25; }
  h1 { font-size: 16pt; } h2 { font-size: 13pt; } h3 { font-size: 11.5pt; }
  ul, ol { margin: 0 0 9pt; padding-left: 16pt; }
  li { margin: 0 0 3pt; } li p { margin: 0; }
  strong { font-weight: 600; }
  blockquote { margin: 0 0 9pt; padding-left: 10pt; border-left: 2px solid #ccc; color: #444; }
</style></head>
<body><div class="page">${body}</div></body></html>`;

export async function GET(req: Request) {
  const n = readN(new URL(req.url).searchParams.get("n"));
  if (!n) return NextResponse.json({ error: "n required" }, { status: 400 });
  const letter = loadCoverLetter(n);
  if (!letter) return NextResponse.json({ error: "No cover letter yet." }, { status: 404 });

  const root = careerOpsRoot();
  const app = findApplication(n);
  const slug = (app?.company ?? "company").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "company";
  const num = n.padStart(3, "0");
  const stem = path.join(root, "output", `cover-letter-${num}-${slug}`);
  fs.mkdirSync(path.dirname(stem), { recursive: true });
  // Scripts would not run in the renderer anyway; strip them so the file on disk is clean too.
  fs.writeFileSync(`${stem}.html`, page(letter.html.replace(/<script[\s\S]*?<\/script>/gi, "")), "utf8");

  // Never hand back an older PDF if this render does not write one.
  fs.rmSync(`${stem}.pdf`, { force: true });
  const coreRoot = resolveCodeRoot(process.cwd(), process.env);
  const result = await new Promise<{ ok: boolean; stderr: string }>((resolve) => {
    const child = spawn(
      process.execPath,
      [path.join(coreRoot, "generate-pdf.mjs"), `${stem}.html`, `${stem}.pdf`, "--format=a4", "--kind=cover", `--report=${num}`, "--skip-fact-check", "--max-pages=1"],
      { cwd: coreRoot, windowsHide: true, env: { ...process.env, CAREER_OPS_ROOT: root, CAREER_OPS_PDF_SHARED: "1" } },
    );
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (d) => { stderr += d; });
    child.on("close", (code) => resolve({ ok: code === 0, stderr }));
    child.on("error", (e) => resolve({ ok: false, stderr: e.message }));
  });
  if (!result.ok || !fs.existsSync(`${stem}.pdf`)) {
    return NextResponse.json({ error: result.stderr.slice(0, 400) || "PDF rendering failed." }, { status: 500 });
  }
  const pdf = fs.readFileSync(`${stem}.pdf`);
  const name = `Cover letter - ${app?.company ?? "job"}.pdf`.replace(/[^\w .-]/g, "");
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${new URL(req.url).searchParams.get("inline") && !new URL(req.url).searchParams.get("download") ? "inline" : "attachment"}; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
