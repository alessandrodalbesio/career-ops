"use client";

// Fork: the Rules page. Greta's standing instructions for Miao, one card per
// group (Cover letters / CVs / Everything). Uses /api/profile/rules, which keeps
// them in modes/_custom.md. Each rule shows as a short name plus a plain preview;
// clicking it opens a small editor (name + what Miao should do). Saves on its own.
import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Plus, TriangleAlert, X } from "lucide-react";
import { JOB_PAGE_FRAME } from "@/components/page-frame";
import { RULE_GROUPS, type RuleGroupId, type RuleGroups } from "@/lib/profile-rules";
import { cn } from "@/lib/cn";

type Status = { kind: "saving" } | { kind: "saved" } | { kind: "error"; message: string };

const field =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-faint focus:border-brand/50 focus:shadow-[0_0_0_3px_rgb(143_200_234/0.25)]";

const EXAMPLES: Record<RuleGroupId, { name: string; body: string }> = {
  cover: { name: "Word limit", body: "Keep cover letters under 300 words." },
  cv: { name: "No photo", body: "Never put a photo on my CV." },
  all: { name: "Banned words", body: "Never use the word “passionate”." },
};

function grow(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight + 2}px`;
}

// "**Name (user-stated …):** body" → { name, body }. Rules without a name keep their text as the body.
function splitRule(rule: string): { name: string; body: string } {
  const m = rule.match(/^\*{0,2}([^:*\n]{2,60}?)\*{0,2}:\s*([\s\S]*)$/);
  if (!m) return { name: "", body: rule };
  return { name: m[1].replace(/\s*\((?:user-stated|user stated)[^)]*\)/i, "").trim(), body: m[2].trim() };
}
// Keeps a "(user-stated …)" note that was in the original name.
function joinRule(name: string, body: string, original: string): string {
  const note = original.match(/^\*{0,2}[^:*\n]*?(\s*\((?:user-stated|user stated)[^)]*\))/i)?.[1] ?? "";
  const n = name.trim();
  const b = body.trim().replace(/\s+/g, " ");
  if (!n) return b;
  return `${n}${note}: ${b}`;
}
// A readable preview: file paths, settings and LaTeX left out.
function preview(text: string): string {
  return text
    .replace(/\s*\([^()]*`[^()]*\)/g, "")
    .replace(/`[^`]*`\s*(?:→\s*`[^`]*`)?/g, (c) => (/[\\/{}=→]|\.(md|yml|json)/.test(c) ? "" : c.replace(/`/g, "")))
    .replace(/\bfrom\s+(?=that\b)/g, "")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim()
    .replace(/^\w/, (c) => c.toUpperCase());
}

function StatusBadge({ status }: { status?: Status }) {
  if (!status) return null;
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs", status.kind === "error" ? "text-red-700" : "text-faint")}>
      {status.kind === "saving" && <><Loader2 className="size-3 animate-spin" /> Saving…</>}
      {status.kind === "saved" && <><Check className="size-3 text-emerald-700" /> Saved</>}
      {status.kind === "error" && <><TriangleAlert className="size-3" /> {status.message}</>}
    </span>
  );
}

function RuleEditor({ rule, example, onDone, onCancel }: { rule: string; example: { name: string; body: string }; onDone: (v: string) => void; onCancel: () => void }) {
  const start = splitRule(rule);
  const [name, setName] = useState(start.name);
  const [body, setBody] = useState(start.body);
  const box = useRef<HTMLDivElement>(null);
  // Unchanged: keep the rule exactly as written (formatting, notes and all).
  const done = () => onDone(name.trim() === start.name && body.trim() === start.body.trim() ? rule : joinRule(name, body, rule));
  return (
    <div
      ref={box}
      className="space-y-2 rounded-xl border border-brand/40 bg-background p-3 shadow-[0_0_0_3px_rgb(143_200_234/0.2)]"
      onBlur={(e) => { if (!box.current?.contains(e.relatedTarget as Node)) done(); }}
      onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); onCancel(); } }}
    >
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); (e.currentTarget.nextElementSibling as HTMLTextAreaElement | null)?.focus(); } }}
        placeholder={`Name, e.g. ${example.name}`}
        aria-label="Rule name"
        className={cn(field, "font-medium")}
      />
      <textarea
        value={body}
        rows={2}
        ref={grow}
        onChange={(e) => { setBody(e.target.value); grow(e.target); }}
        onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); done(); } }}
        placeholder={`What Miao should do, e.g. ${example.body}`}
        aria-label="What Miao should do"
        className={cn(field, "resize-none overflow-hidden leading-relaxed")}
      />
      <div className="flex items-center justify-end gap-2">
        <span className="mr-auto text-xs text-faint">Saves when you click outside · Esc to cancel</span>
        <button type="button" onClick={onCancel} className="rounded-lg px-3 py-1.5 text-sm text-muted hover:bg-surface-hover hover:text-foreground">Cancel</button>
        <button type="button" onClick={done} className="rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-brand-foreground hover:bg-brand-200">Done</button>
      </div>
    </div>
  );
}

function RuleGroupCard({ id, heading, hint, rules, onSave, status }: {
  id: RuleGroupId; heading: string; hint: string; rules: string[]; onSave: (rules: string[]) => void; status?: Status;
}) {
  const [items, setItems] = useState(rules);
  const [open, setOpen] = useState<number | null>(null);
  const savedJson = useRef(JSON.stringify(rules));

  const commit = (next: string[]) => {
    const clean = next.map((s) => s.trim()).filter(Boolean);
    setItems(clean);
    const json = JSON.stringify(clean);
    if (json === savedJson.current) return;
    savedJson.current = json;
    onSave(clean);
  };
  const remove = (i: number) => { setOpen(null); commit(items.filter((_, k) => k !== i)); };

  return (
    <section aria-labelledby={`rules-${id}`} className="rounded-2xl border border-border bg-surface">
      <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
        <div>
          <h2 id={`rules-${id}`} className="flex items-center gap-2 text-base font-semibold text-foreground">
            {heading}
            <span className="rounded-full bg-surface-hover px-2 py-0.5 text-[11px] font-medium text-muted">{items.filter(Boolean).length}</span>
          </h2>
          <p className="text-sm text-muted">{hint}</p>
        </div>
        <StatusBadge status={status} />
      </div>

      <div className="space-y-1.5 p-3">
        {items.map((rule, i) => {
          if (open === i) {
            return (
              <RuleEditor
                key={i}
                rule={rule}
                example={EXAMPLES[id]}
                onDone={(v) => { setOpen(null); commit(items.map((r, k) => (k === i ? v : r))); }}
                onCancel={() => { setOpen(null); if (!rule.trim()) setItems(items.filter((_, k) => k !== i)); }}
              />
            );
          }
          const { name, body } = splitRule(rule);
          return (
            <div key={i} className="group flex items-start gap-2 rounded-xl border border-border bg-background px-4 py-3 transition-colors hover:border-brand/30">
              <button type="button" onClick={() => setOpen(i)} className="min-w-0 flex-1 text-left" aria-label={`Edit rule ${name || body.slice(0, 40)}`}>
                {name && <p className="text-sm font-medium text-foreground">{name}</p>}
                <p className={cn("line-clamp-2 text-sm text-muted", !name && "text-foreground")}>{preview(body)}</p>
              </button>
              <button
                type="button"
                onClick={() => remove(i)}
                aria-label={`Remove rule ${name || body.slice(0, 40)}`}
                title="Remove rule"
                className="-mr-1 inline-flex size-7 shrink-0 items-center justify-center rounded-md text-faint opacity-0 transition-opacity hover:bg-surface-hover hover:text-foreground focus:opacity-100 group-hover:opacity-100 max-sm:opacity-100"
              >
                <X className="size-3.5" />
              </button>
            </div>
          );
        })}

        {items.length === 0 && open === null && (
          <p className="px-1 py-2 text-sm text-faint">No rules yet. For example: &ldquo;{EXAMPLES[id].body}&rdquo;</p>
        )}

        <button
          type="button"
          onClick={() => { setItems([...items, ""]); setOpen(items.length); }}
          className="flex w-full items-center gap-1.5 rounded-xl border border-dashed border-border px-4 py-2.5 text-sm text-muted transition-colors hover:border-brand/40 hover:text-foreground"
        >
          <Plus className="size-4" /> Add a rule
        </button>
      </div>
    </section>
  );
}

export function RulesEditor() {
  const [groups, setGroups] = useState<RuleGroups | null>(null);
  const [error, setError] = useState(false);
  const [status, setStatus] = useState<Partial<Record<RuleGroupId, Status>>>({});

  useEffect(() => {
    fetch("/api/profile/rules", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ groups: RuleGroups }>) : Promise.reject()))
      .then((d) => setGroups(d.groups))
      .catch(() => setError(true));
  }, []);

  const save = async (group: RuleGroupId, rules: string[]) => {
    setStatus((s) => ({ ...s, [group]: { kind: "saving" } }));
    try {
      const r = await fetch("/api/profile/rules", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ group, rules }) });
      const body = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(body.error ?? "Not saved.");
      setStatus((s) => ({ ...s, [group]: { kind: "saved" } }));
      setTimeout(() => setStatus((s) => (s[group]?.kind === "saved" ? { ...s, [group]: undefined } : s)), 2000);
    } catch (e) {
      setStatus((s) => ({ ...s, [group]: { kind: "error", message: e instanceof Error ? e.message : "Not saved." } }));
    }
  };

  return (
    <div className={JOB_PAGE_FRAME}>
      <header>
        <h1 className="font-display text-2xl tracking-tight text-landing">Rules for Miao</h1>
        <p className="mt-1 text-sm text-muted">How you want Miao to write for you. Miao follows these every time; they never change the facts about you.</p>
      </header>
      {error && <p className="mt-6 rounded-xl border border-red-300/60 bg-red-50 px-4 py-3 text-sm text-red-800">Your rules could not be read.</p>}
      {!groups && !error && <div className="mt-6 flex justify-center py-16 text-muted"><Loader2 className="size-5 animate-spin" /></div>}
      {groups && (
        <div className="mt-6 space-y-4">
          {RULE_GROUPS.map((g) => (
            <RuleGroupCard
              key={g.id}
              id={g.id}
              heading={g.heading}
              hint={g.hint}
              rules={groups[g.id]}
              status={status[g.id]}
              onSave={(rules) => save(g.id, rules)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
