import type { MetadataRoute } from "next";

// Fork: makes the dashboard installable as "Miao" (Add to Home Screen on iPhone,
// Install on desktop/Android). The share_target lets Android share a link straight
// into /share; on iPhone the same page is opened by a Shortcut.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Miao",
    short_name: "Miao",
    description: "Your job search companion.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f8f8f9",
    theme_color: "#f8f8f9",
    // "any" icons are transparent (Android splash screen and app lists);
    // "maskable" icons carry the light-blue background (Android home-screen icon).
    // iPhone uses apple-icon.png (light-blue background) from the page head instead.
    icons: [
      { src: "/icon3.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon4.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon1.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icon2.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    share_target: {
      action: "/share",
      method: "GET",
      params: { title: "title", text: "text", url: "url" },
    },
  };
}
