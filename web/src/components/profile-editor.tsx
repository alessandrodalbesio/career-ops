"use client";

// Fork: the Profile page. A settings-style page: one card per topic, one row per
// field (label left, value right). Values read like plain text and become editable
// on hover/click; lists have one row per item with remove and "+ Add".
// Every change saves on its own.
import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Check, Loader2, Plus, TriangleAlert, X } from "lucide-react";
import { JOB_PAGE_FRAME } from "@/components/page-frame";
import { PROFILE_CARDS, type ProfileField, type ProfileTab } from "@/lib/profile-fields";
import type { Role, RolesDoc } from "@/lib/profile-roles";
import { RULE_GROUPS, type RuleGroupId, type RuleGroups } from "@/lib/profile-rules";
import { cn } from "@/lib/cn";

type Values = Record<string, unknown>;
type Status = { kind: "saving" } | { kind: "saved" } | { kind: "error"; message: string };

// Reads as text; shows a soft box on hover and a clear one while editing.
const editable =
  "w-full rounded-lg border border-transparent bg-transparent px-2.5 py-1.5 text-sm text-foreground outline-none transition-colors placeholder:text-faint hover:bg-surface-hover/70 focus:border-brand/50 focus:bg-background focus:shadow-[0_0_0_3px_rgb(143_200_234/0.25)]";

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

function TextValue({ field, value, onSave }: { field: ProfileField; value: unknown; onSave: (v: string) => void }) {
  const initial = value == null ? "" : String(value);
  const [draft, setDraft] = useState(initial);
  const saved = useRef(initial);
  useEffect(() => { setDraft(initial); saved.current = initial; }, [initial]);
  const commit = () => {
    const v = draft.trim();
    if (v === saved.current) return;
    saved.current = v;
    onSave(v);
  };
  if (field.kind === "long") {
    return (
      <textarea
        value={draft}
        rows={1}
        ref={grow}
        onChange={(e) => { setDraft(e.target.value); grow(e.target); }}
        onBlur={commit}
        placeholder={field.placeholder ?? "Empty"}
        aria-label={field.label}
        className={cn(editable, "resize-none overflow-hidden leading-relaxed")}
      />
    );
  }
  return (
    <input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") { setDraft(saved.current); (e.target as HTMLInputElement).blur(); } }}
      placeholder={field.placeholder ?? "Empty"}
      aria-label={field.label}
      className={editable}
    />
  );
}

function ListValue({ field, value, onSave }: { field: ProfileField; value: unknown; onSave: (v: string[]) => void }) {
  const initial = Array.isArray(value) ? value.map(String) : [];
  const [items, setItems] = useState<string[]>(initial);
  const savedJson = useRef(JSON.stringify(initial));
  const focusLast = useRef(false);
  const refs = useRef<(HTMLTextAreaElement | null)[]>([]);
  useEffect(() => { setItems(initial); savedJson.current = JSON.stringify(initial); }, [JSON.stringify(initial)]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (focusLast.current) { focusLast.current = false; refs.current[items.length - 1]?.focus(); }
  }, [items.length]);

  const commit = (next: string[]) => {
    const clean = next.map((s) => s.trim()).filter(Boolean);
    const json = JSON.stringify(clean);
    if (json === savedJson.current) return;
    savedJson.current = json;
    onSave(clean);
  };
  // "Target roles" → "target role", "CV rules" → "CV rule" (acronyms keep their case).
  const singular = field.addLabel ?? field.label
    .split(" ")
    .map((w) => (w === w.toUpperCase() ? w : w.toLowerCase()))
    .join(" ")
    .replace(/ies$/, "y")
    .replace(/s$/, "");

  return (
    <div>
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li key={i} className="group flex items-start gap-1">
            <span className="mt-[11px] size-1.5 shrink-0 rounded-full bg-faint" aria-hidden />
            <textarea
              value={item}
              rows={1}
              ref={(el) => { refs.current[i] = el; grow(el); }}
              onChange={(e) => { const next = [...items]; next[i] = e.target.value; setItems(next); grow(e.target); }}
              onBlur={() => commit(items)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); focusLast.current = true; setItems([...items.slice(0, i + 1), "", ...items.slice(i + 1)]); }
                if (e.key === "Backspace" && item === "" && items.length > 0) { e.preventDefault(); const next = items.filter((_, k) => k !== i); setItems(next); commit(next); }
              }}
              aria-label={`${field.label} ${i + 1}`}
              placeholder={`New ${singular}`}
              className={cn(editable, "resize-none overflow-hidden leading-relaxed")}
            />
            <button
              type="button"
              onClick={() => { const next = items.filter((_, k) => k !== i); setItems(next); commit(next); }}
              aria-label={`Remove ${item || "item"}`}
              title="Remove"
              className="mt-1 inline-flex size-7 shrink-0 items-center justify-center rounded-md text-faint opacity-0 transition-opacity hover:bg-surface-hover hover:text-foreground group-hover:opacity-100 focus:opacity-100 max-sm:opacity-100"
            >
              <X className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => { focusLast.current = true; setItems([...items, ""]); }}
        className="mt-1 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
      >
        <Plus className="size-4" /> Add {singular}
      </button>
    </div>
  );
}

function Switch({ on, label, onChange }: { on: boolean; label: string; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className="ml-2.5 mt-1 inline-flex items-center gap-2.5 text-sm text-muted"
    >
      <span className={cn("relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors", on ? "bg-brand" : "bg-border")}>
        <span className={cn("inline-block size-4 rounded-full bg-white shadow-sm transition-transform", on ? "translate-x-[18px]" : "translate-x-0.5")} />
      </span>
      {on ? "Yes" : "No"}
    </button>
  );
}

const TABS: { id: ProfileTab; label: string }[] = [
  { id: "about", label: "About you" },
  { id: "search", label: "Job search" },
  { id: "letters", label: "Letters & rules" },
];

export function ProfileEditor() {
  const [tab, setTab] = useState<ProfileTab>("about");
  useEffect(() => {
    const h = window.location.hash.slice(1);
    if (TABS.some((t) => t.id === h)) setTab(h as ProfileTab);
  }, []);
  const pickTab = (t: ProfileTab) => { setTab(t); history.replaceState(null, "", `#${t}`); };
  const [values, setValues] = useState<Values | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [status, setStatus] = useState<Record<string, Status>>({});

  useEffect(() => {
    fetch("/api/profile/fields", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ values: Values }>) : Promise.reject()))
      .then((d) => setValues(d.values))
      .catch(() => setLoadError(true));
  }, []);

  const save = async (path: string, value: unknown) => {
    setStatus((s) => ({ ...s, [path]: { kind: "saving" } }));
    setValues((v) => (v ? { ...v, [path]: value } : v));
    try {
      const r = await fetch("/api/profile/fields", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path, value }) });
      const body = (await r.json().catch(() => ({}))) as { error?: string; value?: unknown };
      if (!r.ok) throw new Error(body.error ?? "Not saved.");
      setStatus((s) => ({ ...s, [path]: { kind: "saved" } }));
      setTimeout(() => setStatus((s) => (s[path]?.kind === "saved" ? Object.fromEntries(Object.entries(s).filter(([k]) => k !== path)) : s)), 2000);
    } catch (e) {
      setStatus((s) => ({ ...s, [path]: { kind: "error", message: e instanceof Error ? e.message : "Not saved." } }));
    }
  };

  return (
    <div className={JOB_PAGE_FRAME}>
      <header>
        <h1 className="font-display text-2xl tracking-tight text-landing">Your profile</h1>
        <p className="mt-1 text-sm text-muted">What Miao knows about you. Click any value to change it; it saves on its own.</p>
      </header>

      <nav role="tablist" aria-label="Profile sections" className="mt-5 flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => pickTab(t.id)}
            className={cn(
              "-mb-px border-b-2 px-3 pb-2.5 pt-1 text-sm transition-colors",
              tab === t.id ? "border-brand-text font-medium text-foreground" : "border-transparent text-muted hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {loadError && <p className="mt-6 rounded-xl border border-red-300/60 bg-red-50 px-4 py-3 text-sm text-red-800">Your profile could not be read.</p>}
      {!values && !loadError && <div className="mt-6 flex justify-center py-16 text-muted"><Loader2 className="size-5 animate-spin" /></div>}

      {values && (
        <div className="mt-6 space-y-4">
          {tab === "search" && <RolesCard />}
          {PROFILE_CARDS.filter((c) => c.tab === tab).map((card) => (
            <section key={card.id} className="rounded-2xl border border-border bg-surface">
              <div className="border-b border-border px-6 py-4">
                <h2 className="text-base font-semibold text-foreground">{card.title}</h2>
                <p className="text-sm text-muted">{card.description}</p>
              </div>
              <div className="divide-y divide-border">
                {card.fields.map((f) => (
                  <div key={f.path} className="grid grid-cols-1 gap-x-6 gap-y-1 px-6 py-3 sm:grid-cols-[200px_minmax(0,1fr)]">
                    <div className="pt-1.5">
                      <p className="text-sm font-medium text-foreground">{f.label}</p>
                      {f.hint && f.kind !== "list" && <p className="text-xs text-muted">{f.hint}</p>}
                      <StatusBadge status={status[f.path]} />
                    </div>
                    <div className="min-w-0">
                      {f.kind === "bool" ? (
                        <Switch on={values[f.path] === true} label={f.label} onChange={(v) => save(f.path, v)} />
                      ) : f.kind === "list" ? (
                        <ListValue field={f} value={values[f.path]} onSave={(v) => save(f.path, v)} />
                      ) : (
                        <TextValue field={f} value={values[f.path]} onSave={(v) => save(f.path, v)} />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
          {tab === "letters" && <RulesCard />}
        </div>
      )}
    </div>
  );
}

// ── Your rules for Miao (modes/_custom.md) ──
function RulesCard() {
  const [data, setData] = useState<{ groups: RuleGroups } | null>(null);
  const [status, setStatus] = useState<Partial<Record<RuleGroupId, Status>>>({});
  useEffect(() => {
    fetch("/api/profile/rules", { cache: "no-store" }).then((r) => r.json()).then(setData).catch(() => {});
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
  if (!data) return null;
  return (
    <section className="rounded-2xl border border-border bg-surface">
      <div className="border-b border-border px-6 py-4">
        <h2 className="text-base font-semibold text-foreground">Your rules for Miao</h2>
        <p className="text-sm text-muted">Preferences Miao always follows, like &ldquo;keep cover letters under 300 words&rdquo; or &ldquo;never use the word passionate&rdquo;.</p>
      </div>
      <div className="divide-y divide-border">
        {RULE_GROUPS.map((g) => (
          <div key={g.id} className="grid grid-cols-1 gap-x-6 gap-y-1 px-6 py-3 sm:grid-cols-[200px_minmax(0,1fr)]">
            <div className="pt-1.5">
              <p className="text-sm font-medium text-foreground">{g.heading}</p>
              <p className="text-xs text-muted">{g.hint}</p>
              <StatusBadge status={status[g.id]} />
            </div>
            <div className="min-w-0">
              <ListValue field={{ path: `rules.${g.id}`, label: g.label, kind: "list" }} value={data.groups[g.id]} onSave={(v) => save(g.id, v)} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Roles you're targeting (modes/_profile.md table: what scoring reads) ──
function RolesCard() {
  const [doc, setDoc] = useState<RolesDoc | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<Status | undefined>();
  const saved = useRef("");
  const focusNew = useRef(false);
  const nameRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    fetch("/api/profile/roles", { cache: "no-store" })
      .then(async (r) => { const b = await r.json(); if (!r.ok) throw new Error(b.error); return b as RolesDoc; })
      .then((d) => { setDoc(d); saved.current = JSON.stringify(d); })
      .catch((e) => setError(e instanceof Error && e.message ? e.message : "Your roles could not be read."));
  }, []);
  useEffect(() => {
    if (focusNew.current && doc) { focusNew.current = false; nameRefs.current[doc.roles.length - 1]?.focus(); }
  }, [doc?.roles.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const persist = async (next: RolesDoc) => {
    const clean = { ...next, roles: next.roles.filter((r) => r.name.trim()) };
    const json = JSON.stringify(clean);
    if (json === saved.current) return;
    setStatus({ kind: "saving" });
    try {
      const r = await fetch("/api/profile/roles", { method: "PUT", headers: { "Content-Type": "application/json" }, body: json });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b.error ?? "Not saved.");
      saved.current = JSON.stringify(b);
      setStatus({ kind: "saved" });
      setTimeout(() => setStatus((s) => (s?.kind === "saved" ? undefined : s)), 2000);
    } catch (e) {
      setStatus({ kind: "error", message: e instanceof Error ? e.message : "Not saved." });
    }
  };
  const update = (i: number, patch: Partial<Role>, save = false) => {
    if (!doc) return;
    const next = { ...doc, roles: doc.roles.map((r, k) => (k === i ? { ...r, ...patch } : r)) };
    setDoc(next);
    if (save) void persist(next);
  };
  const setRoles = (roles: Role[]) => { if (!doc) return; const next = { ...doc, roles }; setDoc(next); void persist(next); };

  return (
    <section className="rounded-2xl border border-border bg-surface">
      <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">Roles you&apos;re targeting</h2>
          <p className="text-sm text-muted">Miao scores every job against these. <span className="font-medium text-foreground">Main</span> roles count most; <span className="font-medium text-foreground">Backup</span> roles still match, with a lower score.</p>
        </div>
        <StatusBadge status={status} />
      </div>
      {error && <p className="px-6 py-4 text-sm text-red-800">{error}</p>}
      {!doc && !error && <div className="flex justify-center py-8 text-muted"><Loader2 className="size-5 animate-spin" /></div>}
      {doc && (
        <>
          <ul className="divide-y divide-border">
            {doc.roles.map((r, i) => (
              <li key={i} className="group grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 px-6 py-3">
                <div className="min-w-0">
                  <input
                    ref={(el) => { nameRefs.current[i] = el; }}
                    value={r.name}
                    onChange={(e) => update(i, { name: e.target.value })}
                    onBlur={() => persist(doc)}
                    onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                    placeholder="Role name, e.g. Brand Marketing Intern"
                    aria-label={`Role ${i + 1}`}
                    className={cn(editable, "font-medium")}
                  />
                  <textarea
                    value={r.axes}
                    rows={1}
                    ref={grow}
                    onChange={(e) => { update(i, { axes: e.target.value }); grow(e.target); }}
                    onBlur={() => persist(doc)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLTextAreaElement).blur(); } }}
                    placeholder="What it's about, e.g. campaigns, content, brand"
                    aria-label={`What role ${i + 1} is about`}
                    className={cn(editable, "resize-none overflow-hidden leading-relaxed text-muted")}
                  />
                </div>
                <div className="flex items-start gap-1 pt-1">
                  <div role="radiogroup" aria-label={`Priority of ${r.name || "role"}`} className="inline-flex rounded-lg border border-border bg-background p-0.5 text-xs">
                    {(["primary", "secondary"] as const).map((fit) => (
                      <button
                        key={fit}
                        type="button"
                        role="radio"
                        aria-checked={r.fit === fit}
                        onClick={() => update(i, { fit }, true)}
                        className={cn("rounded-md px-2.5 py-1 transition-colors", r.fit === fit ? (fit === "primary" ? "bg-brand text-brand-foreground" : "bg-surface-hover font-medium text-foreground") : "text-muted hover:text-foreground")}
                      >
                        {fit === "primary" ? "Main" : "Backup"}
                      </button>
                    ))}
                  </div>
                  <span className="inline-flex opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 max-sm:opacity-100">
                    <button type="button" disabled={i === 0} onClick={() => { const a = [...doc.roles]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; setRoles(a); }} aria-label="Move up" title="Move up" className="inline-flex size-7 items-center justify-center rounded-md text-faint hover:bg-surface-hover hover:text-foreground disabled:opacity-30"><ArrowUp className="size-3.5" /></button>
                    <button type="button" disabled={i === doc.roles.length - 1} onClick={() => { const a = [...doc.roles]; [a[i + 1], a[i]] = [a[i], a[i + 1]]; setRoles(a); }} aria-label="Move down" title="Move down" className="inline-flex size-7 items-center justify-center rounded-md text-faint hover:bg-surface-hover hover:text-foreground disabled:opacity-30"><ArrowDown className="size-3.5" /></button>
                    <button type="button" onClick={() => setRoles(doc.roles.filter((_, k) => k !== i))} aria-label={`Remove ${r.name || "role"}`} title="Remove" className="inline-flex size-7 items-center justify-center rounded-md text-faint hover:bg-surface-hover hover:text-foreground"><X className="size-3.5" /></button>
                  </span>
                </div>
              </li>
            ))}
          </ul>
          <div className="border-t border-border px-6 py-2">
            <button
              type="button"
              onClick={() => { focusNew.current = true; setDoc({ ...doc, roles: [...doc.roles, { name: "", fit: "secondary", axes: "", buys: "" }] }); }}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
            >
              <Plus className="size-4" /> Add a role
            </button>
          </div>
          <div className="grid grid-cols-1 gap-x-6 gap-y-1 border-t border-border px-6 py-3 sm:grid-cols-[200px_minmax(0,1fr)]">
            <div className="pt-1.5">
              <p className="text-sm font-medium text-foreground">Not interested in</p>
              <p className="text-xs text-muted">Jobs like these get a low score.</p>
            </div>
            <textarea
              value={doc.outOfScope}
              rows={1}
              ref={grow}
              onChange={(e) => { setDoc({ ...doc, outOfScope: e.target.value }); grow(e.target); }}
              onBlur={() => persist(doc)}
              placeholder="e.g. sales quotas, pure finance, customer service"
              aria-label="Not interested in"
              className={cn(editable, "resize-none overflow-hidden leading-relaxed")}
            />
          </div>
        </>
      )}
    </section>
  );
}
