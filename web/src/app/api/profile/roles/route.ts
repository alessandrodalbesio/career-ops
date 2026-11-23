import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { careerOpsRoot } from "@/lib/career-ops";
import { atomicWriteWithBackup } from "@/lib/core/safe-write";
import { readJsonObject } from "@/lib/json-body";
import { parseRoles, writeRoles, type Role } from "@/lib/profile-roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Fork: read / save the role table (with priorities) in modes/_profile.md.

const file = () => path.join(careerOpsRoot(), "modes", "_profile.md");

export async function GET() {
  try {
    const doc = parseRoles(fs.readFileSync(file(), "utf8"));
    return doc ? NextResponse.json(doc) : NextResponse.json({ error: "No \"Your Target Roles\" section in modes/_profile.md." }, { status: 404 });
  } catch {
    return NextResponse.json({ error: "Your role list could not be read." }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const body = await readJsonObject<{ roles?: unknown; outOfScope?: unknown }>(req);
  const roles: Role[] = Array.isArray(body?.roles)
    ? body.roles.slice(0, 20).map((r) => {
        const o = (r ?? {}) as Record<string, unknown>;
        const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
        return { name: str(o.name, 120), fit: o.fit === "secondary" ? "secondary" : "primary", axes: str(o.axes, 400), buys: str(o.buys, 400) };
      })
    : [];
  const outOfScope = typeof body?.outOfScope === "string" ? body.outOfScope.slice(0, 500) : "";
  let md: string;
  try {
    md = fs.readFileSync(file(), "utf8");
  } catch {
    return NextResponse.json({ error: "Your role list could not be read." }, { status: 500 });
  }
  const next = writeRoles(md, { roles, outOfScope });
  if (next === null) return NextResponse.json({ error: "No \"Your Target Roles\" section in modes/_profile.md." }, { status: 404 });
  if (next !== md) atomicWriteWithBackup(file(), next);
  return NextResponse.json(parseRoles(next));
}
