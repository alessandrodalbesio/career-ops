"use client";

// Fork: the whole base CV (cv.md) inside the CV studio, read-only, so Greta can
// see what Miao left out. Each line has a copy button for "+ Add a line".
import { useEffect, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Copy, Loader2 } from "lucide-react";
import { noMarkdownImages } from "@/lib/markdown-options.mjs";

function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (node && typeof node === "object" && "props" in node) return textOf((node as { props: { children?: ReactNode } }).props.children);
  return "";
}

function CopyLine({ children }: { children?: ReactNode }) {
  const [done, setDone] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(textOf(children).trim()).then(() => {
      setDone(true);
      setTimeout(() => setDone(false), 1200);
    }, () => {});
  };
  return (
    <li className="group relative -mx-2 rounded-md px-2 py-0.5 pr-8 hover:bg-surface-hover">
      {children}
      <button
        type="button"
        onClick={copy}
        aria-label="Copy this line"
        title="Copy this line"
        className="absolute right-1 top-0.5 inline-flex size-6 items-center justify-center rounded text-faint opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100 max-sm:opacity-100"
      >
        {done ? <Check className="size-3.5 text-emerald-700" /> : <Copy className="size-3.5" />}
      </button>
    </li>
  );
}

export function FullCv() {
  const [md, setMd] = useState<string | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    fetch("/api/cv", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ content?: string }>) : Promise.reject()))
      .then((d) => setMd(d.content ?? ""))
      .catch(() => setError(true));
  }, []);
  if (error) return <p className="p-4 text-sm text-red-700">Your CV could not be read.</p>;
  if (md === null) return <div className="flex justify-center p-10 text-muted"><Loader2 className="size-5 animate-spin" /></div>;
  return (
    <div className="space-y-2 p-5 text-sm leading-relaxed text-foreground [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:mt-5 [&_h2]:border-b [&_h2]:border-border [&_h2]:pb-1 [&_h2]:text-xs [&_h2]:font-semibold [&_h2]:uppercase [&_h2]:tracking-wide [&_h2]:text-muted [&_h3]:mt-3 [&_h3]:font-semibold [&_strong]:font-semibold [&_ul]:mt-1 [&_ul]:space-y-0.5 [&_ul]:pl-4 [&_ul]:list-disc [&_ul_ul]:mt-0.5 [&_a]:text-brand-text [&_a]:underline">
      <ReactMarkdown remarkPlugins={[remarkGfm]} {...noMarkdownImages} components={{ li: ({ children }) => <CopyLine>{children}</CopyLine> }}>
        {md}
      </ReactMarkdown>
    </div>
  );
}
