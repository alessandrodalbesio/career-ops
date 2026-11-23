import { NextResponse } from "next/server";
import { careerOpsRoot } from "@/lib/career-ops";
import { listRuns, runsDir } from "@/lib/run-hub.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Dashboard runs the server knows about (run-hub.mjs), newest first, so any
// browser can show what is running and reattach to it.
export async function GET() {
  try {
    return NextResponse.json({ runs: listRuns(runsDir(careerOpsRoot())).slice(0, 50) });
  } catch {
    return NextResponse.json({ runs: [] });
  }
}
