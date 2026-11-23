import localFont from "next/font/local";

// Body / UI — Inter, same as the career-ops-docs home. The latin variable
// subset is vendored so an offline production build never contacts Google.
export const inter = localFont({
  src: [{
    path: "../assets/fonts/inter/Inter-Latin-Variable.woff2",
    weight: "100 900",
    style: "normal",
  }],
  variable: "--font-inter",
  display: "swap",
});

// Fork restyle: the "display" font is Inter too (the serif headlines looked
// out of place). Export names are kept so the 16 components importing them
// need no change and upstream merges stay small.
export const instrumentSerif = localFont({
  src: [{
    path: "../assets/fonts/inter/Inter-Latin-Variable.woff2",
    weight: "100 900",
    style: "normal",
  }],
  variable: "--font-instrument-serif",
  display: "swap",
});

export const instrumentSerifItalic = localFont({
  src: [{
    path: "../assets/fonts/inter/Inter-Latin-Variable.woff2",
    weight: "100 900",
    style: "normal",
  }],
  variable: "--font-instrument-serif-italic",
  display: "swap",
});
