// Local data store. Everything is saved on this device (localStorage) until a backend exists.
// Views read with useStore(selector) and change data only through the actions below.

import { useSyncExternalStore } from "react";

export type Stage = "quote" | "deposit" | "shoot" | "cull" | "edit" | "review" | "delivered";
export type Channel = "line" | "messenger" | "zalo" | "email";
export type Mark = "none" | "keep" | "reject";

export const STAGES: { id: Stage; label: string; short: string }[] = [
  { id: "quote", label: "Báo giá", short: "Báo giá" },
  { id: "deposit", label: "Đặt cọc", short: "Đặt cọc" },
  { id: "shoot", label: "Lịch chụp", short: "Chụp" },
  { id: "cull", label: "Chọn lọc", short: "Lọc" },
  { id: "edit", label: "Chỉnh sửa", short: "Sửa" },
  { id: "review", label: "Chờ khách", short: "Duyệt" },
  { id: "delivered", label: "Đã giao", short: "Giao" },
];

export const STAGE_TONE: Record<Stage, string> = {
  quote: "gray", deposit: "gray", shoot: "blue", cull: "purple", edit: "orange", review: "pink", delivered: "green",
};

export const PROJECT_TYPES = ["Chụp cưới", "Sự kiện", "Sản phẩm", "Ngoại cảnh", "Gia đình", "Kỷ yếu", "Chân dung", "Thể thao"];
export const EXPENSE_CATEGORIES = ["Thiết bị", "Đi lại", "Cloud và phần mềm", "Thuê người", "In ấn", "Khác"];

export interface Client { id: string; name: string; phone: string; email: string; channel: Channel; note: string }
export interface Gallery { limit: number; password: string; expires: string; sentAt?: string; submittedAt?: string }
export interface Project {
  id: string; name: string; clientId: string; type: string;
  date: string; time: string; durationH: number; location: string;
  stage: Stage; deadline: string; pkgName: string; pkgPhotos: number; photographers: string;
  nasPath: string; total: number; note: string; createdAt: string; gallery?: Gallery;
}
export interface Asset {
  id: string; projectId: string; base: string; rawPath?: string; jpgPath?: string; thumbPath?: string;
  bytes: number; checksum?: string; rating: number; mark: Mark; picked: boolean; color: string;
}
export interface Invoice { id: string; no: string; projectId: string; amount: number; due: string; note: string; issued: string }
export interface Payment { id: string; invoiceId: string; amount: number; date: string; method: string }
export interface Expense { id: string; date: string; category: string; amount: number; note: string }
export interface Message { id: string; clientId: string; channel: Channel; dir: "in" | "out"; text: string; at: string; read: boolean }
export interface Activity { id: string; projectId: string; text: string; at: string }

export interface Data {
  version: 1;
  clients: Client[]; projects: Project[]; assets: Asset[];
  invoices: Invoice[]; payments: Payment[]; expenses: Expense[];
  messages: Message[]; activity: Activity[];
  settings: { studioName: string; nasRoot: string; renamePattern: string };
}

// ---------- helpers ----------
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const pad = (n: number) => String(n).padStart(2, "0");
export const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => isoDate(new Date());
export const addDays = (iso: string, n: number) => { const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + n); return isoDate(d); };
export const daysBetween = (a: string, b: string) => Math.round((new Date(b + "T00:00:00").getTime() - new Date(a + "T00:00:00").getTime()) / 86400000);
export const fmtDate = (iso: string) => { if (!iso) return "—"; const [y, m, d] = iso.split("-"); return `${d}/${m}/${y}`; };
export const fmtShort = (iso: string) => { if (!iso) return "—"; const [, m, d] = iso.split("-"); return `${d}/${m}`; };
export const money = (n: number) => "NT$ " + Math.round(n).toLocaleString("vi-VN");
export const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(-2).map((w) => w[0]).join("").toUpperCase();
const TILE_COLORS = ["#D8CFC4", "#C7CED6", "#DCD3C6", "#CFC8D8", "#C6CEC2", "#E2DBD1", "#CBC3B8", "#D3D7DC", "#D6CDC0", "#C9D1CB", "#DDD4C9", "#CCC6D2"];

// ---------- seed (dates relative to today so the demo always looks current) ----------
function seed(): Data {
  const t = today();
  const c = (name: string, channel: Channel, phone = "", email = ""): Client => ({ id: uid(), name, phone, email, channel, note: "" });
  const lan = c("Trần Lan", "line", "0912 345 678");
  const abc = c("Cty ABC – Chị Hằng", "email", "", "hang@abc.com.tw");
  const moc = c("Mộc Furniture", "messenger");
  const hung = c("Trần Hùng", "zalo", "0987 222 111");
  const md = c("THPT Minh Đức", "email", "", "thay.binh@minhduc.edu.tw");
  const p = (x: Partial<Project> & Pick<Project, "name" | "clientId" | "type" | "stage">): Project => ({
    id: uid(), date: t, time: "09:00", durationH: 2, location: "", deadline: addDays(t, 7), pkgName: "", pkgPhotos: 30,
    photographers: "", nasPath: "", total: 0, note: "", createdAt: t, ...x,
  });
  const pLan = p({ name: "Lan & Minh", clientId: lan.id, type: "Chụp cưới", stage: "edit", date: addDays(t, -3), time: "08:00", durationH: 8, location: "Đạm Thủy", deadline: addDays(t, 2), pkgName: "Gói Vàng", pkgPhotos: 60, photographers: "Huy, Ngọc", total: 36000, nasPath: "NAS/2026/Lan-Minh" });
  const pAbc = p({ name: "Hội thảo ABC", clientId: abc.id, type: "Sự kiện", stage: "review", date: addDays(t, -9), time: "13:00", durationH: 4, location: "Tín Nghĩa", deadline: addDays(t, 5), pkgName: "Sự kiện nửa ngày", pkgPhotos: 100, photographers: "Huy", total: 30000, gallery: { limit: 100, password: "abc2026", expires: addDays(t, 10), sentAt: addDays(t, -4) } });
  const pMoc = p({ name: "Chụp sản phẩm Mộc", clientId: moc.id, type: "Sản phẩm", stage: "shoot", date: t, time: "14:00", durationH: 2, location: "Studio A", deadline: addDays(t, 6), pkgName: "Sản phẩm", pkgPhotos: 40, photographers: "Ngọc", total: 16000 });
  const pHung = p({ name: "Gia đình Trần", clientId: hung.id, type: "Ngoại cảnh", stage: "shoot", date: t, time: "09:30", durationH: 3, location: "Công viên Đại An", deadline: addDays(t, 10), pkgName: "Gia đình", pkgPhotos: 30, photographers: "Huy", total: 12000 });
  const pMd = p({ name: "Kỷ yếu THPT Minh Đức", clientId: md.id, type: "Kỷ yếu", stage: "delivered", date: addDays(t, -19), durationH: 6, location: "Trường Minh Đức", deadline: addDays(t, -6), pkgName: "Kỷ yếu", pkgPhotos: 300, photographers: "Huy, Ngọc", total: 48000 });
  const pNv = p({ name: "Gia đình Nguyễn Vy", clientId: lan.id, type: "Gia đình", stage: "quote", date: addDays(t, 12), location: "Studio A", total: 9000, pkgName: "Gia đình", pkgPhotos: 25 });

  const inv = (projectId: string, no: string, amount: number, due: string, note: string): Invoice => ({ id: uid(), no, projectId, amount, due, note, issued: addDays(due, -14) });
  const iLan1 = inv(pLan.id, "#0041", 10000, addDays(t, -20), "Đặt cọc");
  const iLan2 = inv(pLan.id, "#0047", 26000, addDays(t, 7), "Đợt 2");
  const iAbc = inv(pAbc.id, "#0045", 30000, addDays(t, -7), "Trọn gói");
  const iMd1 = inv(pMd.id, "#0040", 30000, addDays(t, -30), "Đợt 1");
  const iMd2 = inv(pMd.id, "#0042", 18000, addDays(t, -5), "Đợt 2");
  const iMoc = inv(pMoc.id, "#0048", 8000, addDays(t, -2), "Đặt cọc");
  const iHung = inv(pHung.id, "#0049", 4000, addDays(t, -1), "Đặt cọc");
  const pay = (invoiceId: string, amount: number, date: string, method = "Chuyển khoản"): Payment => ({ id: uid(), invoiceId, amount, date, method });

  // Six months of past revenue so the chart has history.
  const history: Payment[] = [];
  const histInv: Invoice[] = [];
  [98000, 124000, 84000, 110000, 120000].forEach((v, i) => {
    const d = new Date(); d.setDate(10); d.setMonth(d.getMonth() - (5 - i));
    const iv = inv("", "#H" + (i + 1), v, isoDate(d), "Doanh thu cũ");
    histInv.push(iv); history.push(pay(iv.id, v, isoDate(d)));
  });

  const assets: Asset[] = [];
  const marks: Mark[] = ["keep", "keep", "reject", "none", "keep", "none", "reject", "keep", "none", "keep", "none", "none"];
  marks.forEach((mark, i) => assets.push({ id: uid(), projectId: pLan.id, base: `LanMinh_${String(i + 1).padStart(4, "0")}`, bytes: 31_000_000, rating: [0, 4, 9].includes(i) ? 5 : 0, mark, picked: false, color: TILE_COLORS[i] }));
  for (let i = 0; i < 12; i++) assets.push({ id: uid(), projectId: pAbc.id, base: `ABC_${String(i + 1).padStart(4, "0")}`, bytes: 28_000_000, rating: 0, mark: "keep", picked: [0, 3, 4, 8, 11].includes(i), color: TILE_COLORS[(i + 5) % 12] });

  const m = (cl: Client, dir: "in" | "out", text: string, minsAgo: number, read = dir === "out"): Message => ({ id: uid(), clientId: cl.id, channel: cl.channel, dir, text, at: new Date(Date.now() - minsAgo * 60000).toISOString(), read });
  return {
    version: 1,
    clients: [lan, abc, moc, hung, md],
    projects: [pLan, pAbc, pMoc, pHung, pMd, pNv],
    assets,
    invoices: [iLan1, iLan2, iAbc, iMd1, iMd2, iMoc, iHung, ...histInv],
    payments: [pay(iLan1.id, 10000, addDays(t, -21)), pay(iAbc.id, 30000, addDays(t, -6)), pay(iMd1.id, 30000, addDays(t, -25)), pay(iMoc.id, 8000, addDays(t, -2)), pay(iHung.id, 4000, addDays(t, -1)), ...history],
    expenses: [
      { id: uid(), date: addDays(t, -12), category: "Thiết bị", amount: 18000, note: "Ống kính 35mm" },
      { id: uid(), date: addDays(t, -8), category: "Đi lại", amount: 2500, note: "Taxi đi Đạm Thủy" },
      { id: uid(), date: addDays(t, -3), category: "Cloud và phần mềm", amount: 1200, note: "Cloudflare R2, Lightroom" },
    ],
    messages: [
      m(lan, "out", "Chào chị Lan, studio đang chỉnh ảnh, dự kiến xong trong 2 ngày ạ.", 1500),
      m(lan, "in", "Bên mình có thể thêm 10 ảnh vào gói không ạ?", 40),
      m(abc, "out", "Studio đã gửi link chọn ảnh, mật khẩu abc2026.", 5800),
      m(abc, "in", "Đã chọn xong 86 ảnh, nhờ studio xuất bản in", 120),
      m(moc, "in", "Lịch chụp chiều nay vẫn giữ nhé", 1100),
      m(hung, "out", "Hẹn anh 9 giờ 30 ở cổng chính công viên Đại An.", 1500),
      m(hung, "in", "Cảm ơn studio, hẹn 9 giờ 30 ở công viên", 1300),
      m(md, "out", "Gửi lại hóa đơn số 0042 để thầy kiểm tra ạ.", 3000),
    ],
    activity: [
      { id: uid(), projectId: pLan.id, text: "Bắt đầu chỉnh sửa", at: addDays(t, -1) },
      { id: uid(), projectId: pLan.id, text: "Lọc xong, giữ 412/1.248 ảnh", at: addDays(t, -2) },
      { id: uid(), projectId: pLan.id, text: "Nhập 1.248 tệp từ thẻ SD", at: addDays(t, -3) },
    ],
    settings: { studioName: "Studio", nasRoot: "", renamePattern: "{date}_{project}_{n}" },
  };
}

// ---------- store core ----------
const KEY = "studio-manager-data-v1";
let state: Data = load();
const listeners = new Set<() => void>();

function load(): Data {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) { const d = JSON.parse(raw) as Data; if (d.version === 1) return d; }
  } catch { /* ignore broken or blocked storage */ }
  return seed();
}

function commit(next: Data) {
  state = next;
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage full or blocked */ }
  listeners.forEach((l) => l());
}

export const getState = () => state;
const subscribe = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };
// Subscribes to the whole store (a stable object until the next change), then applies the selector.
export function useStore<T>(select: (d: Data) => T): T {
  return select(useSyncExternalStore(subscribe, getState));
}
export const useData = () => useSyncExternalStore(subscribe, getState);
function update(fn: (d: Data) => Partial<Data>) { commit({ ...state, ...fn(state) }); }
const log = (projectId: string, text: string): Activity => ({ id: uid(), projectId, text, at: today() });

// ---------- derived ----------
export const paidFor = (d: Data, invoiceId: string) => d.payments.filter((p) => p.invoiceId === invoiceId).reduce((s, p) => s + p.amount, 0);
export type InvoiceStatus = "paid" | "overdue" | "pending";
export const invoiceStatus = (d: Data, inv: Invoice): InvoiceStatus =>
  paidFor(d, inv.id) >= inv.amount ? "paid" : inv.due < today() ? "overdue" : "pending";
export const projectPaid = (d: Data, projectId: string) =>
  d.invoices.filter((i) => i.projectId === projectId).reduce((s, i) => s + paidFor(d, i.id), 0);
export const clientOf = (d: Data, id: string) => d.clients.find((c) => c.id === id);
export const nextInvoiceNo = (d: Data) => {
  const n = d.invoices.map((i) => parseInt(i.no.replace(/\D/g, ""), 10)).filter((x) => !isNaN(x) && x < 9000);
  return "#" + String((n.length ? Math.max(...n) : 0) + 1).padStart(4, "0");
};

// ---------- actions ----------
export const actions = {
  reset() { commit(seed()); },

  addClient(c: Omit<Client, "id">) { const client = { ...c, id: uid() }; update((d) => ({ clients: [...d.clients, client] })); return client; },
  updateClient(id: string, patch: Partial<Client>) { update((d) => ({ clients: d.clients.map((c) => (c.id === id ? { ...c, ...patch } : c)) })); },

  addProject(p: Omit<Project, "id" | "createdAt">) {
    const project: Project = { ...p, id: uid(), createdAt: today() };
    update((d) => ({ projects: [project, ...d.projects], activity: [log(project.id, "Tạo dự án"), ...d.activity] }));
    return project;
  },
  updateProject(id: string, patch: Partial<Project>) { update((d) => ({ projects: d.projects.map((p) => (p.id === id ? { ...p, ...patch } : p)) })); },
  setStage(id: string, stage: Stage) {
    const label = STAGES.find((s) => s.id === stage)!.label;
    update((d) => ({ projects: d.projects.map((p) => (p.id === id ? { ...p, stage } : p)), activity: [log(id, "Chuyển sang " + label), ...d.activity] }));
  },
  deleteProject(id: string) {
    update((d) => {
      const inv = new Set(d.invoices.filter((i) => i.projectId === id).map((i) => i.id));
      return {
        projects: d.projects.filter((p) => p.id !== id), assets: d.assets.filter((a) => a.projectId !== id),
        invoices: d.invoices.filter((i) => !inv.has(i.id)), payments: d.payments.filter((p) => !inv.has(p.invoiceId)),
        activity: d.activity.filter((a) => a.projectId !== id),
      };
    });
  },
  logActivity(projectId: string, text: string) { update((d) => ({ activity: [log(projectId, text), ...d.activity] })); },

  addAssets(list: Omit<Asset, "id" | "color">[]) {
    const withIds = list.map((a, i) => ({ ...a, id: uid(), color: TILE_COLORS[i % TILE_COLORS.length] }));
    update((d) => ({ assets: [...d.assets, ...withIds] }));
  },
  updateAsset(id: string, patch: Partial<Asset>) { update((d) => ({ assets: d.assets.map((a) => (a.id === id ? { ...a, ...patch } : a)) })); },
  updateAssets(ids: string[], patch: Partial<Asset>) { const s = new Set(ids); update((d) => ({ assets: d.assets.map((a) => (s.has(a.id) ? { ...a, ...patch } : a)) })); },

  addInvoice(i: Omit<Invoice, "id">) { const invoice = { ...i, id: uid() }; update((d) => ({ invoices: [...d.invoices, invoice], activity: i.projectId ? [log(i.projectId, `Tạo hóa đơn ${i.no}`), ...d.activity] : d.activity })); return invoice; },
  deleteInvoice(id: string) { update((d) => ({ invoices: d.invoices.filter((i) => i.id !== id), payments: d.payments.filter((p) => p.invoiceId !== id) })); },
  addPayment(p: Omit<Payment, "id">) {
    const inv = state.invoices.find((i) => i.id === p.invoiceId);
    update((d) => ({ payments: [...d.payments, { ...p, id: uid() }], activity: inv?.projectId ? [log(inv.projectId, `Đã thu ${money(p.amount)} (${inv.no})`), ...d.activity] : d.activity }));
  },
  addExpense(e: Omit<Expense, "id">) { update((d) => ({ expenses: [{ ...e, id: uid() }, ...d.expenses] })); },
  deleteExpense(id: string) { update((d) => ({ expenses: d.expenses.filter((e) => e.id !== id) })); },

  sendMessage(clientId: string, text: string) {
    const c = state.clients.find((x) => x.id === clientId);
    if (!c) return;
    update((d) => ({ messages: [...d.messages, { id: uid(), clientId, channel: c.channel, dir: "out", text, at: new Date().toISOString(), read: true }] }));
  },
  receiveMessage(clientId: string, text: string) {
    const c = state.clients.find((x) => x.id === clientId);
    if (!c) return;
    update((d) => ({ messages: [...d.messages, { id: uid(), clientId, channel: c.channel, dir: "in", text, at: new Date().toISOString(), read: true }] }));
  },
  markRead(clientId: string) {
    if (!state.messages.some((m) => m.clientId === clientId && !m.read)) return; update((d) => ({ messages: d.messages.map((m) => (m.clientId === clientId ? { ...m, read: true } : m)) })); },

  updateSettings(patch: Partial<Data["settings"]>) { update((d) => ({ settings: { ...d.settings, ...patch } })); },
};
