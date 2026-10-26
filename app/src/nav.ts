import type { IconName } from "./components/Icon";

export type View = "dashboard" | "calendar" | "projects" | "library" | "inbox" | "finance" | "more" | "ops" | "events" | "ingest" | "queue" | "delivery" | "c1" | "agent" | "select" | "booking" | "crew" | "report" | "logs" | "opsset";

export interface Route {
  view: View;
  projectId?: string; // projects: open detail; library: filter to project
  clientId?: string; // inbox: open a conversation
  gallery?: string; // project id whose client gallery is open
  importFor?: string; // project id to open the import sheet for
  photos?: "none" | "keep" | "picked"; // library smart filter from the sidebar
  eventId?: string; // events: event to select
}

export type Go = (route: Route) => void;

export const NAV: { view: View; label: string; short: string; icon: IconName; mobile: boolean }[] = [
  { view: "dashboard", label: "Tổng quan", short: "Tổng quan", icon: "home", mobile: true },
  { view: "calendar", label: "Lịch chụp", short: "Lịch", icon: "calendar", mobile: false },
  { view: "projects", label: "Dự án", short: "Dự án", icon: "folder", mobile: true },
  { view: "library", label: "Thư viện", short: "Thư viện", icon: "photo", mobile: true },
  { view: "inbox", label: "Tin nhắn", short: "Tin nhắn", icon: "message", mobile: true },
  { view: "finance", label: "Tài chính", short: "Tài chính", icon: "chart", mobile: false },
];

// Operations group (events, queues, delivery...). Grows as each module is built.
export const OPS_NAV: { view: View; label: string; short: string; icon: IconName }[] = [
  { view: "ops", label: "Tổng quan vận hành", short: "Vận hành", icon: "bolt" },
  { view: "events", label: "Sự kiện & Spot", short: "Sự kiện", icon: "flag" },
  { view: "ingest", label: "Nhận ảnh", short: "Nhận ảnh", icon: "download" },
  { view: "queue", label: "Xử lý ảnh", short: "Xử lý", icon: "refresh" },
  { view: "delivery", label: "Giao ảnh", short: "Giao ảnh", icon: "send" },
  { view: "c1", label: "Capture One", short: "Capture One", icon: "photo" },
  { view: "agent", label: "Studio Agent", short: "Agent", icon: "settings" },
  { view: "select", label: "Ảnh chọn lọc", short: "Chọn lọc", icon: "heart" },
  { view: "booking", label: "Booking", short: "Booking", icon: "calendar" },
  { view: "crew", label: "Photographer", short: "Photographer", icon: "message" },
  { view: "report", label: "Báo cáo", short: "Báo cáo", icon: "chart" },
  { view: "logs", label: "Nhật ký", short: "Nhật ký", icon: "alert" },
  { view: "opsset", label: "Cài đặt vận hành", short: "Cài đặt VH", icon: "settings" },
];
