// Fork: Greta's cover letter template, kept in modes/_custom.md under its own
// "## Cover letter template" heading. The Cover letter page reads and rewrites only
// that section; the rest of the file is left as it is.

const HEADING = "## Cover letter template";
const NOTE = "<!-- Edited from Miao's Cover letter page. Miao follows it every time it writes a cover letter. -->";

function range(lines: string[]): [number, number] | null {
  const start = lines.findIndex((l) => l.trim() === HEADING);
  if (start < 0) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) if (/^##\s/.test(lines[i])) { end = i; break; }
  return [start, end];
}

/** The template text, without its heading or the file's HTML comments. */
export function readCoverTemplate(text: string): string {
  const lines = text.split("\n");
  const r = range(lines);
  if (!r) return "";
  return lines.slice(r[0] + 1, r[1]).join("\n").replace(/<!--[\s\S]*?-->/g, "").trim();
}

/** The file with the template section replaced (or added before the Rules page's section). */
export function writeCoverTemplate(text: string, template: string): string {
  const body = template.replace(/\r\n/g, "\n").trim();
  const block = [HEADING, "", NOTE, "", body].join("\n");
  const lines = text.replace(/\s+$/, "").split("\n");
  const r = range(lines);
  if (r) {
    const after = lines.slice(r[1]);
    return [...lines.slice(0, r[0]), block, ...(after.length ? ["", ...after] : [])].join("\n") + "\n";
  }
  const rulesAt = lines.findIndex((l) => l.trim() === "## Rules from the Profile page");
  if (rulesAt >= 0) return [...lines.slice(0, rulesAt), block, "", ...lines.slice(rulesAt)].join("\n") + "\n";
  return [...lines, "", block].join("\n") + "\n";
}
