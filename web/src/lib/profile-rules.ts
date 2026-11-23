// Fork: Greta's own rules for Miao, kept in modes/_custom.md (the house-rules file
// every mode reads). The Profile page owns one section of that file,
// "## Rules from the Profile page", and rewrites only that section.

export const RULE_GROUPS = [
  { id: "cover", heading: "Cover letters", label: "Cover letter rules", hint: "Followed every time Miao writes a cover letter." },
  { id: "cv", heading: "CVs", label: "CV rules", hint: "Followed every time Miao tailors your CV." },
  { id: "all", heading: "Everything", label: "General rules", hint: "Followed everywhere: CVs, letters, forms and evaluations." },
] as const;
export type RuleGroupId = (typeof RULE_GROUPS)[number]["id"];
export type RuleGroups = Record<RuleGroupId, string[]>;

const SECTION = "## Rules from the Profile page";
const SECTION_NOTE = "<!-- Edited from Miao's Profile page. Each rule applies only to its group. -->";

function sectionRange(lines: string[]): [number, number] | null {
  const start = lines.findIndex((l) => l.trim() === SECTION);
  if (start < 0) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) if (/^##\s/.test(lines[i])) { end = i; break; }
  return [start, end];
}

export function readRules(text: string): RuleGroups {
  const out: RuleGroups = { cover: [], cv: [], all: [] };
  const lines = text.split("\n");
  const range = sectionRange(lines);
  if (!range) return out;
  let group: RuleGroupId | null = null;
  for (const line of lines.slice(range[0] + 1, range[1])) {
    const h = line.match(/^###\s+(.*)$/);
    if (h) { group = RULE_GROUPS.find((g) => g.heading.toLowerCase() === h[1].trim().toLowerCase())?.id ?? null; continue; }
    const b = line.match(/^-\s+(.*)$/);
    if (b && group) out[group].push(b[1].trim());
  }
  return out;
}

export function writeRules(text: string, groups: RuleGroups): string {
  const block = [SECTION, "", SECTION_NOTE];
  for (const g of RULE_GROUPS) {
    const rules = groups[g.id].map((r) => r.replace(/\s+/g, " ").trim()).filter(Boolean);
    if (!rules.length) continue;
    block.push("", `### ${g.heading}`, "", ...rules.map((r) => `- ${r}`));
  }
  const lines = text.replace(/\s+$/, "").split("\n");
  const range = sectionRange(lines);
  const empty = RULE_GROUPS.every((g) => !groups[g.id].some((r) => r.trim()));
  if (empty) {
    // No rules left: drop the section so the file goes back to how it was.
    if (!range) return text;
    const before = lines.slice(0, range[0]);
    while (before.length && before[before.length - 1].trim() === "") before.pop();
    const after = lines.slice(range[1]);
    return [...before, ...(after.length ? ["", ...after] : [])].join("\n") + "\n";
  }
  if (range) {
    const after = lines.slice(range[1]);
    return [...lines.slice(0, range[0]), ...block, ...(after.length ? ["", ...after] : [])].join("\n") + "\n";
  }
  return [...lines, "", ...block].join("\n") + "\n";
}

/** Short titles of the rules already in the file outside the Profile page's section (read-only on the page). */
export function otherRules(text: string): string[] {
  const lines = text.split("\n");
  const range = sectionRange(lines);
  const out: string[] = [];
  let inRules = false;
  let inComment = false;
  lines.forEach((line, i) => {
    if (range && i >= range[0] && i < range[1]) return;
    if (/<!--/.test(line)) inComment = true;
    if (inComment) { if (/-->/.test(line)) inComment = false; return; }
    const h2 = line.match(/^##\s+(.*)$/);
    if (h2) { inRules = /house rules|output preferences|off-limits/i.test(h2[1]); return; }
    if (!inRules) return;
    const b = line.match(/^-\s+(.*)$/);
    if (!b) return;
    const title = b[1].match(/^\*\*(.+?)\*\*/)?.[1]?.replace(/[:.]\s*$/, "").replace(/\s*\(user-stated[^)]*\)/i, "");
    out.push(title ?? (b[1].length > 90 ? `${b[1].slice(0, 90)}…` : b[1]));
  });
  return out;
}
