// Fork: turns the technical save warnings (voice check, verify-cv-facts output)
// into a short list Greta can act on. The dash warning is dropped: the PDF
// already replaces long dashes.

export type FriendlyItem =
  | { kind: "differs"; cv: string; source: string }
  | { kind: "skills"; names: string[] }
  | { kind: "other"; text: string };

const clean = (s: string) => s.replace(/\*\*/g, "").trim();

export function friendlyWarnings(warnings: string[]): FriendlyItem[] {
  const items: FriendlyItem[] = [];
  const skills: string[] = [];
  for (const w of warnings) {
    if (/voice check|cv-facts\.json/i.test(w)) continue;
    const lines = w.split("\n").map((l) => l.trim()).filter(Boolean);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.startsWith("- ")) continue;
      const body = line.slice(2);
      if (/^possible verb drift:/i.test(body)) {
        const cv = lines[i + 1]?.match(/^CV:\s*(.*)$/i)?.[1];
        const source = lines[i + 2]?.match(/^source:\s*(.*)$/i)?.[1];
        if (cv && source) items.push({ kind: "differs", cv: clean(cv), source: clean(source) });
        continue;
      }
      const tool = body.match(/^unsourced (?:tool|skill)[^:]*:\s*(.*)$/i);
      if (tool) {
        skills.push(clean(tool[1]).replace(/\b\w/g, (c) => c.toUpperCase()));
        continue;
      }
      if (/^not checked:/i.test(body)) continue;
      items.push({ kind: "other", text: clean(body) });
    }
  }
  if (skills.length) items.push({ kind: "skills", names: skills });
  return items;
}
