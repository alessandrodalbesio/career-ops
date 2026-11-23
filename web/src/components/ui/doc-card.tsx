"use client";

// Fork: the compact card the job page uses for "CV" and "Cover letter":
// icon + title + status on the left, one main action and a "⋯" menu on the right.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/cn";

export const primaryBtn =
  "inline-flex h-9 items-center justify-center gap-2 rounded-xl bg-brand px-4 text-sm font-medium text-brand-foreground transition-colors hover:bg-brand-200 disabled:opacity-60";
export const secondaryBtn =
  "inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:border-brand/40 hover:text-brand-text";
export const ghostBtn =
  "inline-flex h-9 items-center justify-center gap-2 rounded-xl px-3 text-sm font-medium text-muted transition-colors hover:bg-surface-hover hover:text-foreground";
export const iconPrimary =
  "inline-flex size-9 items-center justify-center rounded-xl bg-brand text-brand-foreground shadow-sm transition-all hover:-translate-y-px hover:bg-brand-200 active:translate-y-0 active:scale-95 disabled:opacity-60";
export const iconSecondary =
  "inline-flex size-9 items-center justify-center rounded-xl border border-border bg-background text-muted transition-all hover:-translate-y-px hover:border-brand-text/30 hover:text-foreground active:translate-y-0 active:scale-95";
export const textBtn =
  "inline-flex items-center gap-1.5 text-xs text-muted transition-colors hover:text-brand-text";

export type MenuItem = { label: string; icon: ReactNode; onSelect: () => void; href?: undefined } | { label: string; icon: ReactNode; href: string; onSelect?: undefined };

export function MoreMenu({ items, label = "More actions" }: { items: MenuItem[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);
  const itemCls = "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-surface-hover";
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn("inline-flex size-9 items-center justify-center rounded-xl border border-border bg-background text-muted transition-colors hover:text-foreground", open && "text-foreground")}
      >
        <MoreHorizontal className="size-4" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-30 mt-1.5 w-48 rounded-xl border border-border bg-background p-1 shadow-lg">
          {items.map((it) =>
            it.href ? (
              <a key={it.label} role="menuitem" href={it.href} className={itemCls} onClick={() => setOpen(false)}>
                <span className="text-muted">{it.icon}</span>{it.label}
              </a>
            ) : (
              <button key={it.label} role="menuitem" type="button" className={itemCls} onClick={() => { setOpen(false); it.onSelect?.(); }}>
                <span className="text-muted">{it.icon}</span>{it.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}

export function DocCard({ icon, title, status, tone = "idle", children, footer }: {
  icon: ReactNode;
  title: string;
  status: ReactNode;
  tone?: "idle" | "ready" | "busy";
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-surface px-5 py-4">
      <div className="flex items-center gap-3">
        <span className={cn(
          "inline-flex size-10 shrink-0 items-center justify-center rounded-xl",
          tone === "ready" ? "bg-emerald-500/10 text-emerald-800" : tone === "busy" ? "bg-brand-soft text-brand-text" : "bg-surface-hover text-muted",
        )}>
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          <p className="truncate text-sm text-muted">{status}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">{children}</div>
      </div>
      {footer && <div className="mt-3 empty:hidden">{footer}</div>}
    </section>
  );
}
