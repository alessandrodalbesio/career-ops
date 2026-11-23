// Fork: a small styled tooltip for icon-only buttons. Shows on hover and on
// keyboard focus, after a short delay, with a quick fade. Pure CSS, no portal:
// the bubble is positioned under (or above) the wrapped control.
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Tip({ label, side = "bottom", align = "center", wrap = false, children, className }: {
  label: string;
  /** Long text: wraps inside a fixed-width bubble instead of one line. */
  wrap?: boolean;
  side?: "bottom" | "top";
  /** "end" pins the bubble to the control's right edge (for controls near a clipping edge). */
  align?: "center" | "end";
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("group/tip relative inline-flex", className)}>
      {children}
      <span
        role="tooltip"
        className={cn(
          align === "end" ? "right-0" : "left-1/2 -translate-x-1/2",
          wrap ? "w-max max-w-72 whitespace-normal leading-snug" : "whitespace-nowrap",
          "pointer-events-none absolute z-[60] rounded-md bg-foreground px-2 py-1 text-[11px] font-medium text-background opacity-0 shadow-md transition-all duration-150",
          "group-hover/tip:opacity-100 group-hover/tip:delay-300 group-has-[:focus-visible]/tip:opacity-100",
          side === "bottom" ? "top-full mt-1.5 -translate-y-0.5 group-hover/tip:translate-y-0" : "bottom-full mb-1.5 translate-y-0.5 group-hover/tip:translate-y-0",
        )}
      >
        {label}
      </span>
    </span>
  );
}
