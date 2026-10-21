import type { IconName } from "./components/Icon";

export type View = "dashboard" | "projects" | "library" | "inbox" | "finance";

export interface Route {
  view: View;
  projectId?: string; // projects: open detail; library: filter to project
  clientId?: string; // inbox: open a conversation
  gallery?: string; // project id whose client gallery is open
  importFor?: string; // project id to open the import sheet for
}

export type Go = (route: Route) => void;

export const NAV: { view: View; label: string; icon: IconName }[] = [
  { view: "dashboard", label: "Tổng quan", icon: "home" },
  { view: "projects", label: "Dự án", icon: "folder" },
  { view: "library", label: "Thư viện", icon: "photo" },
  { view: "inbox", label: "Tin nhắn", icon: "message" },
  { view: "finance", label: "Tài chính", icon: "chart" },
];
