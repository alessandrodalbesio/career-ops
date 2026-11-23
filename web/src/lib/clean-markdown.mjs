// Fork: undo the cosmetic changes TipTap's Markdown export makes, so editing
// cv.md in the visual editor leaves untouched lines byte-identical.
export function cleanMarkdown(md) {
  let out = md
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\\([~_*#+\-.!|>[\]()`])/g, (m, ch, off, str) => {
      // keep escapes that protect real Markdown syntax at line start
      const lineStart = str.lastIndexOf("\n", off) + 1;
      const before = str.slice(lineStart, off);
      if (/^\s*$/.test(before) && /[#>+\-*]/.test(ch)) return m;
      return ch;
    })
    // [text](text) and [x@y](mailto:x@y) → plain text, as typed
    .replace(/\[([^\]]+)\]\((?:mailto:)?([^)]+)\)/g, (m, text, url) => (text === url || `https://${text}` === url || `http://${text}` === url ? text : m));
  if (!out.endsWith("\n")) out += "\n";
  return out;
}
