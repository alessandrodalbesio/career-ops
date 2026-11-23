// Fork: the logo used in the sidebar and mobile header: Miao's face as a
// transparent PNG (web/public/miao-logo.png, 340x140, 20 px per art pixel).
// (The animated Miao lives in miao.tsx.)

/** Sidebar / header logo. `size` is the logo height in px (the face is wider than tall). */
export function CatLogo({ size = 32 }: { size?: number }) {
  const height = Math.round(size * 0.7);
  return (
    // eslint-disable-next-line @next/next/no-img-element -- tiny static pixel art; next/image adds nothing here
    <img
      src="/miao-logo.png"
      alt=""
      aria-hidden="true"
      width={Math.round((height * 17) / 7)}
      height={height}
      style={{ imageRendering: "pixelated" }}
      className="shrink-0 select-none"
      draggable={false}
    />
  );
}
