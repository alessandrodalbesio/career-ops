import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Fork: start an evaluation from a shared job link WITHOUT a browser page, for
// the iPhone Shortcut (which then shows a notification and stays in LinkedIn).
// POST {"url": "..."} or {"text": "...shared text with a link..."}.
// Optional "pageText": the posting page as plain text, fetched by the phone
// itself, so the server does not have to read it (LinkedIn 429s the server).
//
// It starts the normal dashboard run by calling /api/run on this same server,
// reads the first event so the run is registered, then lets go: runs live on
// the server (run-hub.mjs), so dropping the response does not stop it, and
// every open dashboard picks it up in the Activity tray.
//
// Access: on the hosted site this path sits behind Cloudflare Access with a
// service-token policy (the Shortcut cannot do the e-mail login).

function firstUrl(...values: unknown[]): string {
  for (const v of values) {
    const s = typeof v === "string" ? v : "";
    const m = s.match(/https?:\/\/[^\s<>"']+/i);
    if (m) return m[0].replace(/[).,;]+$/, "");
  }
  return "";
}

function siteOf(u: string): string {
  try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; }
}

export async function POST(req: Request) {
  let body: Record<string, unknown> = {};
  const type = req.headers.get("content-type") ?? "";
  try {
    if (type.includes("application/json")) body = (await req.json()) as Record<string, unknown>;
    else body = { text: await req.text() };
  } catch {
    return NextResponse.json({ ok: false, error: "Send JSON like {\"url\": \"https://…\"}." }, { status: 400 });
  }
  const url = firstUrl(body.url, body.text, body.title);
  if (!url) return NextResponse.json({ ok: false, error: "No job link found in what was shared." }, { status: 400 });

  const runId = `share-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const port = process.env.PORT || "3000";
  const cliId = process.env.CAREER_OPS_CLI || "claude";
  let res: Response;
  try {
    res = await fetch(`http://127.0.0.1:${port}/api/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "evaluate",
        input: url,
        cliId,
        runId,
        meta: { title: "Evaluate · shared link", subtitle: url, page: "/share" },
        // The page text the phone fetched itself (see /api/run deviceJd).
        ...(typeof body.pageText === "string" && body.pageText.trim() ? { pageText: body.pageText } : {}),
      }),
    });
  } catch {
    return NextResponse.json({ ok: false, error: "Miao could not start the evaluation." }, { status: 502 });
  }
  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    return NextResponse.json({ ok: false, error: detail.slice(0, 300) || `Run refused (${res.status}).` }, { status: 502 });
  }
  // Wait for the first event (the run is registered by then), then drop the stream.
  const reader = res.body.getReader();
  try { await Promise.race([reader.read(), new Promise((r) => setTimeout(r, 4000))]); } catch { /* ignore */ }
  reader.cancel().catch(() => {});

  return NextResponse.json(
    { ok: true, runId: res.headers.get("X-Run-Id") || runId, site: siteOf(url), message: `Miao is evaluating the job on ${siteOf(url)}.` },
    { status: 202 },
  );
}
