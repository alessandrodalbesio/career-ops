"use client";

// Fork: a Notion-style rich-text editor built from free TipTap pieces, kept to
// what a CV and a cover letter need.
// - hover a block: "+" (add a block below) and "⋮⋮" (drag to move, click for Turn into / Duplicate / Delete)
// - type "/" : block menu (text, headings, lists)
// - select text: toolbar (Turn into, bold, italic, underline, strike, link, clear formatting)
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { Markdown } from "@tiptap/markdown";
import { cleanMarkdown } from "@/lib/clean-markdown.mjs";
import { DragHandle } from "@tiptap/extension-drag-handle-react";
import type { Node as PMNode, Slice } from "@tiptap/pm/model";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import type { EditorProps, EditorView } from "@tiptap/pm/view";
import {
  Bold, ChevronDown, ChevronRight, Copy, GripVertical, Heading1, Heading2, Heading3, Italic, Link as LinkIcon, List, ListOrdered, Plus, RefreshCw, RemoveFormatting, Strikethrough, Trash2, Type, Underline,
} from "lucide-react";
import { cn } from "@/lib/cn";

const CSS = `
.notion-doc { outline: none; font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI Variable Display", "Segoe UI", Helvetica, "Apple Color Emoji", Arial, sans-serif; font-size: 16px; line-height: 1.5; color: rgb(55 53 47); caret-color: rgb(55 53 47); -webkit-font-smoothing: auto; }
.notion-doc > * { margin: 1px 0; padding: 3px 2px; }
.notion-doc > :first-child { margin-top: 0; }
.notion-doc p { min-height: 1.5em; }
.notion-doc h1 { font-size: 1.875em; font-weight: 600; line-height: 1.3; margin-top: 2em; margin-bottom: 4px; }
.notion-doc h2 { font-size: 1.5em; font-weight: 600; line-height: 1.3; margin-top: 1.4em; margin-bottom: 1px; }
.notion-doc h3 { font-size: 1.25em; font-weight: 600; line-height: 1.3; margin-top: 1em; margin-bottom: 1px; }
.notion-doc > h1:first-child, .notion-doc > h2:first-child, .notion-doc > h3:first-child { margin-top: 0; }
/* Lists like Notion: a 1.6em column for the bullet/number, then the text block. */
.notion-doc ul, .notion-doc ol { list-style: none; padding: 0 !important; margin: 1px 0; }
.notion-doc li { position: relative; padding-left: 1.6em; margin: 1px 0; }
.notion-doc li > p { padding: 3px 2px; margin: 0; }
.notion-doc li::before { position: absolute; left: 0; width: 1.6em; text-align: center; color: rgb(55 53 47); }
.notion-doc ul > li::before { content: "•"; font-family: Arial, sans-serif; font-size: 1.5em; line-height: 1; top: 0.18em; width: 1.0667em; }
.notion-doc ul ul > li::before { content: "◦"; }
.notion-doc ul ul ul > li::before { content: "▪"; font-size: 1.2em; top: 0.35em; width: 1.3333em; }
.notion-doc ol { counter-reset: n; }
.notion-doc ol > li { counter-increment: n; }
.notion-doc ol > li::before { content: counter(n) "."; top: 3px; line-height: 1.5; }
.notion-doc ol ol > li::before { content: counter(n, lower-alpha) "."; }
.notion-doc ol ol ol > li::before { content: counter(n, lower-roman) "."; }
.notion-doc strong { font-weight: 600; }
.notion-doc code { background: rgb(135 131 120 / 0.15); color: #eb5757; border-radius: 4px; padding: 0.2em 0.4em; font-size: 85%; font-family: "SFMono-Regular", Menlo, Consolas, monospace; }
.notion-doc a { color: inherit; text-decoration: none; border-bottom: 0.05em solid rgb(55 53 47 / 0.4); opacity: 0.7; cursor: pointer; }
.notion-doc a:hover { opacity: 1; }
.notion-doc blockquote { border-left: 3px solid currentColor; padding-left: 14px; }
.notion-doc hr { border: 0; border-top: 1px solid rgb(55 53 47 / 0.16); margin: 6px 0; padding: 0; }
.notion-doc p.is-empty::before { content: attr(data-placeholder); color: rgb(55 53 47 / 0.35); float: left; height: 0; pointer-events: none; }
.notion-doc ::selection { background: rgb(35 131 226 / 0.28); }
.notion-doc .ProseMirror-selectednode { outline: none; background: rgb(35 131 226 / 0.14); border-radius: 3px; }
.drag-handle { transition: opacity 120ms; }
`;

// ── Block types: the "/" menu, "Turn into" in the block menu and in the toolbar ──
type BlockKey = "text" | "h1" | "h2" | "h3" | "bullet" | "numbered";
type BlockType = { key: BlockKey; label: string; shortcut: string; icon: React.ReactNode; keys: string };
const BLOCKS: BlockType[] = [
  { key: "text", label: "Text", shortcut: "", icon: <Type className="size-4" />, keys: "text paragraph plain" },
  { key: "h1", label: "Heading 1", shortcut: "#", icon: <Heading1 className="size-4" />, keys: "h1 heading title" },
  { key: "h2", label: "Heading 2", shortcut: "##", icon: <Heading2 className="size-4" />, keys: "h2 heading subtitle" },
  { key: "h3", label: "Heading 3", shortcut: "###", icon: <Heading3 className="size-4" />, keys: "h3 heading" },
  { key: "bullet", label: "Bulleted list", shortcut: "-", icon: <List className="size-4" />, keys: "bullet bulleted list ul" },
  { key: "numbered", label: "Numbered list", shortcut: "1.", icon: <ListOrdered className="size-4" />, keys: "numbered ordered list ol" },
];

/** Change the block under the cursor to another type (from any type, lists included). */
function turnInto(ed: Editor, key: BlockKey) {
  const chain = ed.chain().focus().clearNodes();
  if (key === "h1") chain.setHeading({ level: 1 });
  else if (key === "h2") chain.setHeading({ level: 2 });
  else if (key === "h3") chain.setHeading({ level: 3 });
  else if (key === "bullet") chain.toggleBulletList();
  else if (key === "numbered") chain.toggleOrderedList();
  chain.run();
}

function currentBlock(ed: Editor): BlockType {
  if (ed.isActive("bulletList")) return BLOCKS[4];
  if (ed.isActive("orderedList")) return BLOCKS[5];
  if (ed.isActive("heading", { level: 1 })) return BLOCKS[1];
  if (ed.isActive("heading", { level: 2 })) return BLOCKS[2];
  if (ed.isActive("heading", { level: 3 })) return BLOCKS[3];
  return BLOCKS[0];
}

const matches = (q: string) => BLOCKS.filter((c) => !q || c.label.toLowerCase().includes(q.toLowerCase()) || c.keys.includes(q.toLowerCase()));

type Slash = { from: number; query: string; x: number; y: number; caretX: number; caretY: number; index: number; above: boolean; fromPlus: boolean };
type BlockMenuState = { pos: number; x: number; y: number; turnInto: boolean };

/**
 * A dragged top-level block (paragraph, heading, whole list…) lands between
 * top-level blocks, never inside a list item. List items keep the default drop,
 * so they can still be reordered inside their list.
 */
function dropBetweenBlocks(view: EditorView, event: DragEvent, slice: Slice, moved: boolean): boolean {
  if (!moved || slice.content.childCount === 0) return false;
  const first = slice.content.firstChild;
  if (!first || first.type.name === "listItem") return false;
  const hit = view.posAtCoords({ left: event.clientX, top: event.clientY });
  if (!hit) return false;
  const doc = view.state.doc;
  const index = Math.min(doc.resolve(hit.pos).index(0), doc.childCount - 1);
  let start = 0;
  for (let i = 0; i < index; i++) start += doc.child(i).nodeSize;
  const node = doc.child(index);
  const dom = view.nodeDOM(start) as HTMLElement | null;
  const rect = dom?.getBoundingClientRect();
  const target = rect && event.clientY < rect.top + rect.height / 2 ? start : start + node.nodeSize;
  const { from, to } = view.state.selection;
  event.preventDefault();
  if (target >= from && target <= to) return true; // dropped onto itself
  const tr = view.state.tr.deleteSelection();
  const at = tr.mapping.map(target);
  tr.insert(at, slice.content);
  tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(at + slice.content.size - 1, tr.doc.content.size)), -1));
  view.dispatch(tr.scrollIntoView());
  view.focus();
  return true;
}

const menuBox = "rounded-lg border border-[rgb(55,53,47,0.09)] bg-white shadow-[0_0_0_1px_rgba(15,15,15,0.03),0_8px_24px_rgba(15,15,15,0.14)]";
const menuRow = "mx-1 flex w-[calc(100%-8px)] items-center gap-2 rounded-md px-2 py-1 text-left text-sm text-[rgb(55,53,47)]";
const rowHover = "hover:bg-[rgb(55,53,47,0.08)]";

function BlockList({ onPick, active, index, onHover }: { onPick: (b: BlockType) => void; active?: BlockKey; index?: number; onHover?: (i: number) => void }) {
  return (
    <>
      {BLOCKS.map((b, i) => (
        <button
          key={b.key}
          type="button"
          role="option"
          aria-selected={index === i}
          onMouseDown={(e) => e.preventDefault()}
          onMouseEnter={() => onHover?.(i)}
          onClick={() => onPick(b)}
          className={cn(menuRow, index === undefined ? rowHover : index === i && "bg-[rgb(55,53,47,0.08)]")}
        >
          <span className="text-[rgb(55,53,47,0.75)]">{b.icon}</span>
          <span className="flex-1">{b.label}</span>
          {active === b.key && <span className="text-[rgb(35,131,226)]">✓</span>}
          {b.shortcut && active === undefined && <span className="text-xs text-[rgb(55,53,47,0.45)]">{b.shortcut}</span>}
        </button>
      ))}
    </>
  );
}

function BubbleButton({ active, onClick, label, children }: { active?: boolean; onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn("inline-flex h-8 min-w-8 items-center justify-center rounded px-1.5 transition-colors", active ? "text-[rgb(35,131,226)]" : "text-[rgb(55,53,47)] hover:bg-[rgb(55,53,47,0.08)]")}
    >
      {children}
    </button>
  );
}

export function NotionEditor({ initialHtml, onChange, placeholder = "Type '/' for commands", onReady, format = "html", editable = true }: {
  /** Initial content: HTML, or Markdown when format is "markdown". */
  initialHtml: string;
  /** Called with HTML, or with Markdown when format is "markdown". */
  onChange: (content: string) => void;
  placeholder?: string;
  onReady?: (editor: Editor) => void;
  format?: "html" | "markdown";
  editable?: boolean;
}) {
  const [slash, setSlash] = useState<Slash | null>(null);
  const [blockMenu, setBlockMenu] = useState<BlockMenuState | null>(null);
  const [turnIntoOpen, setTurnIntoOpen] = useState(false);
  const handleInner = useRef<HTMLDivElement>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkValue, setLinkValue] = useState("");
  const linkOpenRef = useRef(false);
  linkOpenRef.current = linkOpen;
  const slashRef = useRef<Slash | null>(null);
  slashRef.current = slash;
  const hovered = useRef<{ node: PMNode | null; pos: number }>({ node: null, pos: -1 });
  // Opened from "+": no "/" in the text; the menu filters on what is typed after it.
  const plusOpen = useRef<number | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const wrap = useRef<HTMLDivElement>(null);

  const runSlash = useCallback((editor: Editor, block: BlockType) => {
    const s = slashRef.current;
    if (s && editor.state.selection.from > s.from) editor.chain().focus().deleteRange({ from: s.from, to: editor.state.selection.from }).run();
    turnInto(editor, block.key);
    plusOpen.current = null;
    setSlash(null);
  }, []);

  // Created once: useEditor re-applies options whenever these objects change, which
  // reset the editor's plugins on every keystroke (and broke "- ", "1. ", "# ").
  const extensions = useMemo(() => [
      StarterKit.configure({ link: { openOnClick: false, autolink: format === "html" } }),
      ...(format === "markdown" ? [Markdown] : []),
      Placeholder.configure({ placeholder, showOnlyCurrent: true, includeChildren: false }),
    ], [format, placeholder]);
  const editorProps = useMemo<EditorProps>(() => ({
      attributes: { class: "notion-doc", spellcheck: "true" },
      handleDrop: (view, event, slice, moved) => dropBetweenBlocks(view, event as DragEvent, slice, moved),
      handleDOMEvents: {
        // After a drop, leave the cursor at the end of the moved block instead of a highlighted selection.
        drop: (view) => {
          setTimeout(() => {
            const { to } = view.state.selection;
            if (!view.state.selection.empty) view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(Math.max(0, to - 1)), -1)));
          }, 0);
          return false;
        },
      },
      handleKeyDown: (_view, event) => {
        const s = slashRef.current;
        if (!s) return false;
        const list = matches(s.query);
        if (event.key === "ArrowDown") { setSlash({ ...s, index: (s.index + 1) % Math.max(list.length, 1) }); return true; }
        if (event.key === "ArrowUp") { setSlash({ ...s, index: (s.index - 1 + list.length) % Math.max(list.length, 1) }); return true; }
        if (event.key === "Escape") { plusOpen.current = null; setSlash(null); return true; }
        if (event.key === "Enter" && list[s.index]) {
          event.preventDefault();
          const ed = editorRef.current;
          if (ed) runSlash(ed, list[s.index]);
          return true;
        }
        return false;
      },
  }), []);
  const editor = useEditor({
    extensions,
    immediatelyRender: false,
    content: initialHtml,
    ...(format === "markdown" ? { contentType: "markdown" as const } : {}),
    editable,
    editorProps,
    onUpdate: ({ editor: e }) => {
      onChangeRef.current(format === "markdown" ? cleanMarkdown(e.getMarkdown()) : e.getHTML());
      updateSlash(e);
    },
    onSelectionUpdate: ({ editor: e }) => { updateSlash(e); setTurnIntoOpen(false); if (e.isFocused) setLinkOpen(false); },
  });
  const editorRef = useRef<Editor | null>(null);
  editorRef.current = editor;

  // The toolbar re-reads these on every change (current block type, active marks).
  const tb = useEditorState({
    editor,
    selector: ({ editor: ed }) => (ed ? {
      block: currentBlock(ed),
      bold: ed.isActive("bold"),
      italic: ed.isActive("italic"),
      underline: ed.isActive("underline"),
      strike: ed.isActive("strike"),
      link: ed.isActive("link"),
    } : null),
  });
  const bubbleShouldShow = useCallback(
    ({ editor: ed, state }: { editor: Editor; state: Editor["state"] }) =>
      (linkOpenRef.current || ed.isFocused) && !state.selection.empty && state.selection instanceof TextSelection && !ed.view.dragging,
    [],
  );

  // The menu opens under the cursor, or above it when there is no room below.
  function placeMenu(e: Editor, pos: number) {
    const coords = e.view.coordsAtPos(pos);
    const box = wrap.current?.getBoundingClientRect();
    const above = window.innerHeight - coords.bottom < 380;
    return {
      x: coords.left - (box?.left ?? 0),
      y: above ? coords.top - (box?.top ?? 0) - 6 : coords.bottom - (box?.top ?? 0) + 6,
      caretX: coords.right - (box?.left ?? 0),
      caretY: coords.top - (box?.top ?? 0),
      above,
    };
  }

  function updateSlash(e: Editor) {
    const { $from, empty } = e.state.selection;
    if (!empty) { plusOpen.current = null; return setSlash(null); }
    const prev = slashRef.current;
    if (plusOpen.current !== null) {
      const start = plusOpen.current;
      if ($from.pos < start || $from.parent !== e.state.doc.resolve(start).parent) { plusOpen.current = null; return setSlash(null); }
      const query = e.state.doc.textBetween(start, $from.pos);
      if (query.length > 20) { plusOpen.current = null; return setSlash(null); }
      return setSlash({ from: start, query, ...placeMenu(e, $from.pos), index: prev && prev.query === query ? prev.index : 0, fromPlus: true });
    }
    const before = $from.parent.textBetween(0, $from.parentOffset, undefined, "￼");
    const m = before.match(/(?:^|\s)\/([a-zA-Z0-9 ]{0,20})$/);
    if (!m || $from.parent.type.name === "codeBlock") return setSlash(null);
    setSlash({
      from: $from.pos - m[1].length - 1,
      query: m[1],
      ...placeMenu(e, $from.pos),
      index: prev && prev.query === m[1] ? prev.index : 0,
      fromPlus: false,
    });
  }

  useEffect(() => { if (editor && onReady) onReady(editor); }, [editor, onReady]);
  useEffect(() => { editor?.setEditable(editable); }, [editor, editable]);

  // "+": a new empty block below the hovered one (or reuse it if it is already
  // an empty paragraph), with the block menu open. Nothing is typed into the text.
  const addBlockBelow = () => {
    const { node, pos } = hovered.current;
    if (!editor || !node || pos < 0) return;
    let caret: number;
    if (node.type.name === "paragraph" && node.content.size === 0) {
      caret = pos + 1;
      editor.chain().focus().setTextSelection(caret).run();
    } else {
      const at = pos + node.nodeSize;
      editor.chain().focus().insertContentAt(at, { type: "paragraph" }).setTextSelection(at + 1).run();
      caret = at + 1;
    }
    plusOpen.current = caret;
    setSlash({ from: caret, query: "", ...placeMenu(editor, caret), index: 0, fromPlus: true });
  };

  // ── Block menu (click on ⋮⋮) ──
  const openBlockMenu = (e: React.MouseEvent) => {
    const { node, pos } = hovered.current;
    if (!editor || !node || pos < 0) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const box = wrap.current?.getBoundingClientRect();
    // Highlight the block while its menu is open, and keep the handle where it is.
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, pos)).setMeta("lockDragHandle", true));
    setBlockMenu({ pos, x: r.left - (box?.left ?? 0), y: r.bottom - (box?.top ?? 0) + 4, turnInto: false });
  };
  const closeBlockMenu = useCallback(() => {
    setBlockMenu(null);
    const ed = editorRef.current;
    if (ed && !ed.isDestroyed) ed.view.dispatch(ed.state.tr.setMeta("lockDragHandle", false));
  }, []);
  useEffect(() => {
    if (!blockMenu) return;
    const onDown = (ev: MouseEvent) => {
      if (!(ev.target as HTMLElement).closest("[data-block-menu]")) closeBlockMenu();
    };
    const onKey = (ev: KeyboardEvent) => { if (ev.key === "Escape") { closeBlockMenu(); editorRef.current?.commands.focus(); } };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [blockMenu, closeBlockMenu]);

  const menuNode = () => (editor && blockMenu ? editor.state.doc.nodeAt(blockMenu.pos) : null);
  const blockTurnInto = (b: BlockType) => {
    const node = menuNode();
    if (!editor || !node || !blockMenu) return;
    editor.chain().focus().setTextSelection(TextSelection.near(editor.state.doc.resolve(blockMenu.pos + 1)).from).run();
    turnInto(editor, b.key);
    closeBlockMenu();
  };
  const blockDuplicate = () => {
    const node = menuNode();
    if (!editor || !node || !blockMenu) return;
    const at = blockMenu.pos + node.nodeSize;
    editor.chain().focus().insertContentAt(at, node.toJSON()).setTextSelection(TextSelection.near(editor.state.doc.resolve(Math.min(at + node.nodeSize - 1, editor.state.doc.content.size))).from).run();
    closeBlockMenu();
  };
  const blockDelete = () => {
    const node = menuNode();
    if (!editor || !node || !blockMenu) return;
    editor.chain().focus().deleteRange({ from: blockMenu.pos, to: blockMenu.pos + node.nodeSize }).run();
    closeBlockMenu();
  };
  const menuBlockType = (): BlockKey | undefined => {
    const node = menuNode();
    if (!editor || !node || !blockMenu) return undefined;
    const $pos = editor.state.doc.resolve(blockMenu.pos);
    const inList = node.type.name === "listItem" || $pos.parent.type.name === "listItem";
    if (inList) {
      for (let d = $pos.depth; d >= 0; d--) {
        const n = $pos.node(d).type.name;
        if (n === "bulletList") return "bullet";
        if (n === "orderedList") return "numbered";
      }
    }
    if (node.type.name === "heading") return (`h${node.attrs.level}` as BlockKey);
    return "text";
  };

  // Link: a field inside the toolbar, like Notion (no browser alert).
  const openLink = () => {
    if (!editor) return;
    setLinkValue(((editor.getAttributes("link").href as string | undefined) ?? "").replace(/^mailto:/i, ""));
    setLinkOpen(true);
  };
  const applyLink = () => {
    if (!editor) return;
    let url = linkValue.trim();
    if (url && !/^(https?:|mailto:|tel:)/i.test(url)) url = /@/.test(url) && !/\//.test(url) ? `mailto:${url}` : `https://${url}`;
    const chain = editor.chain().focus().extendMarkRange("link");
    if (url) chain.setLink({ href: url }); else chain.unsetLink();
    chain.run();
    setLinkOpen(false);
  };
  const removeLink = () => {
    editor?.chain().focus().extendMarkRange("link").unsetLink().run();
    setLinkOpen(false);
  };

  const list = slash ? matches(slash.query) : [];

  return (
    <div ref={wrap} className="relative">
      <style>{CSS}</style>
      {editor && (
        <DragHandle
          editor={editor}
          className="drag-handle"
          nested
          onNodeChange={({ node, pos, editor: ed }) => {
            if (!node) return;
            hovered.current = { node, pos };
            // Centre the handle on the block's first line (headings are taller than text).
            const dom = ed.view.nodeDOM(pos) as HTMLElement | null;
            if (dom && dom.nodeType === 1) {
              const text = (dom.tagName === "LI" || dom.tagName === "UL" || dom.tagName === "OL" ? dom.querySelector("p, h1, h2, h3") : dom) as HTMLElement | null;
              if (text) {
                const cs = getComputedStyle(text);
                const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.5;
                const top = text.getBoundingClientRect().top - dom.getBoundingClientRect().top + (parseFloat(cs.paddingTop) || 0);
                // Set directly on the element (no React re-render), so it moves with the handle in one step.
                if (handleInner.current) handleInner.current.style.transform = `translateY(${Math.max(0, top + (lh - 24) / 2)}px)`;
              }
            }
          }}
        >
          <div ref={handleInner} className="mr-1 flex items-center text-[rgb(55,53,47,0.35)]">
            <button
              type="button"
              aria-label="Add a block below"
              title="Click to add below"
              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
              onClick={addBlockBelow}
              draggable={false}
              className="inline-flex size-6 items-center justify-center rounded hover:bg-[rgb(55,53,47,0.08)] hover:text-[rgb(55,53,47,0.7)]"
            >
              <Plus className="size-4" />
            </button>
            <span
              role="button"
              aria-label="Drag to move, click for options"
              title="Drag to move · Click for options"
              onClick={openBlockMenu}
              className="inline-flex h-6 w-[18px] cursor-grab items-center justify-center rounded hover:bg-[rgb(55,53,47,0.08)] hover:text-[rgb(55,53,47,0.7)] active:cursor-grabbing"
            >
              <GripVertical className="size-4" />
            </span>
          </div>
        </DragHandle>
      )}

      {editor && (
        <BubbleMenu
          editor={editor}
          shouldShow={bubbleShouldShow}
          className={cn("flex items-center p-0.5", menuBox)}
        >
          {linkOpen ? (
            <form className="w-[300px] p-1" onSubmit={(e) => { e.preventDefault(); applyLink(); }}>
              <input
                autoFocus
                value={linkValue}
                onChange={(e) => setLinkValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); setLinkOpen(false); editor.commands.focus(); } }}
                placeholder="Paste a link or email"
                className="h-8 w-full rounded-md bg-[rgb(242,241,238,0.6)] px-2.5 text-sm text-[rgb(55,53,47)] shadow-[inset_0_0_0_1px_rgb(15,15,15,0.1)] outline-none placeholder:text-[rgb(55,53,47,0.4)] focus:shadow-[inset_0_0_0_1px_rgb(35,131,226,0.57),0_0_0_2px_rgb(35,131,226,0.25)]"
              />
              {tb?.link && (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={removeLink}
                  className="mt-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-[rgb(55,53,47)] hover:bg-[rgb(55,53,47,0.08)]"
                >
                  <Trash2 className="size-4 text-[rgb(55,53,47,0.6)]" /> Remove link
                </button>
              )}
            </form>
          ) : (
          <>
          <div className="relative">
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setTurnIntoOpen((o) => !o)}
              aria-expanded={turnIntoOpen}
              title="Turn into"
              className="inline-flex h-8 items-center gap-1 rounded px-2 text-sm text-[rgb(55,53,47)] hover:bg-[rgb(55,53,47,0.08)]"
            >
              {tb?.block.label}
              <ChevronDown className="size-3.5 text-[rgb(55,53,47,0.5)]" />
            </button>
            {turnIntoOpen && (
              <div role="listbox" className={cn("absolute left-0 top-9 z-50 w-52 py-1", menuBox)}>
                <p className="px-3 pb-1 pt-0.5 text-[11px] font-medium text-[rgb(55,53,47,0.5)]">Turn into</p>
                <BlockList active={tb?.block.key} onPick={(b) => { turnInto(editor, b.key); setTurnIntoOpen(false); }} />
              </div>
            )}
          </div>
          <span className="mx-0.5 h-5 w-px bg-[rgb(55,53,47,0.09)]" />
          <BubbleButton label="Bold" active={tb?.bold} onClick={() => editor.chain().focus().toggleBold().run()}><Bold className="size-4" /></BubbleButton>
          <BubbleButton label="Italic" active={tb?.italic} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic className="size-4" /></BubbleButton>
          <BubbleButton label="Underline" active={tb?.underline} onClick={() => editor.chain().focus().toggleUnderline().run()}><Underline className="size-4" /></BubbleButton>
          <BubbleButton label="Strikethrough" active={tb?.strike} onClick={() => editor.chain().focus().toggleStrike().run()}><Strikethrough className="size-4" /></BubbleButton>
          <BubbleButton label="Link" active={tb?.link} onClick={openLink}><LinkIcon className="size-4" /></BubbleButton>
          <span className="mx-0.5 h-5 w-px bg-[rgb(55,53,47,0.09)]" />
          <BubbleButton label="Clear formatting" onClick={() => editor.chain().focus().unsetAllMarks().run()}><RemoveFormatting className="size-4" /></BubbleButton>
          </>
          )}
        </BubbleMenu>
      )}

      <EditorContent editor={editor} />

      {/* "/" menu */}
      {slash && editor && (
        <>
          {slash.query === "" && (
            <span className="pointer-events-none absolute z-30 whitespace-nowrap text-[16px] leading-[1.65] text-[rgb(55,53,47,0.35)]" style={{ left: slash.caretX + 1, top: slash.caretY - 2 }}>
              {slash.fromPlus ? "Type to filter…" : "Type to search"}
            </span>
          )}
          <div
            role="listbox"
            className={cn("absolute z-40 flex w-[260px] flex-col overflow-hidden", menuBox)}
            style={slash.above ? { left: slash.x, bottom: `calc(100% - ${slash.y}px)` } : { left: slash.x, top: slash.y }}
          >
            <div className="max-h-[300px] overflow-y-auto py-1">
              <p className="px-3 pb-1 pt-1 text-[11px] font-medium text-[rgb(55,53,47,0.5)]">Basic blocks</p>
              {list.length === 0 ? (
                <p className="px-3 py-1.5 text-sm text-[rgb(55,53,47,0.5)]">No results</p>
              ) : (
                list.map((c, i) => (
                  <button
                    key={c.key}
                    type="button"
                    role="option"
                    aria-selected={i === slash.index}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setSlash({ ...slash, index: i })}
                    onClick={() => runSlash(editor, c)}
                    className={cn(menuRow, i === slash.index && "bg-[rgb(55,53,47,0.08)]")}
                  >
                    <span className="text-[rgb(55,53,47,0.75)]">{c.icon}</span>
                    <span className="flex-1">{c.label}</span>
                    {c.shortcut && <span className="text-xs text-[rgb(55,53,47,0.45)]">{c.shortcut}</span>}
                  </button>
                ))
              )}
            </div>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { plusOpen.current = null; setSlash(null); editor.commands.focus(); }}
              className="flex items-center justify-between border-t border-[rgb(55,53,47,0.09)] px-3 py-2 text-left text-sm text-[rgb(55,53,47)] hover:bg-[rgb(55,53,47,0.04)]"
            >
              Close menu <span className="text-xs text-[rgb(55,53,47,0.45)]">esc</span>
            </button>
          </div>
        </>
      )}

      {/* Block menu (click on ⋮⋮) */}
      {blockMenu && editor && (
        <div data-block-menu className={cn("absolute z-50 w-56 py-1", menuBox)} style={{ left: blockMenu.x, top: blockMenu.y }}>
          {!blockMenu.turnInto ? (
            <>
              <button type="button" className={cn(menuRow, rowHover)} onMouseDown={(e) => e.preventDefault()} onClick={() => setBlockMenu({ ...blockMenu, turnInto: true })}>
                <RefreshCw className="size-4 text-[rgb(55,53,47,0.75)]" /><span className="flex-1">Turn into</span><ChevronRight className="size-3.5 text-[rgb(55,53,47,0.45)]" />
              </button>
              <button type="button" className={cn(menuRow, rowHover)} onMouseDown={(e) => e.preventDefault()} onClick={blockDuplicate}>
                <Copy className="size-4 text-[rgb(55,53,47,0.75)]" /><span className="flex-1">Duplicate</span>
              </button>
              <button type="button" className={cn(menuRow, rowHover)} onMouseDown={(e) => e.preventDefault()} onClick={blockDelete}>
                <Trash2 className="size-4 text-[rgb(55,53,47,0.75)]" /><span className="flex-1">Delete</span><span className="text-xs text-[rgb(55,53,47,0.45)]">Del</span>
              </button>
            </>
          ) : (
            <>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setBlockMenu({ ...blockMenu, turnInto: false })} className="flex items-center gap-1 px-3 pb-1 pt-0.5 text-[11px] font-medium text-[rgb(55,53,47,0.5)] hover:text-[rgb(55,53,47)]">
                ‹ Turn into
              </button>
              <BlockList active={menuBlockType()} onPick={blockTurnInto} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
