import { House, Compass, ListChecks, Send, Radar, BarChart3, FileText, Files, Settings, CalendarClock, FolderOpen, UserRound, ScrollText, History } from "lucide-react";
import type { ComponentType, SVGProps } from "react";

// Single source of truth for the app's primary destinations — shared by the
// desktop sidebar and the mobile nav so they can never drift.
export type NavItem = {
  href: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  chip?: string;
  /** Fork: "settings" items are shown in their own group below the main ones. */
  group?: "settings";
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Home", icon: House },
  { href: "/explore", label: "Explore", icon: Compass, chip: "New" },
  { href: "/scheduled-scans", label: "Scheduled scans", icon: CalendarClock },
  { href: "/pipeline", label: "Pipeline", icon: ListChecks },
  { href: "/followups", label: "Follow-ups", icon: Send },
  { href: "/portals", label: "Portals", icon: Radar },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/cv", label: "CV", icon: FileText },
  { href: "/profile", label: "Profile", icon: UserRound, group: "settings" },
  { href: "/rules", label: "Rules", icon: ScrollText, group: "settings" },
  { href: "/jobs", label: "Run history", icon: History, group: "settings" },
  { href: "/documents", label: "Documents", icon: Files },
  { href: "/output", label: "Preparation", icon: FolderOpen },
  { href: "/config", label: "Config", icon: Settings },
];

// Fork: pages hidden from the menus (sidebar, mobile, command palette). The routes still exist.
const HIDDEN_HREFS = new Set(["/explore", "/scheduled-scans", "/followups", "/portals", "/analytics", "/documents", "/output", "/config"]);

export function visibleNavItems(followupsEnabled: boolean): NavItem[] {
  const items = NAV_ITEMS.filter((item) => !HIDDEN_HREFS.has(item.href));
  return followupsEnabled ? items : items.filter((item) => item.href !== "/followups");
}

export function isActivePath(href: string, pathname: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}
