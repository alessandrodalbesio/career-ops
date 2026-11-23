// Fork: the "Your Target Roles" table in modes/_profile.md — the role list and
// priorities (Fit: primary / secondary) that scoring reads. Only that table and
// the "Out of scope" line are read or rewritten; the rest of the file is kept.

export type Role = { name: string; fit: "primary" | "secondary"; axes: string; buys: string };
export type RolesDoc = { roles: Role[]; outOfScope: string };

const HEADING = /^##\s+Your Target Roles\s*$/m;

function sectionBounds(md: string): [number, number] | null {
  const m = HEADING.exec(md);
  if (!m) return null;
  const start = m.index + m[0].length;
  const next = md.slice(start).search(/^##\s+/m);
  return [start, next < 0 ? md.length : start + next];
}

function cells(line: string): string[] {
  const inner = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return inner.split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"));
}

const esc = (s: string) => s.replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ").trim();

export function parseRoles(md: string): RolesDoc | null {
  const b = sectionBounds(md);
  if (!b) return null;
  const lines = md.slice(b[0], b[1]).split("\n");
  const table = lines.filter((l) => l.trim().startsWith("|"));
  const roles: Role[] = table.slice(2).map((l): Role => {
    const c = cells(l);
    return {
      name: (c[0] ?? "").replace(/^\*\*(.*)\*\*$/, "$1").trim(),
      fit: /second/i.test(c[1] ?? "") ? "secondary" : "primary",
      axes: c[2] ?? "",
      buys: c[3] ?? "",
    };
  }).filter((r) => r.name);
  const oos = lines.find((l) => /^out of scope/i.test(l.trim()));
  return { roles, outOfScope: oos ? oos.trim().replace(/^out of scope[^:]*:\s*/i, "") : "" };
}

export function writeRoles(md: string, doc: RolesDoc): string | null {
  const b = sectionBounds(md);
  if (!b) return null;
  const lines = md.slice(b[0], b[1]).split("\n");
  const first = lines.findIndex((l) => l.trim().startsWith("|"));
  const rows = doc.roles
    .filter((r) => r.name.trim())
    .map((r) => `| **${esc(r.name)}** | ${r.fit} | ${esc(r.axes)} | ${esc(r.buys)} |`);
  let out: string[];
  if (first < 0) {
    out = [...lines, "| Archetype | Fit | Thematic axes | What they buy |", "|-----------|-----|---------------|---------------|", ...rows, ""];
  } else {
    let end = first;
    while (end < lines.length && lines[end].trim().startsWith("|")) end++;
    out = [...lines.slice(0, first + 2), ...rows, ...lines.slice(end)];
  }
  const oos = doc.outOfScope.trim();
  const oosIdx = out.findIndex((l) => /^out of scope/i.test(l.trim()));
  if (oosIdx >= 0) {
    if (oos) out[oosIdx] = `Out of scope (score low): ${esc(oos)}`;
    else out.splice(oosIdx, 1);
  } else if (oos) {
    let end = out.findIndex((l) => l.trim().startsWith("|"));
    while (end >= 0 && end < out.length && out[end].trim().startsWith("|")) end++;
    out.splice(end < 0 ? out.length : end, 0, "", `Out of scope (score low): ${esc(oos)}`);
  }
  return md.slice(0, b[0]) + out.join("\n") + md.slice(b[1]);
}
