"use client";

// Fork: "Download PDF" and "Show in Finder" are gone (the hosted dashboard runs on a
// VM, so Finder does nothing, and the PDF viewer already downloads). Kept as a no-op
// so existing call sites keep compiling.
export function CvPdfFileActions(_props: { viewHref: string; className: string }) {
  return null;
}
