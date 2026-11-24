import { NextResponse } from "next/server";
import { careerOpsRoot } from "@/lib/career-ops";
import { readBrandBrief } from "@/lib/brand-brief-store.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Fork: the saved brand briefing for one report, so it shows on every device.
export async function GET(req: Request) {
  const n = new URL(req.url).searchParams.get("n") ?? "";
  if (!/^\d+$/.test(n)) return NextResponse.json({ error: "n required" }, { status: 400 });
  const brief = readBrandBrief(careerOpsRoot(), n);
  return brief ? NextResponse.json(brief) : NextResponse.json({ error: "none" }, { status: 404 });
}
