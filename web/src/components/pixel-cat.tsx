// Fork: the logo used in the sidebar and mobile header: Miao's face.
// (The animated Miao lives in miao.tsx.)
import { MiaoFace } from "@/components/miao";

/** Sidebar / header logo: Miao's face. `size` is the logo height in px (the face is wider than tall). */
export function CatLogo({ size = 32 }: { size?: number }) {
  return <MiaoFace height={Math.round(size * 0.7)} />;
}
