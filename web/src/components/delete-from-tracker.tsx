"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2 } from "lucide-react";
import { Tip } from "@/components/ui/tip";

// disc#9: remove a bogus tracker row (e.g. a job marked Evaluated after the CLI
// errored mid-run). Hard delete via the core write-gate (/api/tracker/delete →
// tracker.mjs delete), behind a confirm. The soft option (status → Discarded) lives
// in StatusSelect and stays for real-but-passed applications.
export function DeleteFromTracker({ n, compact = false }: { n: string; compact?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [orphan, setOrphan] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function openConfirm() {
    setOpen(true);
    setErr("");
    setOrphan(null);
    try {
      const r = await fetch("/api/tracker/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ n, dryRun: true }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr(d.error || "This row can’t be removed.");
        return;
      }
      setOrphan(d.orphanReport ?? null);
    } catch {
      setErr("Couldn’t reach the tracker.");
    }
  }

  async function confirmDelete() {
    setBusy(true);
    setErr("");
    try {
      const r = await fetch("/api/tracker/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ n }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr(d.error || "Delete failed.");
        setBusy(false);
        return;
      }
      // Row is gone — leave the (now-orphaned) report page for the pipeline.
      router.push("/pipeline");
      router.refresh();
    } catch {
      setErr("Delete failed.");
      setBusy(false);
    }
  }

  const panel = (
    <div className="rounded-xl border border-red-400/30 bg-[#fdf3f3] p-3 text-xs">
      <p className="font-medium text-foreground">Remove this job from your pipeline?</p>
      <p className="mt-1 text-muted">
        This can’t be undone.
      </p>
      {err && <p className="mt-1.5 text-red-500">{err}</p>}
      <div className="mt-2.5 flex gap-2">
        <button
          disabled={busy}
          onClick={confirmDelete}
          className="inline-flex items-center gap-1.5 rounded-md bg-red-500 px-2.5 py-1 font-medium max-sm:min-h-[44px] text-white transition-colors hover:bg-red-600 disabled:opacity-50"
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />} Delete
        </button>
        <button
          disabled={busy}
          onClick={() => setOpen(false)}
          className="rounded-md border border-border px-2.5 py-1 text-muted max-sm:min-h-[44px] transition-colors hover:text-foreground disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );

  if (compact) {
    return (
      <span className="relative inline-flex">
        <Tip label="Remove from tracker" align="end" className={open ? "[&>[role=tooltip]]:hidden" : undefined}>
          <button
            onClick={() => (open ? setOpen(false) : openConfirm())}
            aria-label="Remove from tracker"
            className="inline-flex size-[22px] items-center justify-center rounded-md border border-border bg-background text-faint transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 max-sm:size-9"
          >
            <Trash2 className="size-3" />
          </button>
        </Tip>
        {open && <div className="absolute right-0 top-full z-30 mt-2 w-80 shadow-lg">{panel}</div>}
      </span>
    );
  }

  if (!open) {
    return (
      <button
        onClick={openConfirm}
        className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs text-muted max-sm:min-h-[44px] transition-colors hover:border-red-400/50 hover:text-red-500"
      >
        <Trash2 className="size-3.5" /> Remove from tracker
      </button>
    );
  }

  return panel;
}
