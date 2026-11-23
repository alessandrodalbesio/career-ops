import { careerOpsRoot } from "@/lib/career-ops";
import { runResponseStream, runsDir, safeRunId } from "@/lib/run-hub.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

// Same NDJSON protocol as POST /api/run: every event so far, then the live tail.
export async function GET(_req: Request, { params }: RouteContext) {
  const id = safeRunId((await params).id);
  if (!id) return Response.json({ error: "bad id" }, { status: 400 });
  return new Response(runResponseStream(id, runsDir(careerOpsRoot())), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
