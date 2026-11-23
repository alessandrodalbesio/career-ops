import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import { inter, instrumentSerif, instrumentSerifItalic } from "@/lib/fonts";
import { AppShell } from "@/components/app-shell";
import { RouteProgressHost } from "@/components/route-progress-host";
import { ThemeProvider } from "@/components/theme-provider";
import { FontApplier } from "@/components/font-applier";
import { readFollowupsEnabled } from "@/lib/followups-server";
import "./globals.css";

export const metadata: Metadata = {
  title: "Miao",
  description: "Miao — your job search companion.",
  // Home-screen / standalone (iOS): let our theme-color flow up to the status bar
  // + Dynamic Island; safe-area insets handle the layout.
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Miao" },
};

export const viewport: Viewport = {
  // viewport-fit=cover → env(safe-area-inset-*) become non-zero so the header can
  // sit flush under the notch / Dynamic Island.
  viewportFit: "cover",
  // Fork: Miao is always light (the theme toggle was removed), so the browser
  // chrome matches the light page background.
  themeColor: "#f8f8f9",
};

// Fork: always light, whatever the OS setting or an older saved choice says.
// Clears a stale "dark" choice and tints the browser chrome to match --bg.
const THEME_SCRIPT = `(function(){try{document.documentElement.classList.remove('dark');try{localStorage.removeItem('career-ops:theme');}catch(e){}var m=document.querySelector('meta[name="theme-color"]');if(!m){m=document.createElement('meta');m.setAttribute('name','theme-color');document.head.appendChild(m);}m.setAttribute('content','#f8f8f9');}catch(e){}})();`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  await connection();
  const followupsEnabled = readFollowupsEnabled();
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${instrumentSerif.variable} ${instrumentSerifItalic.variable}`}
    >
      <body className="font-sans antialiased">
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <RouteProgressHost />
        <FontApplier />
        <ThemeProvider>
          <AppShell followupsEnabled={followupsEnabled}>{children}</AppShell>
        </ThemeProvider>
      </body>
    </html>
  );
}
