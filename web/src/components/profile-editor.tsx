"use client";

// Fork: the Profile page. A settings-style page: one card per topic, one row per
// field (label left, value right). Values read like plain text and become editable
// on hover/click; lists have one row per item with remove and "+ Add".
// Every change saves on its own.
import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Check, ChevronDown, Info, Loader2, Plus, Star, TriangleAlert, X } from "lucide-react";
import { Tip } from "@/components/ui/tip";
import { JOB_PAGE_FRAME } from "@/components/page-frame";
import { PROFILE_CARDS, ROLE_TITLES_FIELD, isEmptyValue, joinNote, splitNote, type ProfileField, type ProfileTab } from "@/lib/profile-fields";
import type { Role, RolesDoc } from "@/lib/profile-roles";
import { cn } from "@/lib/cn";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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
  // Shown without "(user-stated …)" notes and without placeholder words like "not set";
  // the note is put back on save so the file keeps it.
  const raw = value == null ? "" : String(value);
  const { text, note } = splitNote(raw);
  const initial = isEmptyValue(text) ? "" : text;
  const [draft, setDraft] = useState(initial);
  const saved = useRef(initial);
  useEffect(() => { setDraft(initial); saved.current = initial; }, [initial]);
  const commit = () => {
    const v = draft.trim();
    if (v === saved.current) return;
    saved.current = v;
    onSave(joinNote(v, note));
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

// "Where you'd work": an Anywhere switch, or a set of place chips. Stored as one line of text.
function PlacesValue({ value, onSave }: { value: unknown; onSave: (v: string) => void }) {
  const { text, note } = splitNote(value == null ? "" : String(value));
  const anywhere = /^anywhere\.?$/i.test(text.trim());
  const parsed = anywhere || !text.trim() ? [] : text.split(/\s*,\s*(?:or\s+)?|\s+or\s+/i).map((p) => p.replace(/^or\s+/i, "").trim()).filter(Boolean);
  const [places, setPlaces] = useState<string[]>(parsed);
  const [draft, setDraft] = useState("");
  useEffect(() => { setPlaces(parsed); }, [text]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = (next: string[], any = false) => onSave(joinNote(any ? "anywhere" : next.join(", "), note));
  const add = () => {
    const p = draft.trim();
    if (!p) return;
    const next = places.some((x) => x.toLowerCase() === p.toLowerCase()) ? places : [...places, p];
    setPlaces(next);
    setDraft("");
    save(next);
  };
  return (
    <div className="space-y-2">
      <Switch on={anywhere} label="Anywhere" onChange={(v) => save(v ? [] : places, v)} yes="Anywhere" no="Only these places" />
      {!anywhere && (
        <div className="ml-2.5 flex flex-wrap items-center gap-1.5">
          {places.map((p) => (
            <span key={p} className="inline-flex items-center gap-1 rounded-full border border-border bg-background py-0.5 pl-2.5 pr-1 text-sm text-foreground">
              {p}
              <button type="button" onClick={() => { const next = places.filter((x) => x !== p); setPlaces(next); save(next); }} aria-label={`Remove ${p}`} className="inline-flex size-5 items-center justify-center rounded-full text-faint hover:bg-surface-hover hover:text-foreground">
                <X className="size-3" />
              </button>
            </span>
          ))}
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); } }}
            onBlur={add}
            placeholder={places.length ? "Add a place" : "Add a city or country"}
            aria-label="Add a place"
            className="min-w-[140px] flex-1 rounded-full border border-dashed border-border bg-transparent px-3 py-0.5 text-sm outline-none placeholder:text-faint focus:border-brand/50"
          />
        </div>
      )}
    </div>
  );
}

function Switch({ on, label, onChange, yes = "Yes", no = "No" }: { on: boolean; label: string; onChange: (v: boolean) => void; yes?: string; no?: string }) {
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
      {on ? yes : no}
    </button>
  );
}

const TABS: { id: ProfileTab; label: string }[] = [
  { id: "about", label: "About you" },
  { id: "want", label: "What you want" },
];

// A field label with its description in a tooltip (ⓘ) instead of a line of grey text.
function FieldLabel({ label, hint }: { label: string; hint?: string }) {
  return (
    <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
      {label}
      {hint && (
        <Tip label={hint} wrap side="top">
          <button type="button" aria-label={`About ${label}: ${hint}`} className="inline-flex text-faint transition-colors hover:text-muted focus-visible:text-muted">
            <Info className="size-3.5" />
          </button>
        </Tip>
      )}
    </p>
  );
}

function UsedFor({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((u) => <span key={u} className="rounded-full bg-surface-hover px-2 py-0.5 text-[11px] font-medium text-muted">{u}</span>)}
    </div>
  );
}

export function ProfileEditor() {
  const [tab, setTab] = useState<ProfileTab>("about");
  useEffect(() => {
    const h = window.location.hash.slice(1);
    // Old tab names (bookmarks from before the tabs were renamed) still work.
    // The rules now have their own page.
    if (h === "letters" || h === "rules") { window.location.replace("/rules"); return; }
    const t = ({ search: "want" } as Record<string, string>)[h] ?? h;
    if (TABS.some((x) => x.id === t)) setTab(t as ProfileTab);
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

      <nav role="tablist" aria-label="Profile sections" className="sticky top-0 z-20 -mx-1 mt-5 flex gap-1 border-b border-border bg-background/95 px-1 backdrop-blur">
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
          {tab === "want" && (
            <RolesCard
              titles={<ListValue field={ROLE_TITLES_FIELD} value={values[ROLE_TITLES_FIELD.path]} onSave={(v) => save(ROLE_TITLES_FIELD.path, v)} />}
              titlesStatus={status[ROLE_TITLES_FIELD.path]}
            />
          )}
          {PROFILE_CARDS.filter((c) => c.tab === tab).map((card) => (
            <section key={card.id} className="rounded-2xl border border-border bg-surface">
              <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
                <div>
                  <h2 className="text-base font-semibold text-foreground">{card.title}</h2>
                  <p className="text-sm text-muted">{card.description}</p>
                </div>
                <UsedFor items={card.usedFor} />
              </div>
              <div className="divide-y divide-border">
                {card.fields.map((f) => (
                  <div key={f.path} className="grid grid-cols-1 gap-x-6 gap-y-1 px-6 py-3 sm:grid-cols-[200px_minmax(0,1fr)]">
                    <div className="pt-1.5">
                      <FieldLabel label={f.label} hint={f.hint} />
                      <StatusBadge status={status[f.path]} />
                    </div>
                    <div className="min-w-0">
                      {f.kind === "bool" ? (
                        <Switch on={values[f.path] === true} label={f.label} onChange={(v) => save(f.path, v)} />
                      ) : f.kind === "list" ? (
                        <ListValue field={f} value={values[f.path]} onSave={(v) => save(f.path, v)} />
                      ) : f.kind === "places" ? (
                        <PlacesValue value={values[f.path]} onSave={(v) => save(f.path, v)} />
                      ) : (
                        <TextValue field={f} value={values[f.path]} onSave={(v) => save(f.path, v)} />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
          {tab === "want" && <BriefCard />}
        </div>
      )}
    </div>
  );
}

// ── How Miao filters jobs (modes/_brief.md: what triage and scans score against) ──
// Shown like the rest of the page: one row per "## " section, read as formatted
// text, click to edit the section's Markdown, saves on blur. "Rebuild from
// profile" fills a draft that is only written on Save.
type BriefDoc = { head: string; sections: { title: string; body: string }[] };
function parseBrief(text: string): BriefDoc {
  const parts = text.split(/^## /m);
  return {
    head: parts[0],
    sections: parts.slice(1).map((p) => {
      const nl = p.indexOf("\n");
      return nl < 0 ? { title: p.trim(), body: "" } : { title: p.slice(0, nl).trim(), body: p.slice(nl + 1).trim() };
    }),
  };
}
const joinBrief = (d: BriefDoc) =>
  (d.head.trimEnd() + "\n\n" + d.sections.map((x) => `## ${x.title}\n${x.body.trim()}\n`).join("\n")).trim() + "\n";

const briefMd =
  "text-sm leading-relaxed text-foreground [&_li]:ml-4 [&_li]:list-disc [&_ol_li]:list-decimal [&_p+p]:mt-2 [&_strong]:font-semibold [&_table]:w-full [&_table]:text-xs [&_td]:border-t [&_td]:border-border [&_td]:py-1 [&_td]:pr-3 [&_td]:align-top [&_th]:py-1 [&_th]:pr-3 [&_th]:text-left [&_th]:font-medium [&_th]:text-muted [&_ul]:space-y-0.5";

function BriefSection({ body, onSave }: { body: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(body);
  useEffect(() => { if (!editing) setDraft(body); }, [body, editing]);
  if (editing) {
    return (
      <textarea
        autoFocus
        value={draft}
        ref={grow}
        onChange={(e) => { setDraft(e.target.value); grow(e.target); }}
        onBlur={() => { setEditing(false); if (draft.trim() !== body.trim()) onSave(draft); }}
        onKeyDown={(e) => { if (e.key === "Escape") { setDraft(body); setEditing(false); } }}
        className={cn(editable, "resize-none overflow-hidden leading-relaxed")}
      />
    );
  }
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => setEditing(true)}
      onKeyDown={(e) => { if (e.key === "Enter") setEditing(true); }}
      className="cursor-text rounded-lg border border-transparent px-2.5 py-1.5 transition-colors hover:bg-surface-hover/70"
    >
      {body.trim() ? (
        <div className={briefMd}><ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown></div>
      ) : (
        <span className="text-sm text-faint">Empty</span>
      )}
    </div>
  );
}

function BriefCard() {
  const [saved, setSaved] = useState<string | null>(null);
  const [draft, setDraft] = useState<string | null>(null); // a rebuilt version waiting for Save
  const [busy, setBusy] = useState<"rebuild" | "save" | null>(null);
  const [note, setNote] = useState<{ error?: boolean; msg: string } | null>(null);
  const [rowStatus, setRowStatus] = useState<Record<number, Status>>({});

  // The rebuild runs on the server and leaves a draft file, so leaving the page
  // loses nothing: on load (and every few seconds while it runs) pick it up.
  const load = async () => {
    try {
      const r = await fetch("/api/profile/brief", { cache: "no-store" });
      const d = (await r.json()) as { text: string; draft: string | null; rebuilding: boolean; error: string | null };
      setSaved(d.text);
      setDraft((cur) => (d.draft === null ? null : cur ?? d.draft));
      setBusy((b) => (d.rebuilding ? "rebuild" : b === "rebuild" ? null : b));
      if (d.rebuilding) setNote({ msg: "Miao is rewriting this from your profile. It takes about half a minute; you can leave this page." });
      else if (d.error) setNote({ error: true, msg: d.error });
      else setNote((n) => (n && !n.error && n.msg.startsWith("Miao is rewriting") ? null : n));
      return d.rebuilding;
    } catch {
      setNote({ error: true, msg: "The brief could not be read." });
      return false;
    }
  };
  const [polling, setPolling] = useState(false);
  useEffect(() => { load().then(setPolling); }, []);
  useEffect(() => {
    if (!polling) return;
    const t = setInterval(() => { load().then((still) => { if (!still) setPolling(false); }); }, 3000);
    return () => clearInterval(t);
  }, [polling]);

  const put = async (text: string) => {
    const r = await fetch("/api/profile/brief", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
    const d = (await r.json().catch(() => ({}))) as { error?: string };
    if (!r.ok) throw new Error(d.error ?? "Not saved.");
  };

  const shown = draft ?? saved ?? "";
  const doc = parseBrief(shown);

  const editSection = async (i: number, body: string) => {
    const next = joinBrief({ ...doc, sections: doc.sections.map((x, j) => (j === i ? { ...x, body } : x)) });
    if (draft !== null) { setDraft(next); return; } // part of the rebuilt version; saved with it
    setSaved(next);
    setRowStatus((s) => ({ ...s, [i]: { kind: "saving" } }));
    try {
      await put(next);
      setRowStatus((s) => ({ ...s, [i]: { kind: "saved" } }));
      setTimeout(() => setRowStatus((s) => (s[i]?.kind === "saved" ? Object.fromEntries(Object.entries(s).filter(([k]) => k !== String(i))) : s)), 2000);
    } catch (e) {
      setRowStatus((s) => ({ ...s, [i]: { kind: "error", message: e instanceof Error ? e.message : "Not saved." } }));
    }
  };

  const rebuild = async () => {
    setBusy("rebuild");
    setNote({ msg: "Miao is rewriting this from your profile. It takes about half a minute; you can leave this page." });
    try {
      const r = await fetch("/api/profile/brief", { method: "POST" });
      if (!r.ok) throw new Error("Could not start the rebuild.");
      setDraft(null);
      setPolling(true);
    } catch (e) {
      setBusy(null);
      setNote({ error: true, msg: e instanceof Error ? e.message : "Could not rebuild." });
    }
  };
  const discardDraft = async () => {
    setDraft(null);
    setNote(null);
    await fetch("/api/profile/brief", { method: "DELETE" }).catch(() => {});
  };
  const saveDraft = async () => {
    if (draft === null) return;
    setBusy("save");
    try {
      await put(draft);
      setSaved(draft);
      setDraft(null);
      setNote({ msg: "Saved." });
    } catch (e) {
      setNote({ error: true, msg: e instanceof Error ? e.message : "Not saved." });
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="rounded-2xl border border-border bg-surface">
      <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">How Miao filters jobs</h2>
          <p className="text-sm text-muted">
            The short version of your profile that the quick first check reads when it scores new jobs. Click any part to change it. After you change your
            roles, places or languages, rebuild it so it stays in step.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={rebuild}
              disabled={busy !== null || saved === null}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-foreground hover:bg-background disabled:opacity-50"
            >
              {busy === "rebuild" && <Loader2 className="size-3.5 animate-spin" />} Rebuild from profile
            </button>
            {note && <span className={cn("text-xs", note.error ? "text-red-700" : "text-faint")}>{note.msg}</span>}
          </div>
        </div>
        <UsedFor items={["Scans", "Quick check"]} />
      </div>

      {draft !== null && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-brand-soft px-6 py-3 text-sm">
          <span className="mr-auto text-foreground">New version from your profile. Check it (you can still edit it), then save.</span>
          <button type="button" onClick={discardDraft} disabled={busy !== null} className="rounded-lg px-3 py-1.5 text-sm text-muted hover:text-foreground">
            Discard
          </button>
          <button
            type="button"
            onClick={saveDraft}
            disabled={busy !== null}
            className="inline-flex items-center gap-1.5 rounded-lg bg-foreground px-3 py-1.5 text-sm font-medium text-background disabled:opacity-50"
          >
            {busy === "save" ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} Save
          </button>
        </div>
      )}

      {saved === null && !note?.error ? (
        <div className="flex justify-center py-8 text-muted"><Loader2 className="size-5 animate-spin" /></div>
      ) : (
        <div className="divide-y divide-border">
          {doc.sections.map((x, i) => (
            <div key={`${x.title}-${i}`} className="grid grid-cols-1 gap-x-6 gap-y-1 px-6 py-3 sm:grid-cols-[200px_minmax(0,1fr)]">
              <div className="pt-1.5">
                <FieldLabel label={x.title} />
                <StatusBadge status={rowStatus[i]} />
              </div>
              <div className="min-w-0">
                <BriefSection body={x.body} onSave={(v) => editSection(i, v)} />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ── Roles you're targeting (modes/_profile.md table: what scoring reads) ──
function RolesCard({ titles, titlesStatus }: { titles: React.ReactNode; titlesStatus?: Status }) {
  const [doc, setDoc] = useState<RolesDoc | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<Status | undefined>();
  const saved = useRef("");
  const focusNew = useRef(false);
  const nameRefs = useRef<(HTMLTextAreaElement | null)[]>([]);

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
          <h2 className="text-base font-semibold text-foreground">Roles</h2>
          <p className="text-sm text-muted">The kinds of job you want, and how Miao finds them.</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <UsedFor items={["Scoring", "Job search"]} />
          <StatusBadge status={status} />
        </div>
      </div>
      {error && <p className="px-6 py-4 text-sm text-red-800">{error}</p>}
      {!doc && !error && <div className="flex justify-center py-8 text-muted"><Loader2 className="size-5 animate-spin" /></div>}
      {doc && (
        <>
          {/* The role list is its own inset box, so it reads as one block inside the card. */}
          <div className="grid grid-cols-1 gap-x-6 gap-y-2 px-6 py-3 sm:grid-cols-[200px_minmax(0,1fr)]">
            <div className="pt-1.5">
              <FieldLabel label="Roles you're targeting" hint="Star your main roles: they score highest. Roles without a star still match, a bit lower." />
            </div>
            <div className="min-w-0 overflow-hidden rounded-xl border border-border bg-surface">
          <ul className="divide-y divide-border">
            {doc.roles.map((r, i) => (
              <li key={i} className="group grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 px-2 py-1.5">
                <div className="min-w-0">
                  <textarea
                    ref={(el) => { nameRefs.current[i] = el; grow(el); }}
                    value={r.name}
                    rows={1}
                    onChange={(e) => { update(i, { name: e.target.value.replace(/\n/g, " ") }); grow(e.target); }}
                    onBlur={() => persist(doc)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLTextAreaElement).blur(); } }}
                    placeholder="Role name, e.g. Brand Marketing Intern"
                    aria-label={`Role ${i + 1}`}
                    className={cn(editable, "resize-none overflow-hidden py-1 font-semibold leading-snug")}
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
                    className={cn(editable, "-mt-1 resize-none overflow-hidden py-0.5 text-xs leading-relaxed text-muted")}
                  />
                </div>
                <div className="flex items-start gap-1 pt-1">
                  <Tip label={r.fit === "primary" ? "Main role: scores highest. Click to make it a backup." : "Backup role: still matches, a bit lower. Click to make it a main role."} align="end">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={r.fit === "primary"}
                      aria-label={`${r.name || "Role"}: ${r.fit === "primary" ? "main role" : "backup role"}`}
                      onClick={() => update(i, { fit: r.fit === "primary" ? "secondary" : "primary" }, true)}
                      className={cn("inline-flex size-7 items-center justify-center rounded-md transition-colors hover:bg-surface-hover", r.fit === "primary" ? "text-amber-500" : "text-faint hover:text-muted")}
                    >
                      <Star className="size-4" fill={r.fit === "primary" ? "currentColor" : "none"} />
                    </button>
                  </Tip>
                  <span className="inline-flex opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 max-sm:opacity-100">
                    <button type="button" disabled={i === 0} onClick={() => { const a = [...doc.roles]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; setRoles(a); }} aria-label="Move up" title="Move up" className="inline-flex size-7 items-center justify-center rounded-md text-faint hover:bg-surface-hover hover:text-foreground disabled:opacity-30"><ArrowUp className="size-3.5" /></button>
                    <button type="button" disabled={i === doc.roles.length - 1} onClick={() => { const a = [...doc.roles]; [a[i + 1], a[i]] = [a[i], a[i + 1]]; setRoles(a); }} aria-label="Move down" title="Move down" className="inline-flex size-7 items-center justify-center rounded-md text-faint hover:bg-surface-hover hover:text-foreground disabled:opacity-30"><ArrowDown className="size-3.5" /></button>
                    <button type="button" onClick={() => setRoles(doc.roles.filter((_, k) => k !== i))} aria-label={`Remove ${r.name || "role"}`} title="Remove" className="inline-flex size-7 items-center justify-center rounded-md text-faint hover:bg-surface-hover hover:text-foreground"><X className="size-3.5" /></button>
                  </span>
                </div>
              </li>
            ))}
          </ul>
          <div className="border-t border-border px-2 py-1">
            <button
              type="button"
              onClick={() => { focusNew.current = true; setDoc({ ...doc, roles: [...doc.roles, { name: "", fit: "secondary", axes: "", buys: "" }] }); }}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
            >
              <Plus className="size-4" /> Add a role
            </button>
          </div>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-x-6 gap-y-1 border-t border-border px-6 py-3 sm:grid-cols-[200px_minmax(0,1fr)]">
            <div className="pt-1.5">
              <FieldLabel label={ROLE_TITLES_FIELD.label} hint={ROLE_TITLES_FIELD.hint} />
              <StatusBadge status={titlesStatus} />
            </div>
            <div className="min-w-0">{titles}</div>
          </div>
          <div className="grid grid-cols-1 gap-x-6 gap-y-1 border-t border-border px-6 py-3 sm:grid-cols-[200px_minmax(0,1fr)]">
            <div className="pt-1.5">
              <FieldLabel label="Not interested in" hint="Jobs like these get a low score." />
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
