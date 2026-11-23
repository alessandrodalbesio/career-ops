"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown } from "lucide-react";

// Fork: the only statuses offered in the dropdown (a row with another status keeps it shown as-is).
const STATUS_CHOICES = ["Evaluated", "Applied", "Interview", "Offer", "Hired", "Rejected", "Discarded"] as const;

// Fork: a colour per status for the badge (soft background, darker text, light border).
const STATUS_BADGE: Record<string, string> = {
  Evaluated: "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-300",
  Applied: "border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-900 dark:bg-violet-950 dark:text-violet-300",
  Interview: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300",
  Offer: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
  Hired: "border-green-300 bg-green-100 text-green-900 dark:border-green-800 dark:bg-green-900 dark:text-green-200",
  Rejected: "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300",
  Discarded: "border-zinc-200 bg-zinc-100 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400",
};
function statusBadge(status: string): string {
  return STATUS_BADGE[status] ?? "border-border bg-surface-hover text-muted";
}
import { cn } from "@/lib/cn";
import { saveStatus } from "@/lib/pipeline-status.mjs";
import { appliedWriteAllowed, statusEditAction } from "@/lib/applied-confirm.mjs";

// Status writeback control. Updates the existing tracker row (status cell) via
// /api/status — never adds rows. Reverts on failure; confirms with the
// terminal-popup animation.
type StatusSelectProps = {
  n: string;
  current: string;
  inline?: boolean;
  applicationLabel?: string;
  onSaved?: (status: string, restoreFocus: boolean) => void;
  // Set when this row unmounted during an earlier save. Pending keeps the
  // chosen status on screen. Failed is the error the unmounted editor could
  // not show.
  heldSave?: { phase: "pending"; status: string } | { phase: "failed"; error: string };
  onHeldSave?: (event: { type: "start"; status: string } | { type: "fail"; error: string } | { type: "clear" }) => void;
};

export function StatusSelect(props: StatusSelectProps) {
  return <StatusEditor key={props.n} {...props} />;
}

function StatusEditor({ n, current, inline = false, applicationLabel, onSaved, heldSave, onHeldSave }: StatusSelectProps) {
  const [status, setStatus] = useState(current);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [pendingApplied, setPendingApplied] = useState(false);
  const pendingFrom = useRef("");
  const saving = useRef(false);
  const mounted = useRef(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pencil = useRef<HTMLButtonElement>(null);
  const select = useRef<HTMLSelectElement>(null);
  const router = useRouter();
  const id = useId();
  const label = applicationLabel ?? `application #${n}`;

  useEffect(() => {
    if (!saving.current) {
      setStatus(current);
      setPendingApplied(false);
    }
  }, [current]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (savedTimer.current) clearTimeout(savedTimer.current);
    };
  }, []);

  // Fork: inline mode uses a custom menu (fixed-positioned so the table's scroll box can't clip it).
  const wrapRef = useRef<HTMLSpanElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  useEffect(() => {
    if (!editing || !inline) { setMenuPos(null); return; }
    const r = pencil.current?.getBoundingClientRect();
    if (r) {
      const height = STATUS_CHOICES.length * 32 + 8;
      const below = r.bottom + 4 + height <= window.innerHeight;
      setMenuPos({ top: below ? r.bottom + 4 : r.top - 4 - height, left: r.left });
    }
    const outside = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!wrapRef.current?.contains(t) && !menuRef.current?.contains(t)) cancel();
    };
    const onScroll = () => cancel();
    document.addEventListener("pointerdown", outside);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("scroll", onScroll, true);
    };
    // cancel is stable enough for this listener's lifetime (it only reads refs and props)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, inline]);
  // Move focus into the menu once it is on screen (it mounts after its position is known).
  useEffect(() => {
    if (menuPos) menuRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
  }, [menuPos]);

  const heldPending = heldSave?.phase === "pending" ? heldSave.status : "";
  const heldError = heldSave?.phase === "failed" ? heldSave.error : "";
  const savingNow = busy || heldPending !== "";
  const errorShown = error || heldError;

  function cancel() {
    if (saving.current || heldPending) return;
    setPendingApplied(false);
    setStatus(current);
    setEditing(false);
    setError("");
    requestAnimationFrame(() => pencil.current?.focus());
  }

  function declineApplied() {
    if (saving.current || heldPending) return;
    setPendingApplied(false);
    setStatus(pendingFrom.current || current);
    setError("");
  }

  async function commitChange(next: string, prev: string, hadFocus: boolean) {
    saving.current = true;
    setStatus(next);
    setBusy(true);
    setSaved(false);
    setError("");
    // Record the attempt before the request, so a scroll that unmounts this
    // editor still has the chosen status and can show a later failure.
    onHeldSave?.({ type: "start", status: next });
    try {
      const confirmed = await saveStatus(n, prev, next);
      if (!confirmed) {
        onHeldSave?.({ type: "clear" });
        return;
      }
      // A filter or the row window may unmount this editor while the write is
      // in flight. Still refresh; the parent's callback captures identity,
      // never row position. Disabling a focused select can move focus to body.
      // Restore it only if the user has not moved to search, tabs or another
      // row meanwhile.
      const restoreFocus = hadFocus && (document.activeElement === document.body || document.activeElement === select.current);
      if (onSaved) onSaved(confirmed, restoreFocus);
      else router.refresh();
      onHeldSave?.({ type: "clear" });
      if (!mounted.current) return;
      setStatus(confirmed);
      setEditing(false);
      setSaved(true);
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSaved(false), 2000);
      if (inline && restoreFocus) {
        requestAnimationFrame(() => pencil.current?.focus());
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Could not save status. Please try again.";
      onHeldSave?.({ type: "fail", error: message });
      if (!mounted.current) return;
      setStatus(prev); // revert on failure
      setError(message);
    } finally {
      saving.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  async function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    await choose(e.target.value, document.activeElement === select.current);
  }

  async function choose(next: string, hadFocus: boolean) {
    const prev = pendingApplied ? pendingFrom.current : (inline ? current : status);
    if (saving.current || heldPending) return;
    const action = statusEditAction(next, prev);
    if (action === "keep") {
      setPendingApplied(false);
      setStatus(current);
      return;
    }
    if (action === "ask") {
      pendingFrom.current = prev;
      setStatus(next);
      setPendingApplied(true);
      setError("");
      return;
    }
    setPendingApplied(false);
    await commitChange(next, prev, hadFocus);
  }

  async function confirmApplied() {
    if (!pendingApplied || saving.current || heldPending) return;
    const prev = pendingFrom.current;
    const active = document.activeElement;
    const hadFocus = active === select.current
      || (active instanceof HTMLElement && Boolean(active.closest("[data-status-editor]")));
    setPendingApplied(false);
    await commitChange("Applied", prev, hadFocus);
  }

  const shown = heldPending ? heldPending : pendingApplied ? status : inline && !busy ? current : status;
  const appliedAsk = appliedWriteAllowed({ status: "Applied", confirmed: false });
  const known = (STATUS_CHOICES as readonly string[]).includes(shown);
  const buttonClass = "inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-hover hover:text-brand-text focus-visible:outline-2 focus-visible:outline-brand disabled:opacity-50 max-sm:size-11";
  const control = (
    <select
      ref={select}
      id={id}
      aria-label={inline ? `Status for ${label}` : undefined}
      aria-invalid={errorShown ? true : undefined}
      aria-describedby={errorShown ? `${id}-error` : undefined}
      value={shown}
      onChange={onChange}
      onKeyDown={(event) => {
        if (inline && event.key === "Escape") {
          event.preventDefault();
          cancel();
        }
      }}
      // Fork: leaving the menu without choosing closes the editor.
      onBlur={() => { if (inline && !saving.current && !pendingApplied) cancel(); }}
      disabled={savingNow}
      className={cn(
        "rounded-md border border-border bg-surface px-2.5 py-1 text-sm text-foreground outline-none transition-colors focus:border-brand/50 focus-visible:ring-2 focus-visible:ring-brand/40 disabled:opacity-50 max-sm:min-h-[44px]",
        inline && "min-w-0 max-w-[calc(100%-2.5rem)]",
      )}
    >
      {!known && <option value={shown}>{shown}</option>}
      {STATUS_CHOICES.map((s) => <option key={s} value={s}>{s}</option>)}
    </select>
  );
  return (
    <span className={cn("flex-wrap items-center gap-2", inline ? "flex w-full min-w-0" : "inline-flex")} aria-busy={savingNow} data-status-editor="">
      {/* Flex wraps a line before it shrinks items, so min-w-0 on the label
          cannot keep the edit button beside a long status. This group does
          not wrap. The confirmation stays outside it and takes the next line. */}
      <span className={inline ? "flex min-w-0 max-w-full flex-nowrap items-center gap-2" : "contents"}>
        {inline ? (
          // Fork: the badge is the trigger and stays the same size; the choices open in a small menu.
          <span ref={wrapRef} className="inline-flex">
            <button
              ref={pencil}
              type="button"
              aria-haspopup="listbox"
              aria-expanded={editing}
              aria-label={`Status ${shown}. Change status for ${label}`}
              disabled={savingNow}
              onClick={() => {
                if (editing) { cancel(); return; }
                setError(""); onHeldSave?.({ type: "clear" }); setEditing(true);
              }}
              className={cn(
                "group/status inline-flex min-w-0 items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium transition-all hover:brightness-95 active:scale-95 focus-visible:outline-2 focus-visible:outline-brand disabled:opacity-70",
                statusBadge(shown),
                editing && "ring-2 ring-brand/40",
              )}
            >
              <span className="min-w-0 truncate">{shown}</span>
              <ChevronDown aria-hidden="true" className={cn("-mr-0.5 size-3 shrink-0 opacity-50 transition-all group-hover/status:opacity-100", editing && "rotate-180 opacity-100")} />
            </button>
            {editing && menuPos && (
              <div
                ref={menuRef}
                role="listbox"
                aria-label={`Status for ${label}`}
                style={{ position: "fixed", top: menuPos.top, left: menuPos.left }}
                className="co-menu-in z-50 w-40 rounded-lg border border-border bg-surface p-1 shadow-lg"
                onKeyDown={(e) => {
                  const opts = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? []);
                  const i = opts.indexOf(document.activeElement as HTMLElement);
                  if (e.key === "Escape") { e.preventDefault(); cancel(); }
                  else if (e.key === "ArrowDown") { e.preventDefault(); opts[(i + 1) % opts.length]?.focus(); }
                  else if (e.key === "ArrowUp") { e.preventDefault(); opts[(i - 1 + opts.length) % opts.length]?.focus(); }
                }}
              >
                <style>{"@keyframes co-menu-in{from{opacity:0;transform:translateY(-3px)}to{opacity:1;transform:none}}.co-menu-in{animation:co-menu-in .12s ease-out}"}</style>
                {STATUS_CHOICES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    role="option"
                    aria-selected={s === shown}
                    onClick={() => {
                      setEditing(false);
                      if (s === shown) { requestAnimationFrame(() => pencil.current?.focus()); return; }
                      void choose(s, true);
                    }}
                    className="flex h-8 w-full items-center justify-between rounded-md px-1.5 text-left outline-none hover:bg-surface-hover focus-visible:bg-surface-hover"
                  >
                    <span className={cn("rounded-md border px-2 py-0.5 text-xs font-medium", statusBadge(s))}>{s}</span>
                    {s === shown && <Check aria-hidden="true" className="size-3.5 text-muted" />}
                  </button>
                ))}
              </div>
            )}
          </span>
        ) : (
          <>
            <label htmlFor={id} className="text-xs text-faint">status</label>
            {control}
          </>
        )}
        {inline && savingNow && <span role="status" className="shrink-0 text-xs text-faint">saving…</span>}
        {inline && saved && (
          <span role="status" className="inline-flex shrink-0 animate-terminal-popup items-center gap-1 text-xs font-medium text-brand-text">
            <Check aria-hidden="true" className="size-3" /> saved
          </span>
        )}
      </span>
      {pendingApplied && (
        <span data-status-confirm="" className={cn("items-center gap-2", inline ? "flex basis-full whitespace-normal" : "inline-flex")}>
          <span className="text-xs text-foreground">{appliedAsk.prompt}</span>
          <button type="button" onClick={() => void confirmApplied()} disabled={savingNow} className="text-xs font-medium text-brand-text disabled:opacity-60">
            {appliedAsk.yesLabel}
          </button>
          <button type="button" onClick={declineApplied} disabled={savingNow} className="text-xs text-muted hover:text-foreground disabled:opacity-60">
            Not yet
          </button>
        </span>
      )}
      {!inline && savingNow && <span role="status" className="text-xs text-faint">saving…</span>}
      {!inline && saved && (
        <span role="status" className="animate-terminal-popup inline-flex items-center gap-1 text-xs font-medium text-brand-text">
          <Check aria-hidden="true" className="size-3" /> saved
        </span>
      )}
      {errorShown && <span id={`${id}-error`} role="alert" className="basis-full whitespace-normal text-xs text-red-700 dark:text-red-400">{errorShown}</span>}
    </span>
  );
}
