/**
 * Fork: the latest brand briefing per report, kept on the server so it follows the
 * offer across devices and the cover letter run can reuse it instead of researching
 * the brand again. One file per report number under the data root.
 */
import fs from "node:fs";
import path from "node:path";

const MAX_BYTES = 64 * 1024;

function briefPath(root, n) {
  if (!/^\d+$/.test(String(n))) return null;
  return path.join(root, ".career-ops-web", "brand-briefs", `${Number(n)}.md`);
}

/** Save a finished briefing. Returns false (and writes nothing) for text that is not one. */
export function saveBrandBrief(root, n, text) {
  const file = briefPath(root, n);
  const t = String(text ?? "").trim();
  if (!file || !/brand briefing/i.test(t) || t.length > MAX_BYTES) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, t + "\n");
  return true;
}

/** The saved briefing for a report and when it was saved, or null. */
export function readBrandBrief(root, n) {
  const file = briefPath(root, n);
  if (!file) return null;
  try {
    const stat = fs.statSync(file);
    return { text: fs.readFileSync(file, "utf8"), savedAt: stat.mtimeMs };
  } catch {
    return null;
  }
}
