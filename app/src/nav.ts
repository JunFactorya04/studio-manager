import type { IconName } from "./components/Icon";

export type View = "dashboard" | "calendar" | "projects" | "library" | "inbox" | "finance";

export interface Route {
  view: View;
  projectId?: string; // projects: open detail; library: filter to project
  clientId?: string; // inbox: open a conversation
  gallery?: string; // project id whose client gallery is open
  importFor?: string; // project id to open the import sheet for
  photos?: "none" | "keep" | "picked"; // library smart filter from the sidebar
}

export type Go = (route: Route) => void;

export const NAV: { view: View; label: string; short: string; icon: IconName; mobile: boolean }[] = [
  { view: "dashboard", label: "Tổng quan", short: "Tổng quan", icon: "home", mobile: true },
  { view: "calendar", label: "Lịch chụp", short: "Lịch", icon: "calendar", mobile: true },
  { view: "projects", label: "Dự án", short: "Dự án", icon: "folder", mobile: true },
  { view: "library", label: "Thư viện", short: "Thư viện", icon: "photo", mobile: true },
  { view: "inbox", label: "Tin nhắn", short: "Tin nhắn", icon: "message", mobile: true },
  { view: "finance", label: "Tài chính", short: "Tài chính", icon: "chart", mobile: true },
];
