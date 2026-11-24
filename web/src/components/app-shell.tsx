"use client";

import { Fragment } from "react";
import Link from "next/link";
import { History } from "lucide-react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { CatLogo } from "@/components/pixel-cat";
import { AssistantConsole } from "@/components/assistant-console";
import { MobileNav } from "@/components/mobile-nav";
import { BackToTop } from "@/components/back-to-top";
import { JobsProvider } from "@/components/jobs/job-store";
import { PipelineProvider } from "@/components/pipeline/pipeline-provider";
import { ApplyProvider } from "@/components/apply/apply-provider";
import { ExploreProvider } from "@/components/explore/explore-provider";
import { FirstScoreView } from "@/components/explore/first-score-view";
import { WorkerPills } from "@/components/jobs/worker-pills";
import { instrumentSerif } from "@/lib/fonts";
import { visibleNavItems, isActivePath } from "@/lib/nav-items";

export function AppShell({ children, followupsEnabled }: { children: React.ReactNode; followupsEnabled: boolean }) {
  const pathname = usePathname();
  // Fork: the desktop sidebar is always shown (no hide button); mobile keeps its own drawer.
  return (
    <JobsProvider>
      <PipelineProvider>
      <ApplyProvider>
      <ExploreProvider>
      <a
        href="#main-content"
        className="sr-only rounded-md bg-brand text-sm font-medium text-brand-foreground focus:not-sr-only focus:fixed focus:px-3 focus:py-2 focus:left-3 focus:top-3 focus:z-[100] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
      >
        Skip to content
      </a>
      <MobileNav followupsEnabled={followupsEnabled} />
      <div className="flex min-h-screen">
        <aside className="sticky top-0 hidden print:hidden h-screen w-60 shrink-0 flex-col overflow-y-auto border-r border-border bg-surface/30 p-4 md:flex">
          <Link href="/" className="mb-8 flex items-center gap-2.5 px-1">
            <CatLogo size={32} />
            <span className={`${instrumentSerif.className} relative -top-px text-2xl font-normal tracking-tight text-landing`}>
              Miao
            </span>
          </Link>
          <nav className="flex flex-col gap-1">
            {visibleNavItems(followupsEnabled).map(({ href, label, icon: Icon, chip, group }, i, all) => {
              const header = group === "settings" && all[i - 1]?.group !== "settings";
              const active = isActivePath(href, pathname);
              return (
                <Fragment key={href}>
                  {header && <p className="mt-4 mb-1 px-3 text-[11px] font-medium uppercase tracking-wide text-faint">Settings</p>}
                  <Link
                    href={href}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                      active
                        ? "bg-brand-soft text-brand-text"
                        : "text-muted hover:bg-surface-hover hover:text-foreground",
                    )}
                  >
                    <Icon className="size-4" />
                    {label}
                    {chip && (
                      <span className="ml-auto rounded-full border border-brand/30 bg-brand-soft px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-brand-text">
                        {chip}
                      </span>
                    )}
                  </Link>
                </Fragment>
              );
            })}
          </nav>

          <WorkerPills />

        </aside>
        <main id="main-content" tabIndex={-1} className="flex-1 overflow-x-hidden focus:outline-none">{children}</main>
        <div className="print:hidden">
          <AssistantConsole />
          <BackToTop />
          <FirstScoreView />
        </div>
      </div>
      </ExploreProvider>
      </ApplyProvider>
      </PipelineProvider>
    </JobsProvider>
  );
}
