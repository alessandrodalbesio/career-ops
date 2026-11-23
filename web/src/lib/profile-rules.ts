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

/**
 * Rules written elsewhere in the file (House Rules, Output Preferences, Off-Limits),
 * e.g. by Miao, moved into the Profile page's section so every rule shows up, and
 * can be edited, in one of the three groups. The text is moved word for word.
 * Only single-line bullets move; anything else (workflows, comments) is left alone.
 */
export function adoptOtherRules(text: string): { text: string; moved: number } {
  const lines = text.split("\n");
  const range = sectionRange(lines);
  const picked: { idx: number; rule: string }[] = [];
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
    const continued = /^\s{2,}\S/.test(lines[i + 1] ?? "");
    // The bold markers around a rule's title would show as raw ** in the page's text boxes.
    if (b && !continued) picked.push({ idx: i, rule: b[1].trim().replace(/^\*\*(.+?)\*\*/, "$1") });
  });
  if (!picked.length) return { text, moved: 0 };
  const groups = readRules(text);
  for (const { rule } of picked) groups[groupFor(rule)].push(rule);
  const drop = new Set(picked.map((p) => p.idx));
  const rest = lines.filter((_, i) => !drop.has(i)).join("\n").replace(/\n{3,}/g, "\n\n");
  return { text: writeRules(rest, groups), moved: picked.length };
}

/** Which group a rule belongs to, from what it says it applies to. */
export function groupFor(rule: string): RuleGroupId {
  const t = rule.toLowerCase();
  const cv = /\bcvs?\b|résumé|resume/.test(t);
  const letter = /cover letters?|\bletters?\b/.test(t);
  const form = /\bforms?\b|form answers?/.test(t);
  if (cv && (letter || form)) return "all";
  if (cv) return "cv";
  if (letter) return "cover";
  return "all";
}
