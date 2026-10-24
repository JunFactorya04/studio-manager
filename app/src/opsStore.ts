// Operations data: events and shooting spots, photo jobs, deliveries, agent status and logs.
// Kept apart from store.ts (clients, projects, money) so the two areas can grow independently.
// Everything here is local until the Studio Agent and the central server exist; see docs/ops.md.
import { useSyncExternalStore } from "react";
import { addDays, today, uid } from "./store";

export type EventStatus = "draft" | "live" | "done";
export type SpotStatus = "active" | "idle" | "error";
export type JobStatus = "pending" | "running" | "succeeded" | "failed" | "paused";
export type DeliveryStatus = "pending" | "uploading" | "done" | "failed";
export type LogKind = "ingest" | "process" | "export" | "upload" | "error" | "retry" | "config";

export type RouteKind = "bike" | "run" | "swim" | "other";
export interface RouteInfo {
  id: string; name: string; kind: RouteKind; distanceKm: number; ascentM: number; descentM: number;
  points: { lat: number; lon: number; ele?: number }[];
}
export const ROUTE_KIND: Record<RouteKind, string> = { bike: "Đạp xe", run: "Chạy bộ", swim: "Bơi", other: "Khác" };
export interface Brief {
  teamLeader: string; startTime: string; endTime: string; participants: string;
  notes: string[]; welcome: string; guidance: string[];
  venueName: string; venueAddress: string; venueMaps: string;
  course: { label: string; value: string }[];
  files: { name: string; url: string; data?: string; size?: number }[]; // data = attached file as a data: URL
  routes: RouteInfo[];
  hotel: { name: string; address: string; phone: string; maps: string; checkIn: string; checkOut: string; booking: string };
  rooms: { room: string; people: string }[];
}
export const emptyBrief = (): Brief => ({
  teamLeader: "", startTime: "", endTime: "", participants: "", notes: [], welcome: "", guidance: [],
  venueName: "", venueAddress: "", venueMaps: "", course: [], files: [], routes: [],
  hotel: { name: "", address: "", phone: "", maps: "", checkIn: "", checkOut: "", booking: "" }, rooms: [],
});
export interface OpsEvent { id: string; name: string; date: string; endDate: string; venue: string; status: EventStatus; note: string; brief?: Brief }
export interface Spot {
  id: string; eventId: string; name: string; captureDir: string; outputDir: string;
  c1Session: string; recipe: string; photographerId: string; status: SpotStatus;
  arrival?: string; lens?: string; mapsUrl?: string; tip?: string; lat?: number; lon?: number; // briefing: where and when the photographer should be
}
export interface Photographer { id: string; name: string; phone: string; email: string; note: string }
export interface Job {
  id: string; eventId: string; spotId: string; file: string; status: JobStatus;
  createdAt: string; durationSec: number; error?: string; output?: string; attempts: number;
}
export interface Delivery { id: string; jobId: string; eventId: string; spotId: string; file: string; status: DeliveryStatus; attempts: number; at: string; error?: string }
export interface LogEntry { id: string; at: string; kind: LogKind; eventId?: string; spotId?: string; ref?: string; text: string }

export interface AgentState {
  online: boolean; lastSeen: string; host: string; localQueue: number;
  captureOne: "ok" | "idle" | "error"; ftp: "ok" | "idle" | "error";
}

export interface OpsData {
  version: 1;
  events: OpsEvent[]; spots: Spot[]; photographers: Photographer[];
  jobs: Job[]; deliveries: Delivery[]; logs: LogEntry[]; agent: AgentState;
}

export const EVENT_STATUS: Record<EventStatus, [string, string]> = { draft: ["Nháp", "gray"], live: ["Đang diễn ra", "green"], done: ["Đã kết thúc", "blue"] };
export const SPOT_STATUS: Record<SpotStatus, [string, string]> = { active: ["Đang chụp", "green"], idle: ["Chờ", "gray"], error: ["Lỗi", "red"] };
export const JOB_STATUS: Record<JobStatus, [string, string]> = { pending: ["Chờ", "gray"], running: ["Đang chạy", "blue"], succeeded: ["Thành công", "green"], failed: ["Lỗi", "red"], paused: ["Tạm dừng", "orange"] };
export const DELIVERY_STATUS: Record<DeliveryStatus, [string, string]> = { pending: ["Chờ gửi", "gray"], uploading: ["Đang gửi", "blue"], done: ["Đã gửi", "green"], failed: ["Lỗi", "red"] };

// A made-up 10 km loop so the briefing page has something to draw before a real GPX is attached.
function sampleRoute(): RouteInfo {
  const pts = Array.from({ length: 90 }, (_, i) => {
    const a = (i / 89) * Math.PI * 2;
    return { lat: +(25.172 + 0.016 * Math.sin(a) + 0.003 * Math.sin(a * 3)).toFixed(5), lon: +(121.435 + 0.022 * Math.cos(a)).toFixed(5), ele: Math.round(8 + 14 * (1 + Math.sin(a * 2)) / 2) };
  });
  let km = 0;
  for (let i = 1; i < pts.length; i++) {
    const dLat = ((pts[i].lat - pts[i - 1].lat) * Math.PI) / 180, dLon = ((pts[i].lon - pts[i - 1].lon) * Math.PI) / 180;
    km += 6371 * Math.sqrt(dLat ** 2 + (Math.cos((pts[i].lat * Math.PI) / 180) * dLon) ** 2);
  }
  return { id: "r-sample", name: "Đường chạy 10 km (mẫu)", kind: "run", distanceKm: +km.toFixed(1), ascentM: 28, descentM: 28, points: pts };
}

const at = (daysAgo: number, h: number, m: number) => `${addDays(today(), -daysAgo)}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;

function seed(): OpsData {
  const t = today();
  const photographers: Photographer[] = [
    { id: "ph1", name: "Huy", phone: "0912 000 111", email: "huy@studio.test", note: "Thể thao, sự kiện" },
    { id: "ph2", name: "Ngọc", phone: "0912 000 222", email: "ngoc@studio.test", note: "Chân dung" },
    { id: "ph3", name: "An", phone: "0912 000 333", email: "", note: "Hỗ trợ" },
  ];
  const events: OpsEvent[] = [
    {
      id: "ev1", name: "Giải chạy Đạm Thủy", date: t, endDate: addDays(t, 1), venue: "Bờ sông Đạm Thủy", status: "live", note: "3 điểm chụp, giao ảnh trong ngày",
      brief: {
        teamLeader: "Huy", startTime: "06:00", endTime: "15:00", participants: "1.200",
        notes: ["Tạo thư mục mới trước khi chụp ở điểm mới", "Đánh dấu và khóa khoảng 20 ảnh đẹp nhất mỗi điểm", "Giao ảnh JPEG 2400px, kiểm tra Recipe trước giờ xuất phát"],
        welcome: "Chào cả đội! Đây là trang thông tin chung của sự kiện. Mọi cập nhật về điểm chụp và giờ giấc sẽ nằm ở đây.",
        guidance: ["Thẻ nhớ đọc nhanh trên 95 MB/s và đầu đọc thẻ dự phòng", "Mang 3–4 pin sạc đầy mỗi ngày, ít điểm có ổ điện", "Mang áo khoác, túi nhựa che máy, nước và đồ ăn nhẹ"],
        venueName: "Công viên bờ sông Đạm Thủy", venueAddress: "Đường Trung Chính, Đạm Thủy, Tân Bắc", venueMaps: "https://maps.google.com/?q=Tamsui+Riverside",
        course: [{ label: "Cự ly", value: "10 km" }, { label: "Số vòng", value: "1" }],
        files: [], routes: [sampleRoute()],
        hotel: { name: "", address: "", phone: "", maps: "", checkIn: "", checkOut: "", booking: "" }, rooms: [],
      },
    },
    { id: "ev2", name: "Hội thao trường Minh Đức", date: addDays(t, -9), endDate: addDays(t, -9), venue: "Sân vận động", status: "done", note: "" },
    { id: "ev3", name: "Triển lãm Công nghệ", date: addDays(t, 12), endDate: addDays(t, 14), venue: "Trung tâm Triển lãm", status: "draft", note: "Chưa gán điểm chụp" },
  ];
  const spots: Spot[] = [
    { id: "sp1", eventId: "ev1", name: "Vạch xuất phát", captureDir: "D:\\Capture\\DamThuy\\Start", outputDir: "D:\\Output\\DamThuy\\Start", c1Session: "DamThuy_Start.cosessiondb", recipe: "JPEG 2400px", photographerId: "ph1", status: "active", arrival: "05:00", lens: "24-70 / 70-200", mapsUrl: "https://maps.google.com/?q=Tamsui+Start", tip: "Chụp từ phía sau vạch", lat: 25.172, lon: 121.457 },
    { id: "sp2", eventId: "ev1", name: "Cầu Tình Yêu", captureDir: "D:\\Capture\\DamThuy\\Bridge", outputDir: "D:\\Output\\DamThuy\\Bridge", c1Session: "DamThuy_Bridge.cosessiondb", recipe: "JPEG 2400px", photographerId: "ph2", status: "active", arrival: "06:30", lens: "70-200", mapsUrl: "https://maps.google.com/?q=Tamsui+Bridge", tip: "Ưu tiên ảnh nhóm", lat: 25.188, lon: 121.435 },
    { id: "sp3", eventId: "ev1", name: "Vạch đích", captureDir: "D:\\Capture\\DamThuy\\Finish", outputDir: "D:\\Output\\DamThuy\\Finish", c1Session: "DamThuy_Finish.cosessiondb", recipe: "JPEG 2400px", photographerId: "ph3", status: "error", arrival: "07:00", lens: "16-35", mapsUrl: "https://maps.google.com/?q=Tamsui+Finish", tip: "Khóa 20 ảnh về đích", lat: 25.156, lon: 121.435 },
    { id: "sp4", eventId: "ev2", name: "Sân chính", captureDir: "D:\\Capture\\MinhDuc\\Main", outputDir: "D:\\Output\\MinhDuc\\Main", c1Session: "MinhDuc_Main.cosessiondb", recipe: "JPEG 2000px", photographerId: "ph1", status: "idle" },
  ];

  // A believable queue: finished work for yesterday's event, live work for today's.
  const jobs: Job[] = [];
  const deliveries: Delivery[] = [];
  const logs: LogEntry[] = [];
  const add = (spotId: string, eventId: string, n: number, base: string, ageDays: number, mix: Array<[JobStatus, number]>) => {
    let i = 0;
    for (const [status, count] of mix) {
      for (let k = 0; k < count; k++, i++) {
        const file = `${base}_${String(1000 + i)}.jpg`;
        const id = `${spotId}-${i}`;
        const job: Job = {
          id, eventId, spotId, file, status, attempts: status === "failed" ? 2 : 1,
          createdAt: at(ageDays, 8 + Math.floor(i / 12), (i * 5) % 60), durationSec: 3 + (i % 5),
          error: status === "failed" ? (i % 2 ? "Recipe không xuất được: thiếu LUT" : "Tệp RAW bị hỏng") : undefined,
          output: status === "succeeded" ? file : undefined,
        };
        jobs.push(job);
        if (status === "succeeded") {
          const ds: DeliveryStatus = ageDays > 0 ? "done" : i % 7 === 0 ? "failed" : i % 5 === 0 ? "pending" : "done";
          deliveries.push({ id: "d-" + id, jobId: id, eventId, spotId, file, status: ds, attempts: ds === "failed" ? 3 : 1, at: job.createdAt, error: ds === "failed" ? "Mất kết nối máy chủ đích (timeout)" : undefined });
        }
      }
    }
    void n;
  };
  add("sp1", "ev1", 0, "START", 0, [["succeeded", 28], ["running", 2], ["pending", 6]]);
  add("sp2", "ev1", 0, "BRIDGE", 0, [["succeeded", 22], ["failed", 3], ["pending", 4]]);
  add("sp3", "ev1", 0, "FINISH", 0, [["succeeded", 4], ["failed", 6], ["paused", 3]]);
  add("sp4", "ev2", 0, "MAIN", 9, [["succeeded", 40]]);

  const lg = (k: LogKind, text: string, hh: number, mm: number, eventId?: string, spotId?: string, ref?: string) =>
    logs.push({ id: uid(), at: at(0, hh, mm), kind: k, text, eventId, spotId, ref });
  lg("config", "Cập nhật recipe cho Vạch đích", 7, 40, "ev1", "sp3");
  lg("ingest", "Nhận 28 ảnh từ Vạch xuất phát qua FTP", 9, 10, "ev1", "sp1");
  lg("process", "Capture One xuất xong 22 ảnh tại Cầu Tình Yêu", 9, 25, "ev1", "sp2");
  lg("error", "Vạch đích: Capture One không tạo được ảnh đầu ra", 9, 42, "ev1", "sp3");
  lg("retry", "Thử lại job FINISH_1004.jpg (lần 2)", 9, 50, "ev1", "sp3", "sp3-4");
  lg("upload", "Gửi 3 ảnh lên máy chủ đích thất bại: timeout", 10, 5, "ev1", "sp2");
  lg("export", "Xuất 28 ảnh JPEG 2400px", 10, 12, "ev1", "sp1");

  return {
    version: 1, events, spots, photographers, jobs, deliveries, logs,
    agent: { online: true, lastSeen: at(0, 10, 14), host: "STUDIO-PC-01", localQueue: 0, captureOne: "ok", ftp: "ok" },
  };
}

const KEY = "studio-manager-ops-v1";
let state: OpsData = load();
const listeners = new Set<() => void>();

function load(): OpsData {
  try { const raw = localStorage.getItem(KEY); if (raw) { const d = JSON.parse(raw) as OpsData; if (d.version === 1) return d; } } catch { /* storage unavailable */ }
  return seed();
}
function commit(next: OpsData) {
  state = next;
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* full or blocked */ }
  listeners.forEach((l) => l());
}
const subscribe = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };
export const useOps = () => useSyncExternalStore(subscribe, () => state);
export const getOps = () => state;

const logLine = (kind: LogKind, text: string, eventId?: string, spotId?: string, ref?: string): LogEntry =>
  ({ id: uid(), at: new Date().toISOString().slice(0, 19), kind, text, eventId, spotId, ref });

export const opsActions = {
  reset() { commit(seed()); },
  replaceAll(d: OpsData) { commit(d); },
  addEvent(e: Omit<OpsEvent, "id">) {
    const ev = { ...e, id: uid() };
    commit({ ...state, events: [ev, ...state.events], logs: [logLine("config", `Tạo sự kiện ${ev.name}`, ev.id), ...state.logs] });
    return ev;
  },
  updateEvent(id: string, patch: Partial<OpsEvent>) {
    commit({ ...state, events: state.events.map((e) => (e.id === id ? { ...e, ...patch } : e)), logs: [logLine("config", "Sửa thông tin sự kiện", id), ...state.logs] });
  },
  deleteEvent(id: string) {
    const spotIds = new Set(state.spots.filter((s) => s.eventId === id).map((s) => s.id));
    commit({
      ...state,
      events: state.events.filter((e) => e.id !== id),
      spots: state.spots.filter((s) => s.eventId !== id),
      jobs: state.jobs.filter((j) => !spotIds.has(j.spotId)),
      deliveries: state.deliveries.filter((d) => !spotIds.has(d.spotId)),
    });
  },
  addSpot(s: Omit<Spot, "id">) {
    const sp = { ...s, id: uid() };
    commit({ ...state, spots: [...state.spots, sp], logs: [logLine("config", `Thêm điểm chụp ${sp.name}`, sp.eventId, sp.id), ...state.logs] });
    return sp;
  },
  updateSpot(id: string, patch: Partial<Spot>) {
    const sp = state.spots.find((s) => s.id === id);
    commit({ ...state, spots: state.spots.map((s) => (s.id === id ? { ...s, ...patch } : s)), logs: [logLine("config", `Sửa điểm chụp ${sp?.name ?? ""}`, sp?.eventId, id), ...state.logs] });
  },
  deleteSpot(id: string) {
    commit({ ...state, spots: state.spots.filter((s) => s.id !== id), jobs: state.jobs.filter((j) => j.spotId !== id), deliveries: state.deliveries.filter((d) => d.spotId !== id) });
  },
};

// ---------- derived numbers used by several screens ----------
export interface SpotStats { total: number; pending: number; running: number; succeeded: number; failed: number; paused: number; delivered: number; deliveryFailed: number; deliveryWaiting: number }
export function spotStats(d: OpsData, spotId?: string, eventId?: string): SpotStats {
  const jobs = d.jobs.filter((j) => (!spotId || j.spotId === spotId) && (!eventId || j.eventId === eventId));
  const dels = d.deliveries.filter((x) => (!spotId || x.spotId === spotId) && (!eventId || x.eventId === eventId));
  const c = (s: JobStatus) => jobs.filter((j) => j.status === s).length;
  return {
    total: jobs.length, pending: c("pending"), running: c("running"), succeeded: c("succeeded"), failed: c("failed"), paused: c("paused"),
    delivered: dels.filter((x) => x.status === "done").length,
    deliveryFailed: dels.filter((x) => x.status === "failed").length,
    deliveryWaiting: dels.filter((x) => x.status === "pending" || x.status === "uploading").length,
  };
}
