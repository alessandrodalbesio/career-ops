"use client";

import { useRef, useState } from "react";
import { ArrowDown, ArrowUp, Bold as BoldIcon, Check, Eye, EyeOff, Italic, Loader2, Pencil, Plus, Sparkles, Trash2, Undo2 } from "lucide-react";
import { readSavedCliId } from "@/lib/saved-cli";
import { cn } from "@/lib/cn";
import { Tip } from "@/components/ui/tip";
import { arrange } from "@/lib/cv-studio/html-blocks.mjs";
import { bulletShown, extraId, restoredId, wordDiff, type StudioAction, type StudioBullet, type StudioEdits, type StudioItem, type StudioSection } from "@/lib/cv-studio/studio.mjs";

type Dispatch = (a: StudioAction) => void;
/** A bullet the tailor dropped and the user added back; `index` points into the item's `restorable`. */
type AddedRow = { id: string; index: number; text: string };
/** Fork: a line the user wrote in the Studio; `key` points into `edits.extra[item]`. */
type MineRow = { id: string; key: string; text: string; mine: true };

// Below this overlap a word diff is mostly red and green; the original reads better as its own line.
const REWRITE_FLOOR = 0.45;
type Common = { n: string; edits: StudioEdits; hidden: Set<string>; dispatch: Dispatch; checked: Set<string>; onCheck: (id: string) => void };

// Fork: is this the summary section? Miao rewrites it for every job, so it is never flagged.
export const isSummarySection = (title: string) => /summary|profile|about/i.test(title);

// Fork: show **bold** as real bold (the tailored CV writes bold as Markdown).
export function Bold({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*|(?<![\p{L}\p{N}_])_[^_\s](?:[^_\n]*[^_\s])?_(?![\p{L}\p{N}_]))/gu).map((part, k) =>
        /^\*\*[^*]+\*\*$/.test(part) ? <strong key={k} className="font-semibold">{part.slice(2, -2)}</strong>
        : /^_.+_$/.test(part) ? <em key={k}>{part.slice(1, -1)}</em>
        : <span key={k}>{part}</span>,
      )}
    </>
  );
}

// Fork: bold / italic for a textarea. Wraps the selection in **…** or _…_
// (again to undo), which the preview and the PDF show as bold and italic.
function wrapSelection(el: HTMLTextAreaElement | null, mark: string, onChange: (v: string) => void) {
  if (!el) return;
  const { selectionStart: a, selectionEnd: b, value } = el;
  const sel = value.slice(a, b);
  const on = sel.length >= mark.length * 2 && sel.startsWith(mark) && sel.endsWith(mark);
  const inner = on ? sel.slice(mark.length, sel.length - mark.length) : sel || "text";
  onChange(value.slice(0, a) + (on ? inner : mark + inner + mark) + value.slice(b));
  requestAnimationFrame(() => {
    el.focus();
    const start = on ? a : a + mark.length;
    el.setSelectionRange(start, start + inner.length);
  });
}
/** ⌘B / ⌘I inside a textarea. True when it handled the key. */
function formatShortcut(e: React.KeyboardEvent<HTMLTextAreaElement>, onChange: (v: string) => void) {
  if (!(e.metaKey || e.ctrlKey)) return false;
  const k = e.key.toLowerCase();
  if (k !== "b" && k !== "i") return false;
  e.preventDefault();
  wrapSelection(e.currentTarget, k === "b" ? "**" : "_", onChange);
  return true;
}
function FormatButtons({ area, onChange }: { area: React.RefObject<HTMLTextAreaElement | null>; onChange: (v: string) => void }) {
  const btn = "inline-flex size-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-hover hover:text-foreground";
  return (
    <span className="inline-flex items-center gap-0.5 rounded-lg border border-border p-0.5">
      <Tip label="Bold (⌘B)"><button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => wrapSelection(area.current, "**", onChange)} aria-label="Bold" className={btn}><BoldIcon className="size-3.5" /></button></Tip>
      <Tip label="Italic (⌘I)"><button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => wrapSelection(area.current, "_", onChange)} aria-label="Italic" className={btn}><Italic className="size-3.5" /></button></Tip>
    </span>
  );
}

const iconButton = "inline-flex size-7 items-center justify-center rounded-md text-faint transition-colors hover:bg-surface-hover hover:text-foreground disabled:opacity-30 max-sm:size-11";

function MoveButtons({ parent, id, siblings, first, last, dispatch, label }: { parent: string; id: string; siblings: string[]; first: boolean; last: boolean; dispatch: Dispatch; label: string }) {
  return (
    <>
      <Tip label="Move up">
        <button className={iconButton} disabled={first} aria-label={`Move ${label} up`} onClick={() => dispatch({ type: "move", parent, id, by: -1, siblings })}>
          <ArrowUp className="size-3.5" />
        </button>
      </Tip>
      <Tip label="Move down">
        <button className={iconButton} disabled={last} aria-label={`Move ${label} down`} onClick={() => dispatch({ type: "move", parent, id, by: 1, siblings })}>
          <ArrowDown className="size-3.5" />
        </button>
      </Tip>
    </>
  );
}

function HideButton({ id, hidden, dispatch, label }: { id: string; hidden: boolean; dispatch: Dispatch; label: string }) {
  return (
    <Tip label={hidden ? "Put back in the CV" : "Remove from the CV"} align="end">
      <button className={iconButton} aria-label={hidden ? `Show ${label}` : `Hide ${label}`} aria-pressed={hidden} onClick={() => dispatch({ type: "toggle", id })}>
        {hidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
      </button>
    </Tip>
  );
}

export function SectionCard({ section, siblings, first, last, ...common }: Common & { section: StudioSection; siblings: string[]; first: boolean; last: boolean }) {
  const { hidden, dispatch, edits } = common;
  const isHidden = hidden.has(section.id);
  const items = arrange(section.items, edits.order[section.id]);
  return (
    <section aria-label={section.title} className={cn("rounded-2xl border border-border bg-surface px-5 py-4 transition-opacity", isHidden && "opacity-50")}>
      <header className="flex items-center gap-1">
        <h2 className="flex-1 text-sm font-semibold text-foreground">{section.title || "Section"}</h2>
        <MoveButtons parent="root" id={section.id} siblings={siblings} first={first} last={last} dispatch={dispatch} label={`${section.title} section`} />
        <HideButton id={section.id} hidden={isHidden} dispatch={dispatch} label={`${section.title} section`} />
      </header>
      {!isHidden && section.kind === "competencies" && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {items.map((t) => (
            <button
              key={t.id}
              aria-pressed={!hidden.has(t.id)}
              onClick={() => dispatch({ type: "toggle", id: t.id })}
              className={cn("rounded-full border px-2.5 py-0.5 text-xs transition-colors", hidden.has(t.id) ? "border-dashed border-border text-faint line-through" : "border-brand/30 bg-brand-soft text-brand-text")}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}
      {!isHidden && section.kind !== "competencies" && (
        <div className="mt-1 divide-y divide-border/60">
          {items.map((item, k) => (
            <ItemBlock key={item.id} item={item} section={section} siblings={items.map((i) => i.id)} first={k === 0} last={k === items.length - 1} {...common} />
          ))}
        </div>
      )}
    </section>
  );
}

function ItemBlock({ item, section, siblings, first, last, ...common }: Common & { item: StudioItem; section: StudioSection; siblings: string[]; first: boolean; last: boolean }) {
  const { hidden, dispatch, edits } = common;
  const isHidden = hidden.has(item.id);
  const restored = edits.restored[item.id] ?? [];
  // Added-back bullets join the tailored ones in one ordered list, so they move like any other.
  const added: AddedRow[] = restored.filter((idx) => item.restorable[idx]).map((idx) => ({ id: restoredId(item.id, idx), index: idx, text: item.restorable[idx].text }));
  const mine: MineRow[] = Object.entries(edits.extra?.[item.id] ?? {}).map(([key, text]) => ({ id: extraId(item.id, key), key, text, mine: true }));
  const rows = arrange([...item.bullets, ...added, ...mine] as (StudioBullet | AddedRow | MineRow)[], edits.order[item.id]);
  // New lines join an entry's bullet list, so only entries that have one can take them.
  const canAdd = item.kind === "entry" && item.bullets.length > 0;
  const rowIds = rows.map((r) => r.id);
  const movable = item.kind === "entry";
  const showHeader = item.kind === "entry";
  return (
    <div className={cn("py-2", isHidden && "opacity-50")}>
      {showHeader && (
        <div className="flex items-center gap-1">
          <p className="flex-1 truncate text-sm font-medium text-foreground">{item.label}</p>
          {section.items.length > 1 && <MoveButtons parent={section.id} id={item.id} siblings={siblings} first={first} last={last} dispatch={dispatch} label={item.label} />}
          <HideButton id={item.id} hidden={isHidden} dispatch={dispatch} label={item.label} />
        </div>
      )}
      {!isHidden && (
        <ul className="mt-1 space-y-1.5">
          {rows.map((b, k) =>
            "mine" in b ? (
              <MineLine key={b.id} row={b} item={item.id} siblings={rowIds} first={k === 0} last={k === rows.length - 1} movable={movable} dispatch={dispatch} />
            ) : "index" in b ? (
              <li key={b.id} data-bullet={b.id} className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm">
                <span className="flex-1 text-foreground">{b.text}</span>
                {movable && <MoveButtons parent={item.id} id={b.id} siblings={rowIds} first={k === 0} last={k === rows.length - 1} dispatch={dispatch} label="added-back bullet" />}
                <button className={iconButton} aria-label="Remove the added-back bullet" onClick={() => dispatch({ type: "unrestore", item: item.id, index: b.index })}>
                  <Undo2 className="size-3.5" />
                </button>
              </li>
            ) : (
              <BulletRow key={b.id} bullet={b} summary={isSummarySection(section.title)} parent={item.id} siblings={rowIds} first={k === 0} last={k === rows.length - 1} movable={movable} {...common} />
            ),
          )}
          {item.restorable.map((r, idx) =>
            restored.includes(idx) ? null : (
              <li key={`r${idx}`} className="flex items-start gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-sm text-faint">
                <span className="flex-1">
                  <span className="mr-1.5 text-[10px] font-medium uppercase tracking-wide">Removed by Miao</span>
                  {r.text}
                </span>
                <button className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs text-muted hover:border-brand/40 hover:text-brand-text" onClick={() => dispatch({ type: "restore", item: item.id, index: idx })}>
                  <Plus className="size-3" /> Add back
                </button>
              </li>
            ),
          )}
          {canAdd && <AddLine onAdd={(text) => dispatch({ type: "add-line", item: item.id, text })} />}
        </ul>
      )}
    </div>
  );
}

function LineEditor({ initial, onSave, onCancel, label }: { initial: string; onSave: (text: string) => void; onCancel: () => void; label: string }) {
  const [draft, setDraft] = useState(initial);
  const save = () => (draft.trim() ? onSave(draft.trim()) : onCancel());
  const area = useRef<HTMLTextAreaElement | null>(null);
  const grow = (el: HTMLTextAreaElement | null) => { if (el) { el.style.height = "auto"; el.style.height = `${el.scrollHeight + 2}px`; } };
  const setText = (v: string) => { setDraft(v); requestAnimationFrame(() => grow(area.current)); };
  return (
    <div>
      <textarea
        autoFocus
        value={draft}
        rows={2}
        placeholder="Write the new line…"
        ref={(el) => { area.current = el; grow(el); }}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (formatShortcut(e, setText)) return;
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) save();
          if (e.key === "Escape") onCancel();
        }}
        aria-label={label}
        className="block w-full resize-none overflow-hidden rounded-xl border border-brand/40 bg-background px-3 py-2.5 text-sm leading-relaxed text-foreground shadow-[0_0_0_3px_rgb(143_200_234/0.2)] placeholder:text-faint focus:outline-none"
      />
      <div className="mt-2.5 flex items-center gap-2">
        <button onClick={save} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand px-3 text-sm font-medium text-brand-foreground transition-colors hover:bg-brand-200">
          <Check className="size-3.5" /> Save
        </button>
        <button onClick={onCancel} className="inline-flex h-8 items-center rounded-lg px-3 text-sm text-muted transition-colors hover:bg-surface-hover hover:text-foreground">
          Cancel
        </button>
        <span className="ml-auto"><FormatButtons area={area} onChange={setText} /></span>
      </div>
    </div>
  );
}

// Fork: a line the user wrote. Shown with "Your line", editable and removable like the rest.
function MineLine({ row, item, siblings, first, last, movable, dispatch }: { row: MineRow; item: string; siblings: string[]; first: boolean; last: boolean; movable: boolean; dispatch: Dispatch }) {
  const [editing, setEditing] = useState(false);
  return (
    <li data-bullet={row.id} className="group rounded-lg border border-transparent px-3 py-2 text-sm transition-colors hover:border-border">
      {editing ? (
        <LineEditor initial={row.text} label="Edit your line" onCancel={() => setEditing(false)} onSave={(text) => { dispatch({ type: "edit-line", item, key: row.key, text }); setEditing(false); }} />
      ) : (
        <>
          <p className="leading-relaxed text-foreground"><Bold text={row.text} /></p>
          <div className="mt-1.5 flex items-center gap-1.5">
            <span className="rounded-full bg-surface-hover px-2 py-0.5 text-[11px] text-muted">Your line</span>
            <span className="flex-1" />
            <span className="inline-flex items-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 max-sm:opacity-100">
              <Tip label="Edit the text">
                <button className={iconButton} aria-label="Edit your line" onClick={() => setEditing(true)}><Pencil className="size-3.5" /></button>
              </Tip>
              {movable && <MoveButtons parent={item} id={row.id} siblings={siblings} first={first} last={last} dispatch={dispatch} label="your line" />}
              <Tip label="Delete this line" align="end">
                <button className={iconButton} aria-label="Delete your line" onClick={() => dispatch({ type: "remove-line", item, key: row.key })}><Trash2 className="size-3.5" /></button>
              </Tip>
            </span>
          </div>
        </>
      )}
    </li>
  );
}

function AddLine({ onAdd }: { onAdd: (text: string) => void }) {
  const [open, setOpen] = useState(false);
  if (open)
    return (
      <li className="px-3 py-2">
        <LineEditor initial="" label="New line" onCancel={() => setOpen(false)} onSave={(text) => { onAdd(text); setOpen(false); }} />
      </li>
    );
  return (
    <li>
      <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-muted transition-colors hover:bg-surface-hover hover:text-foreground">
        <Plus className="size-3.5" /> Add a line
      </button>
    </li>
  );
}

function BulletRow({ n, bullet, summary, parent, siblings, first, last, movable, edits, hidden, dispatch, checked, onCheck }: Common & { bullet: StudioBullet; summary: boolean; parent: string; siblings: string[]; first: boolean; last: boolean; movable: boolean }) {
  const shown = bulletShown(bullet, edits);
  const isHidden = hidden.has(bullet.id);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(shown.text);
  const [busy, setBusy] = useState(false);
  const [rewriting, setRewriting] = useState(false);
  const area = useRef<HTMLTextAreaElement | null>(null);
  const grow = (el: HTMLTextAreaElement | null) => { if (el) { el.style.height = "auto"; el.style.height = `${el.scrollHeight + 2}px`; } };
  const setText = (v: string) => { setDraft(v); requestAnimationFrame(() => grow(area.current)); };
  const toCheck = needsCheck(bullet, shown.source, summary) && !checked.has(bullet.id) && !isHidden;
  // Fork: once a version is picked, show just that text; "Compare" brings the choice back.
  const picked = edits.use[bullet.id]?.kind === "tailored" || edits.use[bullet.id]?.kind === "base";
  const comparing = !picked && bullet.base !== null && bullet.change !== "same";

  const saveDraft = async () => {
    if (busy) return;
    const text = draft.trim();
    if (!text || text === shown.text) return setEditing(false);
    setBusy(true);
    const keywords = await fetch(`/api/cv-studio/${encodeURIComponent(n)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "keywords", text }) })
      .then((r) => (r.ok ? (r.json() as Promise<{ keywords: string[] }>) : { keywords: [] }))
      .then((b) => b.keywords, () => []);
    dispatch({ type: "use", id: bullet.id, use: { kind: "custom", text, keywords } });
    setBusy(false);
    setEditing(false);
  };

  return (
    <li data-bullet={bullet.id} data-check={toCheck ? "" : undefined} className={cn("group relative rounded-lg border px-3 py-2 text-sm transition-colors", isHidden ? "border-dashed border-border opacity-50" : "border-transparent hover:border-border", toCheck && "bg-amber-50/60")}>
      {toCheck && (
        <span className="group/edge absolute -left-px bottom-1.5 top-1.5 w-[3px] rounded-full bg-amber-400" aria-hidden>
          <span className="pointer-events-none absolute left-2 top-0 z-50 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-[11px] font-medium text-background opacity-0 shadow-md transition-opacity group-hover/edge:opacity-100">
            Not in your CV. Make sure it is true.
          </span>
        </span>
      )}
      {editing ? (
        <div>
          <textarea
            autoFocus
            value={draft}
            ref={(el) => { area.current = el; grow(el); }}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (formatShortcut(e, setText)) return;
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) saveDraft();
              if (e.key === "Escape") setEditing(false);
            }}
            aria-label="Edit bullet"
            className="block w-full resize-none overflow-hidden rounded-xl border border-brand/40 bg-background px-3 py-2.5 text-sm leading-relaxed text-foreground shadow-[0_0_0_3px_rgb(143_200_234/0.2)] focus:outline-none"
          />
          <div className="mt-2.5 flex items-center gap-2">
            <button disabled={busy} onClick={saveDraft} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand px-3 text-sm font-medium text-brand-foreground transition-colors hover:bg-brand-200 disabled:opacity-60">
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} Save
            </button>
            <button onClick={() => setEditing(false)} className="inline-flex h-8 items-center rounded-lg px-3 text-sm text-muted transition-colors hover:bg-surface-hover hover:text-foreground">
              Cancel
            </button>
            <span className="ml-auto"><FormatButtons area={area} onChange={setText} /></span>
          </div>
        </div>
      ) : (
        <p className={cn("leading-relaxed", isHidden ? "text-faint line-through" : "text-foreground")}>
          {comparing && shown.source === "tailored" && bullet.change === "edited" && bullet.base !== null && bullet.similarity >= REWRITE_FLOOR ? <Diff before={bullet.base} after={bullet.tailored} /> : <Bold text={shown.text} />}
        </p>
      )}
      {!editing && comparing && shown.source === "tailored" && bullet.change === "edited" && bullet.base !== null && bullet.similarity < REWRITE_FLOOR && (
        <p className="mt-1 text-xs text-faint">
          <span className="font-medium">Your original:</span> {bullet.base}
        </p>
      )}
      {!editing && <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {toCheck && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-900">Not from your CV</span>
        )}
        {comparing && (
          <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-800">Reworded</span>
        )}
        {toCheck && (
          <button
            type="button"
            onClick={() => onCheck(bullet.id)}
            className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-background px-2 py-0.5 text-[11px] font-medium text-amber-800 transition-colors hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800"
          >
            <Check className="size-3" /> Looks good
          </button>
        )}
        {comparing && shown.source === "tailored" &&
          bullet.drivenBy.map((k) => (
            <span key={k} className="rounded-full bg-brand-soft px-2 py-0.5 text-[11px] text-brand-text" title="Job keyword this rewrite added">
              +{k}
            </span>
          ))}
        {shown.source === "custom" && <span className="rounded-full bg-surface-hover px-2 py-0.5 text-[11px] text-muted">Your wording</span>}
        <span className="flex-1" />
        {picked && bullet.base !== null && bullet.change !== "same" && (
          <button
            type="button"
            onClick={() => dispatch({ type: "unuse", id: bullet.id })}
            className="rounded-full px-2 py-0.5 text-[11px] text-faint opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100 group-focus-within:opacity-100 max-sm:opacity-100"
          >
            Compare versions
          </button>
        )}
        {comparing && (
          <div role="radiogroup" aria-label="Wording" className="inline-flex rounded-full border border-border p-0.5 text-[11px]">
            {(["tailored", "base"] as const).map((kind) => (
              <button
                key={kind}
                role="radio"
                aria-checked={shown.source === kind}
                onClick={() => dispatch({ type: "use", id: bullet.id, use: { kind } })}
                className={cn("rounded-full px-2 py-0.5 transition-colors", shown.source === kind ? "bg-brand-soft font-medium text-brand-text" : "text-muted hover:text-foreground")}
              >
                {kind === "tailored" ? "Miao's version" : "My original"}
              </button>
            ))}
          </div>
        )}
        <span className="inline-flex items-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 max-sm:opacity-100">
          <Tip label="Rewrite with Miao">
            <button className={iconButton} aria-label="Rewrite with AI" aria-expanded={rewriting} onClick={() => setRewriting((v) => !v)}>
              <Sparkles className="size-3.5" />
            </button>
          </Tip>
          <Tip label="Edit the text">
            <button
              className={iconButton}
              aria-label="Edit wording"
              onClick={() => {
                setDraft(shown.text);
                setEditing(true);
              }}
            >
              <Pencil className="size-3.5" />
            </button>
          </Tip>
          {movable && <MoveButtons parent={parent} id={bullet.id} siblings={siblings} first={first} last={last} dispatch={dispatch} label="bullet" />}
          {movable && <HideButton id={bullet.id} hidden={isHidden} dispatch={dispatch} label="bullet" />}
        </span>
      </div>}
      {rewriting && <RewritePanel n={n} bullet={bullet} current={shown.text} onUse={(text, keywords) => { dispatch({ type: "use", id: bullet.id, use: { kind: "custom", text, keywords } }); setRewriting(false); }} />}
    </li>
  );
}

type Proposal = { kind: "idle" } | { kind: "running" } | { kind: "ready"; text: string; keywords: string[]; warning: string | null } | { kind: "failed"; error: string };
const QUICK = ["Shorter", "Lead with the result", "Plainer wording", "Use a job keyword only if it is true"];

function RewritePanel({ n, bullet, current, onUse }: { n: string; bullet: StudioBullet; current: string; onUse: (text: string, keywords: string[]) => void }) {
  const [instruction, setInstruction] = useState("");
  const [proposal, setProposal] = useState<Proposal>({ kind: "idle" });
  const run = async (text: string) => {
    if (proposal.kind === "running") return;
    const cliId = readSavedCliId();
    if (!cliId) return setProposal({ kind: "failed", error: "No AI CLI is set up. Choose one in Config, or edit the wording by hand." });
    setProposal({ kind: "running" });
    try {
      const r = await fetch(`/api/cv-studio/${encodeURIComponent(n)}/rewrite`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bulletId: bullet.id, instruction: text, cliId }) });
      const body = (await r.json().catch(() => ({}))) as { text?: string; keywords?: string[]; warning?: string | null; error?: string };
      setProposal(r.ok && body.text ? { kind: "ready", text: body.text, keywords: body.keywords ?? [], warning: body.warning ?? null } : { kind: "failed", error: body.error ?? "The rewrite failed." });
    } catch {
      setProposal({ kind: "failed", error: "The rewrite failed. Is the dashboard still running?" });
    }
  };
  return (
    <div className="mt-2 rounded-lg border border-brand/30 bg-brand-soft/40 p-2.5" data-testid="rewrite-panel">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (instruction.trim()) run(instruction.trim());
        }}
      >
        <input
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          maxLength={300}
          placeholder="How should this bullet change?"
          aria-label="Rewrite instruction"
          className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground focus:border-brand focus:outline-none"
        />
        <button type="submit" disabled={proposal.kind === "running" || !instruction.trim()} className="inline-flex items-center gap-1 rounded-full bg-brand px-3 py-1 text-xs font-medium text-brand-foreground disabled:opacity-50">
          {proposal.kind === "running" ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />} Rewrite
        </button>
      </form>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {QUICK.map((q) => (
          <button key={q} type="button" disabled={proposal.kind === "running"} onClick={() => { setInstruction(q); run(q); }} className="rounded-full border border-border bg-background px-2 py-0.5 text-[11px] text-muted hover:border-brand/40 hover:text-brand-text disabled:opacity-50">
            {q}
          </button>
        ))}
      </div>
      {proposal.kind === "running" && <p className="mt-2 text-xs text-muted">Your AI CLI is drafting a rewrite. This uses tokens and can take a minute.</p>}
      {proposal.kind === "failed" && <p role="alert" className="mt-2 text-xs text-red-700 dark:text-red-300">{proposal.error}</p>}
      {proposal.kind === "ready" && (
        <div className="mt-2 rounded-md border border-border bg-background p-2 text-sm">
          <p className="leading-relaxed text-foreground" aria-label="Suggested rewrite">
            <Diff before={current} after={proposal.text} />
          </p>
          {proposal.warning && <p role="status" className="mt-1.5 text-xs text-amber-800 dark:text-amber-300">{proposal.warning}. It could read or change files while drafting this.</p>}
          <div className="mt-1.5 flex gap-2">
            <button onClick={() => onUse(proposal.text, proposal.keywords)} className="rounded-full bg-brand px-3 py-0.5 text-xs font-medium text-brand-foreground">Accept</button>
            <button onClick={() => setProposal({ kind: "idle" })} className="rounded-full px-3 py-0.5 text-xs text-muted hover:text-foreground">Reject</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Diff({ before, after }: { before: string; after: string }) {
  return (
    <>
      {wordDiff(before, after).map((part, k) =>
        part.op === "same" ? (
          <span key={k}>{part.text.replace(/\*\*/g, "")}</span>
        ) : part.op === "del" ? (
          <del key={k} className="rounded bg-red-500/10 text-red-700 decoration-red-400/70 dark:text-red-300">{part.text.replace(/\*\*/g, "")}</del>
        ) : (
          <ins key={k} className="rounded bg-emerald-500/15 text-emerald-800 no-underline dark:text-emerald-300">{part.text.replace(/\*\*/g, "")}</ins>
        ),
      )}
    </>
  );
}

/** Fork: a line Miao wrote from scratch (no match in cv.md), outside the summary. */
export function needsCheck(bullet: StudioBullet, source: string, summary: boolean): boolean {
  return !summary && bullet.change === "new" && source === "tailored";
}
