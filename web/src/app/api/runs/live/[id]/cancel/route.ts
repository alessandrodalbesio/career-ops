import { NextResponse } from "next/server";
import { cancelRun, safeRunId } from "@/lib/run-hub.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

// Stop a running dashboard run (SIGTERM to its CLI child).
export async function POST(_req: Request, { params }: RouteContext) {
  const id = safeRunId((await params).id);
  if (!id) return NextResponse.json({ error: "bad id" }, { status: 400 });
  return cancelRun(id) ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "not running" }, { status: 404 });
}
