// Client for the small studio-pick server (server/studio-pick). The key stays on this computer only.
const KEY = "studio-manager-pick-v1";
export interface PickServer { url: string; key: string }
export const DEFAULT_PICK_URL = "https://studio-pick-geopix.vercel.app";

export function getPickServer(): PickServer {
  try { const v = JSON.parse(localStorage.getItem(KEY) || "{}"); return { url: (v.url || DEFAULT_PICK_URL).replace(/\/+$/, ""), key: v.key || "" }; } catch { return { url: DEFAULT_PICK_URL, key: "" }; }
}
export function setPickServer(s: PickServer) { try { localStorage.setItem(KEY, JSON.stringify({ url: s.url.trim(), key: s.key.trim() })); } catch { /* storage blocked */ } }

const MAX_BYTES = 4_200_000; // Vercel functions accept about 4.5 MB per request

export async function publishPage(id: string, html: string): Promise<string> {
  const s = getPickServer();
  if (!s.key) throw new Error("Chưa nhập khóa máy chủ (Cài đặt → Máy chủ chọn ảnh).");
  const body = JSON.stringify({ id, html });
  if (new Blob([body]).size > MAX_BYTES) throw new Error("Trang quá nặng để đăng (hơn 4 MB). Giảm số ảnh hoặc dùng nút tải .html.");
  const r = await fetch(s.url + "/api/publish", { method: "POST", headers: { "content-type": "application/json", "x-studio-key": s.key }, body });
  if (r.status === 401) throw new Error("Khóa máy chủ sai.");
  if (!r.ok) throw new Error("Máy chủ báo lỗi " + r.status);
  return `${s.url}/g/${id}`;
}

export async function fetchPicks(id: string): Promise<{ names: string[]; at: string | null }> {
  const s = getPickServer();
  const r = await fetch(`${s.url}/api/pick?id=${encodeURIComponent(id)}`, { headers: { "x-studio-key": s.key } });
  if (r.status === 401) throw new Error("Khóa máy chủ sai.");
  if (!r.ok) throw new Error("Máy chủ báo lỗi " + r.status);
  return r.json();
}
