"use client";

// Fork: the Rules page. Greta's standing instructions for Miao, one card per
// group (Cover letters / CVs / Everything). Uses /api/profile/rules, which keeps
// them in modes/_custom.md. Each rule is edited in place and saves on its own.
import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Plus, TriangleAlert, X } from "lucide-react";
import { JOB_PAGE_FRAME } from "@/components/page-frame";
import { RULE_GROUPS, type RuleGroupId, type RuleGroups } from "@/lib/profile-rules";
import { cn } from "@/lib/cn";

type Status = { kind: "saving" } | { kind: "saved" } | { kind: "error"; message: string };

const editable =
  "w-full resize-none overflow-hidden rounded-lg border border-transparent bg-transparent px-2.5 py-1.5 text-sm leading-relaxed text-foreground outline-none transition-colors placeholder:text-faint hover:bg-surface-hover/70 focus:border-brand/50 focus:bg-background focus:shadow-[0_0_0_3px_rgb(143_200_234/0.25)]";

const EXAMPLES: Record<RuleGroupId, string> = {
  cover: "e.g. Keep cover letters under 300 words",
  cv: "e.g. Never put a photo on my CV",
  all: "e.g. Never use the word “passionate”",
};

function grow(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight + 2}px`;
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

function RuleGroupCard({ id, heading, hint, rules, onSave, status }: {
  id: RuleGroupId; heading: string; hint: string; rules: string[]; onSave: (rules: string[]) => void; status?: Status;
}) {
  const [items, setItems] = useState(rules);
  const savedJson = useRef(JSON.stringify(rules));
  const focusIndex = useRef<number | null>(null);
  const refs = useRef<(HTMLTextAreaElement | null)[]>([]);
  useEffect(() => {
    if (focusIndex.current !== null) { refs.current[focusIndex.current]?.focus(); focusIndex.current = null; }
  }, [items.length]);

  const commit = (next: string[]) => {
    const clean = next.map((s) => s.trim()).filter(Boolean);
    const json = JSON.stringify(clean);
    if (json === savedJson.current) return;
    savedJson.current = json;
    onSave(clean);
  };
  const remove = (i: number) => { const next = items.filter((_, k) => k !== i); setItems(next); commit(next); };

  return (
    <section aria-labelledby={`rules-${id}`} className="rounded-2xl border border-border bg-surface">
      <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
        <div>
          <h2 id={`rules-${id}`} className="text-base font-semibold text-foreground">{heading}</h2>
          <p className="text-sm text-muted">{hint}</p>
        </div>
        <StatusBadge status={status} />
      </div>
      <ul className="divide-y divide-border">
        {items.map((rule, i) => (
          <li key={i} className="group flex items-start gap-2 px-4 py-1.5">
            <span className="mt-[13px] size-1.5 shrink-0 rounded-full bg-faint" aria-hidden />
            <textarea
              value={rule}
              rows={1}
              ref={(el) => { refs.current[i] = el; grow(el); }}
              onChange={(e) => { const next = [...items]; next[i] = e.target.value; setItems(next); grow(e.target); }}
              onBlur={() => commit(items)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); (e.target as HTMLTextAreaElement).blur(); }
                if (e.key === "Escape") (e.target as HTMLTextAreaElement).blur();
                if (e.key === "Backspace" && rule === "") { e.preventDefault(); remove(i); }
              }}
              placeholder={EXAMPLES[id]}
              aria-label={`${heading} rule ${i + 1}`}
              className={editable}
            />
            <button
              type="button"
              onClick={() => remove(i)}
              aria-label={`Remove rule: ${rule.slice(0, 60) || "empty"}`}
              title="Remove rule"
              className="mt-1 inline-flex size-7 shrink-0 items-center justify-center rounded-md text-faint opacity-0 transition-opacity hover:bg-surface-hover hover:text-foreground focus:opacity-100 group-hover:opacity-100 max-sm:opacity-100"
            >
              <X className="size-3.5" />
            </button>
          </li>
        ))}
        {items.length === 0 && <li className="px-6 py-3 text-sm text-faint">No rules yet.</li>}
      </ul>
      <div className="border-t border-border px-4 py-2">
        <button
          type="button"
          onClick={() => { focusIndex.current = items.length; setItems([...items, ""]); }}
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
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
