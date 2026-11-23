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
      const [section, key] = p.split(".");
      values[p] = doc?.[section]?.[key] ?? null;
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
