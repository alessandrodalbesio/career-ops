"use client";


// Fork: a card with an icon header that folds open, used on the report page for
// "Check before you apply" and the brand briefing.
import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

export function FoldCard({ icon, title, status, tone = "idle", actions, defaultOpen = false, className, children }: {
  icon: ReactNode;
  title: string;
  status?: ReactNode;
  tone?: "idle" | "ready" | "busy";
  actions?: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <details open={defaultOpen} className={cn("group rounded-2xl border border-border bg-surface", className)}>
      <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
        <span className={cn(
          "inline-flex size-10 shrink-0 items-center justify-center rounded-xl",
          tone === "ready" ? "bg-emerald-500/10 text-emerald-800" : tone === "busy" ? "bg-brand-soft text-brand-text" : "bg-surface-hover text-muted",
        )}>
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          {status && <p className="truncate text-sm text-muted">{status}</p>}
        </div>
        {/* Clicks on the actions must not fold the card. */}
        {actions && <div className="flex shrink-0 items-center gap-1.5" onClick={(e) => e.preventDefault()}>{actions}</div>}
        <ChevronDown className="size-4 shrink-0 text-faint transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-border px-5 py-4">{children}</div>
    </details>
  );
}
