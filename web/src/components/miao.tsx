"use client";

import { useEffect, useRef, useState } from "react";

// The agent's pixel miao: a sitting cat (k outline, f fur, s stripes, b belly, p inner ears, e eyes, r blush) with a yarn
// ball. Its three grids differ only in the tail; cycling them swishes it. While the agent works, the cat hops, its tail
// swishes faster and the ball bounces. Click the cat for a meow and
// floating hearts; kick the ball and it bounces while the cat hops after it.
// It falls asleep after a while without input. Pure SVG + CSS, scaled by whole pixels so it stays crisp.
const TAIL_CURLED = [
  "..kkk.......kkk.......",
  "..kppkkkkkkkppk.......",
  "..kpfffsfsfffpk.......",
  "..kffffsfsffffk.......",
  "kkkffefffffeffkkk.....",
  "..ksfeffkffefsk.......",
  "kkkfrfffffffrfkkk.....",
  "...kfffffffffk...kkkk.",
  "...kfffffffffk..kfsffk",
  "...kfffffffffk.kffkkk.",
  "...kbbfffffffkksfk....",
  "...kbbbffffffffffk....",
  "...kbbbfffffffffk.....",
  "...kkkkkkkkkkkkk......",
];
const TAIL_UP = [
  ...TAIL_CURLED.slice(0, 6),
  "kkkfrfffffffrfkk.kkkk.",
  "...kfffffffffk..kfsffk",
  "...kfffffffffk.kkffkkk",
  "...kfffffffffk.kfk....",
  ...TAIL_CURLED.slice(10),
];
const TAIL_FLAT = [
  ...TAIL_CURLED.slice(0, 7),
  "...kfffffffffk........",
  "...kfffffffffk........",
  "...kfffffffffk........",
  "...kbbfffffffkkkkkkkk.",
  "...kbbbfffffffffsffffk",
  "...kbbbfffffffffkkkkk.",
  ...TAIL_CURLED.slice(13),
];
// One swish: flat, curled, up, curled.
const FRAMES = [TAIL_FLAT, TAIL_CURLED, TAIL_UP];
// Fork: a click on Miao gives a little encouragement (a random one, never the same twice in a row).
const MEOWS = [
  "You've got this, Plushy! 💪",
  "Every application is a step closer 🐾",
  "Your skills are worth it. Keep going!",
  "One great match is all it takes ✨",
  "Rejections are just redirections. Purr on!",
  "Proud of you for showing up today ❤️",
  "Small steps, big leaps 🌱",
  "They'd be lucky to have you!",
  "Deep breath. You're doing great 🐱",
  "Today's effort is tomorrow's offer 🎉",
];
const HEART = [".r.r.", "rrrrr", "rrrrr", ".rrr.", "..r.."];
const Z = ["kkk", ".k.", "kkk"];
// Closed eyes, for sleeping: a dash under each.
const LIDS = [[4, 5], [5, 5], [11, 5], [12, 5]];
const SLEEP_AFTER = 30_000;
const BALL = [".kkk.", "kpwpk", "kpppk", "kqppk", ".kkk."];
const BALL_COLORS: Record<string, string> = { k: "var(--miao-k)", p: "#f48fb1", w: "#ffffff", q: "#d9668c" };

type Coat = { f: string; s: string; b: string; p: string; e: string; r: string };
const COATS = {
  ginger: { f: "#d98448", s: "#c26a2f", b: "#f2d3bd", p: "#f6d2bf", e: "#111111", r: "#f29a9a" },
  tabby: { f: "#a39e99", s: "#6f6a65", b: "#f0b0a8", p: "#f4b6c2", e: "#111111", r: "#f29a9a" },
  black: { f: "#3d3d3d", s: "#3d3d3d", b: "#3d3d3d", p: "#f4b6c2", e: "#f5a623", r: "#f29a9a" },
  white: { f: "#ffffff", s: "#ffffff", b: "#ffffff", p: "#f4b6c2", e: "#111111", r: "#f4b6c2" },
} satisfies Record<string, Coat>;

type Pixel = { x: number; y: number; c: string };
// What every frame shares, then what each frame draws on its own.
const STILL: Pixel[] = [];
const TAILS: Pixel[][] = FRAMES.map(() => []);
TAIL_CURLED.forEach((row, y) => [...row].forEach((_, x) => {
  const cs = FRAMES.map((f) => f[y][x]);
  if (cs.every((c) => c === cs[0])) {
    if (cs[0] !== ".") STILL.push({ x, y, c: cs[0] });
    return;
  }
  cs.forEach((c, i) => { if (c !== ".") TAILS[i].push({ x, y, c }); });
}));

// The ball sits left of the cat, on the same ground.
const BALL_X = -7;
const GROUND = TAIL_CURLED.length;
const BALL_Y = GROUND - BALL.length;

const CSS = `
.miao { --miao-k: #111111; --miao-shadow: #000000; }
.dark .miao { --miao-k: #5c5c5c; --miao-shadow: #ffffff; }
.dark .miao-shadow { opacity: 0.25; }
@keyframes miao-hop { 0%, 100% { transform: translateY(0) } 50% { transform: translateY(-1px) } }
@keyframes miao-blink { 0%, 100% { opacity: 1 } 96% { opacity: 0 } 98% { opacity: 1 } }
@keyframes miao-tail-0 { 0% { opacity: 1 } 25%, 100% { opacity: 0 } }
@keyframes miao-tail-1 { 0% { opacity: 0 } 25% { opacity: 1 } 50% { opacity: 0 } 75%, 100% { opacity: 1 } }
@keyframes miao-tail-2 { 0% { opacity: 0 } 50% { opacity: 1 } 75%, 100% { opacity: 0 } }
@keyframes miao-bounce { 0%, 100% { transform: translateY(0) } 15% { transform: translateY(-2px) } 30% { transform: translateY(-4px) }
  45% { transform: translateY(-5px) } 60% { transform: translateY(-4px) } 75% { transform: translateY(-2px) } }
.miao * { animation-timing-function: step-end !important; }
.miao-eyes { animation: miao-blink 4s infinite; }
.miao-tail-0 { animation: miao-tail-0 2.4s infinite; }
.miao-tail-1 { animation: miao-tail-1 2.4s infinite; }
.miao-tail-2 { animation: miao-tail-2 2.4s infinite; }
.miao[data-busy] .miao-body { animation: miao-hop 0.5s infinite; }
.miao[data-busy] [class^="miao-tail"] { animation-duration: 0.8s; }
.miao[data-busy] .miao-ball { animation: miao-bounce 0.8s infinite; }
.miao-ball, .miao-cat { cursor: pointer; }
@keyframes miao-z { 0% { transform: translateY(0); opacity: 1 } 33% { transform: translateY(-1px) } 66% { transform: translateY(-2px) } 100% { transform: translateY(-3px); opacity: 0 } }
.miao-z, .miao-lids { display: none; }
.miao[data-asleep] .miao-z, .miao[data-asleep] .miao-lids { display: inline; }
.miao[data-asleep] .miao-z { animation: miao-z 2s infinite; opacity: 0; }
.miao[data-asleep] .miao-z + .miao-z { animation-delay: 1s; }
.miao[data-asleep] .miao-eyes { display: none; }
.miao[data-asleep] [class^="miao-tail"] { animation: none; opacity: 0; }
.miao[data-asleep] .miao-tail-0 { opacity: 1; }
@media (prefers-reduced-motion: reduce) { .miao * { animation: none !important; } .miao-tail-0, .miao-tail-2 { opacity: 0; } }
`;

// One path per color (fill as style, so it can be a CSS variable): separate 1x1 rects antialias their shared edges at fractional offsets or zoom, showing white seams.
const paths = (pixels: { x: number; y: number; fill: string }[]) => {
  const byFill = new Map<string, string>();
  for (const p of pixels) byFill.set(p.fill, (byFill.get(p.fill) ?? "") + `M${p.x} ${p.y}h1v1h-1z`);
  return [...byFill].map(([fill, d]) => <path key={fill} style={{ fill }} d={d} />);
};
const grid = (rows: string[], x0: number, y0: number, color: (c: string) => string) =>
  paths(rows.flatMap((row, y) => [...row].flatMap((c, x) => (c === "." ? [] : [{ x: x0 + x, y: y0 + y, fill: color(c) }]))));

// A heart's rise, started when it mounts. Kept outside the component so re-renders don't restart it.
const rise = (el: SVGGElement | null) => {
  el?.animate([0, -2, -4, -6, -8].map((y, i) => ({ transform: `translateY(${y}px)`, opacity: i < 3 ? 1 : 1 - (i - 2) * 0.4, easing: "steps(1, end)" })), 1000);
};

// Fork: Miao's face alone (ears, eyes, blush, whiskers: the first 7 rows, 17 columns), for the logo.
const FACE_ROWS = TAIL_CURLED.slice(0, 7).map((row) => row.slice(0, 17));

/** Static Miao face (17 x 7 art), `height` px tall; the width follows the art. */
export function MiaoFace({ height = 28, coat = "ginger" }: { height?: number; coat?: keyof typeof COATS }) {
  const colors: Coat = COATS[coat];
  const color = (c: string) => (c === "k" ? "var(--miao-face-k, #111111)" : colors[c as keyof Coat]);
  return (
    <svg aria-hidden="true" height={height} width={(height * 17) / 7} viewBox="0 0 17 7" shapeRendering="crispEdges">
      {grid(FACE_ROWS, 0, 0, color)}
    </svg>
  );
}

/** `scale` is screen pixels per art pixel: keep it whole so the art stays crisp. */
export function Miao({ busy = false, scale = 2, coat = "ginger" }: {
  busy?: boolean;
  scale?: number;
  coat?: keyof typeof COATS;
}) {
  const colors: Coat = COATS[coat];
  // Asleep after SLEEP_AFTER without the pointer or keyboard; any input wakes it.
  const [asleep, setAsleep] = useState(false);
  useEffect(() => {
    let t = setTimeout(() => setAsleep(true), SLEEP_AFTER);
    const wake = () => {
      setAsleep(false);
      clearTimeout(t);
      t = setTimeout(() => setAsleep(true), SLEEP_AFTER);
    };
    const events = ["pointermove", "pointerdown", "keydown", "dragenter"] as const;
    for (const e of events) window.addEventListener(e, wake);
    return () => {
      clearTimeout(t);
      for (const e of events) window.removeEventListener(e, wake);
    };
  }, []);
  const [pets, setPets] = useState(0);
  const [meow, setMeow] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const cat = useRef<SVGGElement>(null);
  const ball = useRef<SVGGElement>(null);
  // Played with the Web Animations API, so a click restarts them without touching the tail or the blink.
  const play = (el: SVGGElement | null, frames: string[], duration: number) =>
    el?.animate(frames.map((transform) => ({ transform, easing: "steps(1, end)" })), duration);
  // Each click sends a heart up from the cat's head, a little left or right of the last.
  const [hearts, setHearts] = useState<{ id: number; x: number }[]>([]);
  const [line, setLine] = useState(0);
  const pet = () => {
    const id = pets + 1;
    setPets(id);
    setLine((prev) => {
      if (MEOWS.length < 2) return 0;
      let next = Math.floor(Math.random() * (MEOWS.length - 1));
      if (next >= prev) next += 1; // never the same line twice in a row
      return next;
    });
    setMeow(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMeow(false), 3200);
    setHearts((hs) => [...hs, { id, x: 6 + Math.round(Math.random() * 2) }]);
    setTimeout(() => setHearts((hs) => hs.filter((h) => h.id !== id)), 1000);
  };
  const kick = () => {
    play(ball.current, [0, -3, -5, -6, -5, -3, 0, -2, -3, -2, 0].map((y) => `translateY(${y}px)`), 900);
    play(cat.current, ["translateY(0)", "translateY(-1px)", "translateY(0)", "translateY(-1px)", "translateY(0)"], 600);
  };
  // Fur under the eyes, so a blink shows closed lids.
  const fill = (c: string) => (c === "k" ? "var(--miao-k)" : c === "e" ? colors.f : colors[c as keyof Coat]);
  const draw = (pixels: Pixel[]) => paths(pixels.map((p) => ({ ...p, fill: fill(p.c) })));
  const w = TAIL_CURLED[0].length - BALL_X;
  const h = GROUND + 2;
  return (
    <div className="relative">
    {meow && (
      // Fork: a speech bubble centred above the cat; wraps so longer lines fit the chat panel.
      <span
        key={pets}
        role="status"
        className="miao-bubble bg-surface text-foreground absolute bottom-full z-10 w-max max-w-[15rem] rounded-2xl border border-border px-3 py-1.5 text-center text-xs font-medium leading-snug shadow-md"
        // Sit above the hearts' path (they rise to 14 art px above the head), so the hearts stay visible.
        style={{ left: (8 - BALL_X) * scale, transform: "translateX(-50%)", marginBottom: 15 * scale }}
      >
        <style>{"@keyframes miao-bubble{from{opacity:0;transform:translate(-50%,4px) scale(.95)}to{opacity:1;transform:translate(-50%,0) scale(1)}}.miao-bubble{animation:miao-bubble .18s ease-out}"}</style>
        {MEOWS[line]}
        <span aria-hidden="true" className="bg-surface absolute -bottom-1 left-1/2 size-2 -translate-x-1/2 rotate-45 border-b border-r border-border" />
      </span>
    )}
    <svg className="miao" data-busy={busy || undefined}
      data-asleep={asleep || undefined} width={w * scale} height={h * scale} viewBox={`${BALL_X} -1 ${w} ${h}`}
      shapeRendering="crispEdges" overflow="visible">
      <style>{CSS}</style>
      <rect x={BALL_X} y={GROUND} width={24} height={1} className="miao-shadow" style={{ fill: "var(--miao-shadow)" }} opacity={0.12} />
      <g ref={ball} className="miao-ball" role="button" aria-label="Kick the ball" onClick={kick}>
        {grid(BALL, BALL_X, BALL_Y, (c) => BALL_COLORS[c])}
      </g>
      <g ref={cat} className="miao-cat" role="button" aria-label="Pet the cat" onClick={pet}>
      <g className="miao-body">
        {draw(STILL)}
        {TAILS.map((pixels, i) => <g key={i} className={`miao-tail-${i}`}>{draw(pixels)}</g>)}
        <g className="miao-eyes">
          {paths(STILL.filter((p) => p.c === "e").map((p) => ({ ...p, fill: colors.e })))}
        </g>
        <g className="miao-lids">
          {paths(LIDS.map(([x, y]) => ({ x, y, fill: "#111111" })))}
        </g>
      </g>
      </g>
      {[[14, -3], [17, -6]].map(([zx, zy]) => (
        <g key={zx} className="miao-z" pointerEvents="none">
          {grid(Z, zx, zy, () => "#9a9a9a")}
        </g>
      ))}
      {hearts.map((h) => (
        <g key={h.id} ref={rise} pointerEvents="none" opacity={0}>
          {grid(HEART, h.x, -6, () => "#ff5a7a")}
        </g>
      ))}
    </svg>
    </div>
  );
}
