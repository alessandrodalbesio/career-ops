import { ShareEvaluate } from "@/components/home/share-evaluate";

export const dynamic = "force-dynamic";

// Fork: share target. Android shares into here via the manifest's share_target;
// the iPhone Shortcut opens /share?url=<link>. Shared text often wraps the link
// ("Check out this job at Acme: https://…"), so take the first http(s) URL found.
function firstUrl(...values: (string | string[] | undefined)[]): string {
  for (const v of values) {
    const s = Array.isArray(v) ? v.join(" ") : v ?? "";
    const m = s.match(/https?:\/\/[^\s<>"']+/i);
    if (m) return m[0].replace(/[).,;]+$/, "");
  }
  return "";
}

export default async function SharePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const p = await searchParams;
  return <ShareEvaluate url={firstUrl(p.url, p.text, p.title)} />;
}
