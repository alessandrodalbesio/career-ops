"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { X, History, ListX } from "lucide-react";
import { Tip } from "@/components/ui/tip";
import { useJobs } from "@/components/jobs/job-store";
import { WorkerCard, pillTone, TONE } from "@/components/jobs/worker-card";
import { workerDetailsLabel, workerIdentity } from "@/lib/worker-feedback.mjs";
import { cn } from "@/lib/cn";

// Back-compat re-exports (app/jobs/page.tsx imports pillTone from here).
export { pillTone, TONE };

// Collapsed "worker" pills in the sidebar — each the shared <WorkerCard> wrapped
// in a Link to its detail. Same component the assistant chat renders inline.
export function WorkerPills() {
  const { jobs, removeJob, clearFinished } = useJobs();
  const pathname = usePathname();
  if (jobs.length === 0) return null;
  const running = jobs.filter((j) => j.status === "running").length;
  const finished = jobs.length - running;

  return (
    <div className="mt-4 border-t border-border pt-3">
      {/* Fork: friendlier header ("Activity" + running badge), icon actions with tooltips. */}
      <div className="mb-2 flex items-center gap-1.5 px-1">
        <span className="text-xs font-medium text-muted">Activity</span>
        {running > 0 && (
          <span className="rounded-full bg-brand px-1.5 py-px text-[10px] font-semibold tabular-nums text-brand-foreground">{running}</span>
        )}
        <span className="ml-auto flex items-center">
          {finished > 0 && (
            <Tip label="Clear finished">
              <button onClick={clearFinished} aria-label="Clear finished" className="inline-flex size-6 items-center justify-center rounded-md text-faint transition-colors hover:bg-surface-hover hover:text-foreground">
                <ListX className="size-3.5" />
              </button>
            </Tip>
          )}
          <Tip label="History" align="end">
            <Link href="/jobs" aria-label="Worker history" className="inline-flex size-6 items-center justify-center rounded-md text-faint transition-colors hover:bg-surface-hover hover:text-foreground">
              <History className="size-3.5" />
            </Link>
          </Tip>
        </span>
      </div>
      <ul className="space-y-1.5">
        {jobs.slice(0, 6).map((j) => {
          const active = pathname === `/jobs/${j.id}`;
          return (
            <li key={j.id} className="group relative">
              <Link
                href={`/jobs/${j.id}`}
                aria-label={workerDetailsLabel(j)}
                className={cn(
                  "block rounded-xl border p-2 pr-6 transition-colors",
                  active ? "border-brand-text/30 bg-brand-soft" : "border-border bg-surface hover:bg-surface-hover",
                )}
              >
                <WorkerCard job={j} variant="tray" />
              </Link>
              <button
                onClick={() => removeJob(j.id)}
                className="absolute right-2 top-2 rounded text-faint opacity-100 [@media(hover:hover)]:opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
                aria-label={`Dismiss worker: ${workerIdentity(j)}`}
              >
                <X className="size-3" />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
