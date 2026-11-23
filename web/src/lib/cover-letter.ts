import fs from "node:fs";
import path from "node:path";
import { careerOpsRoot } from "@/lib/career-ops";

// Fork: the cover letter Miao drafted for one application, plus Greta's edits.
// The cover run writes no file, so the draft is read from the saved run log
// (.career-ops-web/runs/*.md, "Step 8: Draft"); her edits are HTML in
// .career-ops-web/cover-letters/{n}.html.

export type CoverLetter = { html: string; draftHtml: string; edited: boolean; notes: string[]; writtenAt: number };

function section(md: string, heading: RegExp): string {
  const lines = md.split("\n");
  const start = lines.findIndex((l) => /^##\s/.test(l) && heading.test(l));
  if (start < 0) return "";
  const end = lines.findIndex((l, i) => i > start && /^##\s/.test(l));
  return lines.slice(start + 1, end < 0 ? undefined : end).join("\n").trim();
}

// Greta's own edits live next to the run logs, one file per application.
export function editedPath(n: string): string {
  return path.join(careerOpsRoot(), ".career-ops-web", "cover-letters", `${n}.html`);
}

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const inline = (t: string) => esc(t).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

/** Miao's plain-text draft as editor HTML: letterhead lines together, bullets as a list. */
function draftToHtml(letter: string): string {
  const paras = letter.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const firstBody = paras.findIndex((p) => p.length > 140);
  const out: string[] = [];
  if (firstBody > 0) {
    const head = paras.slice(0, firstBody);
    out.push(`<p><strong>${inline(head[0]).replace(/<\/?strong>/g, "")}</strong></p>`);
    if (head.length > 1) out.push(`<p>${head.slice(1).map(inline).join("<br>")}</p>`);
  }
  let list: string[] = [];
  const flush = () => { if (list.length) { out.push(`<ul>${list.map((li) => `<li><p>${li}</p></li>`).join("")}</ul>`); list = []; } };
  for (const p of firstBody > 0 ? paras.slice(firstBody) : paras) {
    const bullet = p.match(/^[•\-*]\s+([\s\S]*)$/);
    if (bullet) { list.push(inline(bullet[1])); continue; }
    flush();
    out.push(`<p>${inline(p).replace(/\n/g, "<br>")}</p>`);
  }
  flush();
  return out.join("");
}

export function readN(raw: unknown): string {
  const n = String(raw ?? "").replace(/^0+/, "");
  return /^\d+$/.test(n) ? n : "";
}


export function loadCoverLetter(n: string): CoverLetter | null {
  const dir = path.join(careerOpsRoot(), ".career-ops-web", "runs");
  let files: string[] = [];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith(".md"));
  } catch {
    return null;
  }
  const candidates = files
    .map((f) => ({ f, mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  for (const { f, mtime } of candidates) {
    const md = fs.readFileSync(path.join(dir, f), "utf8");
    if (!/^# Web run · Cover letter/m.test(md)) continue;
    const input = md.match(/^- input:\s*0*(\d+)\s*$/m)?.[1];
    if (input !== n || !/^- status:\s*done/m.test(md)) continue;
    const letter = section(md, /draft/i)
      .split("\n")
      .filter((l) => !/^─{5,}$/.test(l.trim()))
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    if (!letter) continue;
    const notes = section(md, /notes/i)
      .split("\n")
      .filter((l) => /^\s*[-•]\s/.test(l))
      .map((l) => l.replace(/^\s*[-•]\s*/, "").trim())
      .filter((l) => !/^\*{0,2}not done\b/i.test(l) && !/^\*{0,2}word count\b/i.test(l));
    // Her edits win, unless Miao wrote a newer draft after them.
    let edited: string | null = null;
    try {
      const st = fs.statSync(editedPath(n));
      if (st.mtimeMs > mtime) edited = fs.readFileSync(editedPath(n), "utf8");
    } catch { /* no edits yet */ }
    const draftHtml = draftToHtml(letter);
    return { html: edited ?? draftHtml, draftHtml, edited: edited !== null, notes, writtenAt: mtime };
  }
  return null;
}
