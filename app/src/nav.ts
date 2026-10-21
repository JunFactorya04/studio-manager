import type { IconName } from "./components/Icon";

export type View = "dashboard" | "projects" | "library" | "inbox" | "finance";

export interface Route {
  view: View;
  projectId?: string;
}

export type Go = (route: Route) => void;

export const NAV: { view: View; label: string; icon: IconName; badge?: number }[] = [
  { view: "dashboard", label: "Tổng quan", icon: "home" },
  { view: "projects", label: "Dự án", icon: "folder" },
  { view: "library", label: "Thư viện", icon: "photo" },
  { view: "inbox", label: "Tin nhắn", icon: "message", badge: 4 },
  { view: "finance", label: "Tài chính", icon: "chart" },
];
