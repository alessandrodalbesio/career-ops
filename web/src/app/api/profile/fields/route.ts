import { NextResponse } from "next/server";
import fs from "node:fs";
import * as yaml from "js-yaml";
import { careerOpsRoot } from "@/lib/career-ops";
import { getProfilePath } from "@/lib/core/profile-path.mjs";
import { atomicWriteWithBackup } from "@/lib/core/safe-write";
import { patchProfileText } from "@/lib/profile-yaml-edit.mjs";
import { PROFILE_FIELD_PATHS, fieldByPath } from "@/lib/profile-fields";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Fork: read and save the Profile page's fields. One field per save, written with
// the comment-preserving line edit; if that cannot place the change safely, the
// save is refused instead of rewriting the whole file (which would drop comments).

type Doc = Record<string, Record<string, unknown>>;

function readDoc(): { file: string; source: string; doc: Doc } {
  const file = getProfilePath(careerOpsRoot());
  const source = fs.readFileSync(file, "utf8");
  const doc = ((yaml.load(source) as Doc) || {}) as Doc;
  return { file, source, doc };
}

export async function GET() {
  try {
    const { doc } = readDoc();
    const values: Record<string, unknown> = {};
    for (const p of PROFILE_FIELD_PATHS) {
      values[p] = p.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), doc) ?? null;
    }
    return NextResponse.json({ values });
  } catch {
    return NextResponse.json({ error: "Your profile could not be read." }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { path?: string; value?: unknown };
  const path = String(body.path ?? "");
  const field = fieldByPath(path);
  if (!field || !PROFILE_FIELD_PATHS.has(path)) return NextResponse.json({ error: "Unknown field." }, { status: 400 });

  let value: string | boolean | string[];
  if (field.kind === "bool") value = body.value === true;
  else if (field.kind === "list") value = Array.isArray(body.value) ? body.value.map((v) => String(v).trim()).filter(Boolean).slice(0, 30) : [];
  else value = String(body.value ?? "").slice(0, 2000);

  try {
    const { file, source, doc } = readDoc();
    if (path.split(".").length === 3) {
      const text = setNestedScalar(source, path, String(value), doc);
      if (text === null) return NextResponse.json({ error: "This field can't be saved from here without reformatting your profile file." }, { status: 422 });
      if (text !== source) atomicWriteWithBackup(file, text);
      return NextResponse.json({ ok: true, value });
    }
    const [section, key] = path.split(".");
    const expected: Doc = { ...doc, [section]: { ...(doc[section] ?? {}), [key]: value } };
    const text = patchProfileText(source, { [section]: { [key]: value } } as Parameters<typeof patchProfileText>[1], expected);
    if (text === null) {
      return NextResponse.json({ error: "This field can't be saved from here without reformatting your profile file." }, { status: 422 });
    }
    if (text !== source) atomicWriteWithBackup(file, text);
    return NextResponse.json({ ok: true, value });
  } catch {
    return NextResponse.json({ error: "Your profile could not be saved." }, { status: 500 });
  }
}

// Fork: `a.b.c` scalar (the addresses). Replaces only the `c:` line inside `a:` → `b:`,
// keeps a trailing comment, and refuses unless the result parses to exactly the
// old document with that one value changed. A missing line is not created.
function setNestedScalar(source: string, path: string, value: string, doc: Doc): string | null {
  const [a, b, c] = path.split(".");
  const lines = source.split("\n");
  const ai = lines.findIndex((l) => l.startsWith(`${a}:`));
  if (ai < 0) return null;
  let bi = -1;
  let ci = -1;
  for (let i = ai + 1; i < lines.length && !/^\S/.test(lines[i]); i++) {
    if (bi < 0 && new RegExp(`^ {2}${b}:\\s*$`).test(lines[i])) { bi = i; continue; }
    if (bi >= 0) {
      if (/^ {2}\S/.test(lines[i])) break;
      const m = new RegExp(`^( {4}${c}:)\\s*(.*)$`).exec(lines[i]);
      if (m) { ci = i; break; }
    }
  }
  if (ci < 0) return null;
  const rest = lines[ci].replace(new RegExp(`^ {4}${c}:`), "");
  // Blank out quoted text first so a "#" inside the value is not taken for a comment.
  const hash = rest.replace(/"(?:[^"\\]|\\.)*"|'[^']*'/g, (q) => "x".repeat(q.length)).search(/\s#/);
  const tail = hash >= 0 ? `  ${rest.slice(hash + 1)}` : "";
  lines[ci] = `    ${c}: ${JSON.stringify(value)}${tail}`;
  const text = lines.join("\n");
  const expected = JSON.parse(JSON.stringify(doc)) as Record<string, Record<string, Record<string, unknown>>>;
  if (!expected[a]?.[b]) return null;
  expected[a][b][c] = value;
  try {
    return JSON.stringify(yaml.load(text)) === JSON.stringify(expected) ? text : null;
  } catch {
    return null;
  }
}
