"use client";

// Fork: in-page PDF viewer. Uses the browser's own PDF viewer (zoom, search,
// print) inside a modal, so the tailored CV opens without leaving the page.
import { useId, useRef } from "react";
import { Download, ExternalLink, X } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Tip } from "@/components/ui/tip";

export function PdfViewer({ src, title, open, onClose }: { src: string; title: string; open: boolean; onClose: () => void }) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const withParam = (key: string) => `${src}${src.includes("?") ? "&" : "?"}${key}`;
  const iconBtn = "inline-flex size-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-hover hover:text-foreground";
  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      labelledBy={titleId}
      initialFocusRef={closeRef}
      panelClassName="flex h-[90vh] max-w-5xl flex-col overflow-hidden p-0"
    >
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <h2 id={titleId} className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{title}</h2>
        <Tip label="Download">
          <a href={withParam("download=1")} className={iconBtn} aria-label="Download PDF"><Download className="size-4" /></a>
        </Tip>
        <Tip label="Open in a new tab">
          <a href={src} target="_blank" rel="noreferrer" className={iconBtn} aria-label="Open in a new tab"><ExternalLink className="size-4" /></a>
        </Tip>
        <Tip label="Close" align="end">
          <button ref={closeRef} type="button" onClick={onClose} className={iconBtn} aria-label="Close viewer"><X className="size-4" /></button>
        </Tip>
      </div>
      <iframe src={src} title={title} className="min-h-0 w-full flex-1 bg-surface-hover" />
    </Modal>
  );
}
