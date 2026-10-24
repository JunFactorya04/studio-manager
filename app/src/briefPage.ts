// Builds the public event briefing page a photographer opens on their phone before the shoot.
// The output is one self-contained HTML file (no external requests), so it can be previewed in the app,
// downloaded, or hosted anywhere, e.g. as /e/<eventId>/ on Vercel.
import { ROUTE_KIND, type OpsEvent, type Photographer, type RouteInfo, type Spot, type SpotPhase } from "./opsStore";
import { toGpx } from "./gpx";

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
// Only http(s) links are allowed through; anything else (javascript:, data:) is dropped.
const safeUrl = (u: string) => (/^https?:\/\//i.test(u.trim()) ? esc(u.trim()) : "");
const link = (url: string, text: string) => (safeUrl(url) ? `<a href="${safeUrl(url)}" target="_blank" rel="noopener">${esc(text)}</a>` : "");
// Attached files travel inside the page as data: URLs. Only these types are accepted; anything else is dropped.
const DATA_OK = /^data:(application\/pdf|image\/(png|jpeg|webp|gif)|application\/gpx\+xml);base64,[A-Za-z0-9+/=]+$/;
const b64 = (s: string) => btoa(unescape(encodeURIComponent(s)));

// Route drawing: equirectangular projection (longitude scaled by cos latitude), start/finish marks and numbered camera spots.
function routeSvg(r: RouteInfo, spots: Spot[]): string {
  const pts = r.points;
  if (pts.length < 2) return "";
  const lat0 = pts.reduce((a, p) => a + p.lat, 0) / pts.length, k = Math.cos((lat0 * Math.PI) / 180);
  const xs = pts.map((p) => p.lon * k), ys = pts.map((p) => -p.lat);
  const inBox = (s: Spot) => typeof s.lat === "number" && typeof s.lon === "number";
  const sx = Math.min(...pts.map((p) => p.lon)), ex = Math.max(...pts.map((p) => p.lon)), sy = Math.min(...pts.map((p) => p.lat)), ey = Math.max(...pts.map((p) => p.lat));
  const mx = (ex - sx) * 0.1 + 1e-5, my = (ey - sy) * 0.1 + 1e-5;
  // Only spots that fall on or beside this route are drawn on its map.
  const near = spots.filter((s) => inBox(s) && s.lon! >= sx - mx && s.lon! <= ex + mx && s.lat! >= sy - my && s.lat! <= ey + my);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const W = 640, H = 300, pad = 26, sc = Math.min((W - pad * 2) / Math.max(1e-9, maxX - minX), (H - pad * 2) / Math.max(1e-9, maxY - minY));
  const ox = (W - (maxX - minX) * sc) / 2, oy = (H - (maxY - minY) * sc) / 2;
  const X = (lon: number) => (ox + (lon * k - minX) * sc).toFixed(1), Y = (lat: number) => (oy + (-lat - minY) * sc).toFixed(1);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${X(p.lon)},${Y(p.lat)}`).join("");
  const marks = near.map((s, i) => `<g><circle cx="${X(s.lon!)}" cy="${Y(s.lat!)}" r="9" fill="var(--orange)"/><text x="${X(s.lon!)}" y="${Y(s.lat!)}" dy="4" text-anchor="middle" font-size="11" font-weight="700" fill="#fff">${i + 1}</text></g>`).join("");
  const legend = near.length ? `<ol class="legend">${near.map((s) => `<li>${esc(s.name)}</li>`).join("")}</ol>` : "";
  // Elevation profile when the file carried elevation.
  const el = pts.map((p) => p.ele).filter((e): e is number => typeof e === "number");
  let prof = "";
  if (el.length > 2) {
    const lo = Math.min(...el), hi = Math.max(...el), span = Math.max(1, hi - lo), w = 640, h = 70;
    const line = el.map((e, i) => `${(i / (el.length - 1)) * w},${h - 6 - ((e - lo) / span) * (h - 12)}`).join(" ");
    prof = `<svg viewBox="0 0 ${w} ${h}" class="prof" role="img" aria-label="Biểu đồ độ cao, thấp nhất ${lo} m, cao nhất ${hi} m"><polygon points="0,${h} ${line} ${w},${h}" fill="color-mix(in srgb,var(--blue) 18%,transparent)"/><polyline points="${line}" fill="none" stroke="var(--blue)" stroke-width="2" vector-effect="non-scaling-stroke"/></svg><div class="prof-note">Độ cao ${lo}–${hi} m</div>`;
  }
  return `<svg viewBox="0 0 ${W} ${H}" class="map" role="img" aria-label="Sơ đồ đường ${esc(r.name)}"><rect width="${W}" height="${H}" rx="10" fill="var(--fill)"/><path d="${d}" fill="none" stroke="var(--blue)" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${X(pts[0].lon)}" cy="${Y(pts[0].lat)}" r="6" fill="var(--green)" stroke="#fff" stroke-width="2"/><circle cx="${X(pts[pts.length - 1].lon)}" cy="${Y(pts[pts.length - 1].lat)}" r="6" fill="#ff3b30" stroke="#fff" stroke-width="2"/>${marks}</svg>${legend}${prof}`;
}

const fmtDay = (iso: string) => { if (!iso) return ""; const [y, m, d] = iso.split("-"); return `${d}/${m}/${y}`; };
const digits = (s: string) => s.replace(/[^\d+]/g, "");
const code = (n: string) => { const w = n.trim().split(/\s+/); const c = w.length > 1 ? w.map((x) => x[0]).join("") : n.slice(0, 3); return c.slice(0, 3).toUpperCase() || "?"; };
const mapsOf = (s: Spot) => s.mapsUrl && safeUrl(s.mapsUrl) ? s.mapsUrl : typeof s.lat === "number" && typeof s.lon === "number" ? `https://maps.google.com/?q=${s.lat},${s.lon}` : "";
// Plain text with web addresses turned into links (only http/https).
const linkify = (t: string) => esc(t).replace(/https?:\/\/[^\s<]+/g, (u) => `<a href="${u}" target="_blank" rel="noopener">${u}</a>`);

const PHASE_COLOR: Record<SpotPhase, string> = { swim: "#3b82f6", transition: "#eab308", bike: "#ef4444", run: "#22c55e", finish: "#64748b", other: "#8b5cf6" };
const PHASE_LABEL: Record<SpotPhase, string> = { swim: "Bơi", transition: "Chuyển tiếp", bike: "Đạp xe", run: "Chạy bộ", finish: "Về đích", other: "Khác" };
const phaseOf = (s: Spot): SpotPhase => s.phase ?? (/finish|đích|about/i.test(s.name) ? "finish" : /transition|chuyển|\bt[12]\b/i.test(s.name) ? "transition" : /swim|bơi/i.test(s.name) ? "swim" : /bike|đạp|cycl/i.test(s.name) ? "bike" : /run|chạy/i.test(s.name) ? "run" : "other");
const ROUTE_COLOR: Record<string, string> = { bike: "#2563eb", run: "#dc2626", swim: "#0ea5e9", other: "#8b5cf6" };

// Small outline icons (Lucide-style paths) used in section headers and tabs.
const IC: Record<string, string> = {
  pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  mega: '<path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
  target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  route: '<circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/>',
  folder: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9l-.8-1.2A2 2 0 0 0 7.9 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  bed: '<path d="M2 4v16"/><path d="M2 8h18a2 2 0 0 1 2 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/>',
  cam: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"/><circle cx="12" cy="13" r="3"/>',
  img: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  alert: '<path d="m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  nav: '<path d="m3 11 19-9-9 19-2-8z"/>',
  cal: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  chev: '<path d="m6 9 6 6 6-6"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  ext: '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  dl: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  req: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 8v8M8 12h8"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 10a16 16 0 0 0 6 6l1.4-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z"/>',
};
const ico = (n: string, size = 16) => `<svg class="i" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[n] ?? ""}</svg>`;

// All-day calendar entry so the shoot lands in the photographer's phone calendar.
function icsOf(ev: OpsEvent, where: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ev.date)) return "";
  const end = new Date((ev.endDate && /^\d{4}-\d{2}-\d{2}$/.test(ev.endDate) ? ev.endDate : ev.date) + "T00:00:00Z"); end.setUTCDate(end.getUTCDate() + 1);
  const t = (x: string) => x.replace(/\\/g, "\\\\").replace(/[,;]/g, (c) => "\\" + c).replace(/\n/g, "\\n");
  const body = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Studio Manager//Briefing//VI", "BEGIN:VEVENT", `UID:${ev.id}@studio-manager`, `DTSTAMP:${new Date().toISOString().replace(/[-:]|\.\d+/g, "")}`,
    `DTSTART;VALUE=DATE:${ev.date.replace(/-/g, "")}`, `DTEND;VALUE=DATE:${end.toISOString().slice(0, 10).replace(/-/g, "")}`, `SUMMARY:${t(ev.name)}`, where ? `LOCATION:${t(where)}` : "", "END:VEVENT", "END:VCALENDAR"].filter(Boolean).join("\r\n");
  return "data:text/calendar;charset=utf-8," + encodeURIComponent(body);
}
const fileSlug = (n: string) => n.replace(/[^\p{L}\p{N}\- ]+/gu, "").trim() || "file";

export function briefHtml(ev: OpsEvent, spots: Spot[], photographers: Photographer[]): string {
  const b = ev.brief;
  const pg = (id: string) => photographers.find((p) => p.id === id);
  const routes = b?.routes ?? [];
  const goodFiles = (b?.files ?? []).filter((f) => !f.data || DATA_OK.test(f.data));
  const images = goodFiles.filter((f) => f.data?.startsWith("data:image/"));
  const docs = goodFiles.filter((f) => !f.data?.startsWith("data:image/"));
  const team = Array.from(new Set(spots.map((s) => s.photographerId).filter(Boolean))).map((id) => pg(id)).filter(Boolean) as Photographer[];
  const leader = b?.teamLeader ? photographers.find((p) => p.name.toLowerCase() === b.teamLeader.toLowerCase()) : undefined;
  const dates = ev.endDate && ev.endDate !== ev.date ? `${fmtDay(ev.date)} – ${fmtDay(ev.endDate)}` : fmtDay(ev.date);
  const where = b?.venueName || ev.venue;
  const channels = (b?.channels ?? []).filter((c) => safeUrl(c.url));
  const ics = icsOf(ev, [where, b?.venueAddress].filter(Boolean).join(", "));
  const badge = (name: string) => `<span class="cd">${esc(code(name))}</span>`;

  // Timeline of the day: start, each spot's arrival time, finish.
  const tl: { t: string; title: string; sub: string }[] = [];
  if (b?.startTime) tl.push({ t: b.startTime, title: "Xuất phát", sub: where || "" });
  spots.filter((s) => s.arrival).forEach((s) => tl.push({ t: s.arrival!, title: `Đến ${s.name}`, sub: [pg(s.photographerId)?.name, s.lens].filter(Boolean).join(" · ") }));
  if (b?.endTime) tl.push({ t: b.endTime, title: "Kết thúc", sub: "" });
  tl.sort((a, c) => a.t.localeCompare(c.t));

  const rows = spots.map((s, i) => {
    const p = pg(s.photographerId), m = mapsOf(s), ph = phaseOf(s);
    return `<tr class="ph-${ph}" data-i="${i}" data-spot="${esc(s.name)}" data-pg="${esc(p?.name ?? "")}" data-arrival="${esc(s.arrival ?? "")}" style="--pc:${PHASE_COLOR[ph]}">
      <td data-l="Điểm"><strong>${esc(s.name)}</strong><small class="phl">${PHASE_LABEL[ph]}</small></td><td data-l="Photographer">${p ? `${badge(p.name)} ${esc(p.name)}` : "—"}</td><td data-l="Ống kính">${esc(s.lens || "—")}</td><td data-l="Giờ đến">${esc(s.arrival || "—")}</td>
      <td data-l="Vị trí">${m ? `<a class="pillbtn" href="${safeUrl(m)}" target="_blank" rel="noopener">${ico("nav", 13)}Maps</a>` : "—"}</td><td data-l="Ghi chú">${esc(s.tip || "—")}</td></tr>`;
  }).join("");

  // Map data for the interactive map; the static SVG underneath stays as a fallback when scripts or tiles are blocked.
  const pins = spots.filter((s) => typeof s.lat === "number" && typeof s.lon === "number").map((s) => ({ n: s.name, lat: s.lat, lon: s.lon, c: PHASE_COLOR[phaseOf(s)] }));
  const lines = routes.filter((r) => r.points.length > 1).map((r) => ({ n: r.name, km: +r.distanceKm.toFixed(1), c: ROUTE_COLOR[r.kind] ?? ROUTE_COLOR.other, p: r.points.map((q) => [q.lat, q.lon]) }));
  const mapJson = JSON.stringify({ pins, lines }).replace(/</g, "\\u003c");

  const notesBox = b && (b.startTime || b.endTime || b.participants || b.notes.length)
    ? `<div class="note"><div class="nh">${ico("alert", 15)}LƯU Ý QUAN TRỌNG</div><ul>${b.startTime ? `<li>Bắt đầu: ${esc(b.startTime)}</li>` : ""}${b.endTime ? `<li>Kết thúc: ${esc(b.endTime)}</li>` : ""}${b.participants ? `<li>Số người tham gia: ${esc(b.participants)}</li>` : ""}${b.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul></div>` : "";

  const card = (id: string, icon: string, title: string, body: string, open = true, extra = "") =>
    `<details class="card" id="${id}"${open ? " open" : ""}><summary>${ico(icon, 18)}<span class="ct">${title}</span>${extra}<span class="chev">${ico("chev", 18)}</span></summary><div class="cb">${body}</div></details>`;

  const venueBody = where ? `<h3>${esc(where)}</h3>${b?.venueAddress ? `<div class="lab">Địa chỉ</div><p>${esc(b.venueAddress)}</p>` : ""}${b && safeUrl(b.venueMaps) ? `<a class="pillbtn soft" href="${safeUrl(b.venueMaps)}" target="_blank" rel="noopener">${ico("nav", 14)}Mở địa điểm trên bản đồ</a>` : ""}` : `<p class="empty">Chưa có địa điểm.</p>`;

  const briefingBody = `${b?.welcome ? `<p class="lead">${linkify(b.welcome)}</p>` : ""}
${channels.length ? `<p>Trong cộng đồng bạn sẽ thấy:</p><ol class="num">${channels.map((c) => `<li><a href="${safeUrl(c.url)}" target="_blank" rel="noopener">${esc(c.name)}</a></li>`).join("")}</ol>` : ""}
${b && b.guidance.length ? `<p class="lead">Những điều quan trọng nhất<span class="prog" id="prog"></span></p><ul class="chk" id="chk">${b.guidance.map((g, i) => `<li><input type="checkbox" id="g${i}" data-i="${i}"><label for="g${i}">${linkify(g)}</label></li>`).join("")}</ul>` : ""}
${!b?.welcome && !channels.length && !b?.guidance.length ? `<p class="empty">Chưa có nội dung briefing.</p>` : ""}`;

  const scheduleBody = tl.length >= 2 ? `<ol class="tl">${tl.map((x) => `<li><time>${esc(x.t)}</time><i></i><div><strong>${esc(x.title)}</strong>${x.sub ? `<small>${esc(x.sub)}</small>` : ""}</div></li>`).join("")}</ol>` : `<p class="empty">Chưa có giờ giấc. Nhập giờ bắt đầu, kết thúc và giờ đến của từng điểm chụp.</p>`;

  const tacticBody = `<div class="tools">
${team.length ? `<select id="fPg" aria-label="Lọc photographer"><option value="">Tất cả photographer</option>${team.map((p) => `<option>${esc(p.name)}</option>`).join("")}</select>` : ""}
<span class="sp"></span><label>Sắp xếp <select id="sortBy" aria-label="Sắp xếp"><option value="i">Thứ tự chạy</option><option value="spot">Tên điểm</option><option value="pg">Photographer</option><option value="arrival">Giờ đến</option></select></label>
${team.length ? `<label>Tôi là <select id="me" aria-label="Tôi là"><option value="">— chọn —</option>${team.map((p) => `<option>${esc(p.name)}</option>`).join("")}</select></label>` : ""}</div>
<div class="table"><table class="tbl"><thead><tr><th>Điểm</th><th>Photographer</th><th>Ống kính</th><th>Giờ đến</th><th>Vị trí</th><th>Ghi chú</th></tr></thead><tbody id="rows">${rows || `<tr><td colspan="6" class="empty">Chưa có điểm chụp.</td></tr>`}</tbody></table></div>`;

  const courseBody = `${lines.length ? `<div class="lgd">${lines.map((l) => `<span><i style="background:${l.c}"></i>${esc(l.n)} — ${l.km} km</span>`).join("")}</div>` : ""}
${lines.length || pins.length ? `<div class="mapbox"><div id="map" hidden></div><div id="mapfb">${routes.map((r) => routeSvg(r, spots)).join("")}</div></div>` : ""}
${routes.map((r) => `<div class="rt"><strong>${esc(r.name)}</strong> <span class="tag2">${esc(ROUTE_KIND[r.kind] ?? "")}</span> · ${r.distanceKm.toFixed(1)} km${r.ascentM || r.descentM ? ` · ↑ ${r.ascentM} m ↓ ${r.descentM} m` : ""} · <a download="${esc(fileSlug(r.name))}.gpx" href="data:application/gpx+xml;base64,${b64(toGpx(r.name, r.points))}">Tải GPX</a>${r.points.length ? ` · ${link(`https://maps.google.com/?q=${r.points[0].lat},${r.points[0].lon}`, "Điểm xuất phát")}` : ""}</div>`).join("")}
${b && b.course.length ? `<dl class="kv">${b.course.map((c) => `<dt>${esc(c.label)}</dt><dd>${esc(c.value)}</dd>`).join("")}</dl>` : ""}
${!routes.length && !pins.length && !(b && b.course.length) ? `<p class="empty">Chưa có thông tin lộ trình.</p>` : ""}`;

  const fileRow = (name: string, kind: string, href: string, isData: boolean) => {
    const isPdf = kind === "PDF", isGpx = kind === "GPX";
    const act = isData
      ? (isPdf ? `<a class="darkbtn" data-view="${href}" href="${href}" download="${esc(name)}">${ico("eye", 14)}Xem</a>` : `<a class="darkbtn" download="${esc(name)}" href="${href}">${ico("dl", 14)}Tải</a>`)
      : `<a class="darkbtn" href="${href}" target="_blank" rel="noopener">${ico("ext", 14)}Mở</a>`;
    return `<li><span class="fi">${ico(isPdf ? "folder" : "img", 18)}</span><span class="nm"><strong>${esc(name)}</strong><small><b class="k k-${kind.toLowerCase()}">${kind}</b>${isGpx ? " tệp lộ trình" : ""}</small></span>${act}</li>`;
  };
  const filesBody = docs.length ? `<ul class="files">${docs.map((f) => {
    const kind = f.data ? (f.data.startsWith("data:application/pdf") ? "PDF" : "GPX") : (/\.pdf(\?|$)/i.test(f.url) || /\.pdf$/i.test(f.name) ? "PDF" : /\.gpx(\?|$)/i.test(f.url) || /\.gpx$/i.test(f.name) ? "GPX" : "LINK");
    return fileRow(f.name, kind, f.data ? f.data : safeUrl(f.url), !!f.data);
  }).join("")}</ul>` : `<p class="empty">Chưa có tệp đính kèm.</p>`;

  const roomPeople = (txt: string) => esc(txt).replace(/[^,;·/]+/g, (seg) => { const nm = seg.trim(); const p = photographers.find((x) => esc(x.name) === nm); return p ? `${badge(p.name)} ${nm}` : seg; });
  const hotelBody = b && b.hotel.name ? `<h3>${esc(b.hotel.name)}</h3>${b.hotel.address ? `<div class="lab">Địa chỉ</div><p>${esc(b.hotel.address)}${b.hotel.phone ? ` · <a href="tel:${esc(digits(b.hotel.phone))}">${esc(b.hotel.phone)}</a>` : ""}</p>` : ""}${safeUrl(b.hotel.maps) ? `<a class="pillbtn soft" href="${safeUrl(b.hotel.maps)}" target="_blank" rel="noopener">${ico("nav", 14)}Mở khách sạn trên bản đồ</a>` : ""}
<div class="g2">${b.hotel.checkIn ? `<div><div class="lab">Nhận phòng</div><p>${esc(b.hotel.checkIn)}</p></div>` : ""}${b.hotel.checkOut ? `<div><div class="lab">Trả phòng</div><p>${esc(b.hotel.checkOut)}</p></div>` : ""}</div>
${b.hotel.booking ? `<div class="lab">Mã đặt phòng</div><p>${esc(b.hotel.booking)}</p>` : ""}
${b.rooms.length ? `<table class="rooms"><thead><tr><th>Phòng</th><th>Người ở</th></tr></thead><tbody>${b.rooms.map((r) => `<tr><td><strong>${esc(r.room)}</strong></td><td>${roomPeople(r.people)}</td></tr>`).join("")}</tbody></table>` : ""}` : `<p class="empty">Sự kiện này không có thông tin lưu trú.</p>`;

  const teamBody = team.length ? `<div class="people">${team.map((p) => {
    const mine = spots.filter((s) => s.photographerId === p.id);
    return `<div class="person"><span class="av">${esc(code(p.name))}</span><div><strong>${esc(p.name)}</strong>${p.phone ? `<small><a href="tel:${esc(digits(p.phone))}">${esc(p.phone)}</a></small>` : ""}<small>${mine.length} điểm: ${esc(mine.map((s) => s.name).join(", "))}</small></div></div>`;
  }).join("")}</div>` : `<p class="empty">Chưa phân công photographer.</p>`;

  const tabs: [string, string, string][] = [["venue", "pin", "Địa điểm"], ["briefing", "mega", "Briefing"], ["schedule", "clock", "Lịch trình"], ["tactic", "target", "Phân công"], ["course", "route", "Lộ trình"], ["files", "folder", "Tệp"], ["hotel", "bed", "Khách sạn"], ["team", "cam", "Đội"]];
  if (images.length) tabs.push(["bestof", "img", "Ảnh tham khảo"]);
  const status = { draft: "ĐANG LẬP KẾ HOẠCH", live: "ĐANG DIỄN RA", done: "KẾT THÚC" }[ev.status];

  return `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex"><meta name="theme-color" content="#0b1220"><title>${esc(ev.name)} · Briefing</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css">
<style>
:root{--bg:#f4f6fa;--box:#fff;--label:#0f172a;--label2:#64748b;--sep:#e2e8f0;--blue:#2563eb;--fill:#f1f5f9;--warnbg:#fefce8;--warnbd:#fde68a;--warnfg:#b45309;--dark:#0f172a;--darkfg:#fff;
--font:Inter,-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI Variable Text","Segoe UI",system-ui,sans-serif}
@media(prefers-color-scheme:dark){:root{--bg:#0b1220;--box:#131c2e;--label:#e6ebf5;--label2:#94a3b8;--sep:#243049;--blue:#60a5fa;--fill:#1b2740;--warnbg:#2a2410;--warnbd:#5b4a12;--warnfg:#fbbf24;--dark:#e6ebf5;--darkfg:#0b1220}}
*{box-sizing:border-box}html{scroll-behavior:smooth;scroll-padding-top:64px}
body{margin:0;background:var(--bg);color:var(--label);font:15px/1.55 var(--font);-webkit-font-smoothing:antialiased}
a{color:var(--blue);text-decoration:none}a:hover{text-decoration:underline}
.i{flex:none;vertical-align:-3px}
.hero{background:#0b1220;color:#fff;border-bottom:4px solid #2563eb;padding:22px 16px 20px}
.hero-in{max-width:860px;margin:0 auto;position:relative}
.eyebrow{font-size:11px;letter-spacing:.14em;text-transform:uppercase;opacity:.7;font-weight:600}
.status{position:absolute;right:0;top:-2px;padding:3px 10px;border-radius:999px;background:#fff;color:#0f172a;font-size:11px;font-weight:700;letter-spacing:.04em}
.status::before{content:"";display:inline-block;width:7px;height:7px;border-radius:50%;background:#94a3b8;margin-right:6px}
.status.live::before{background:#22c55e}
h1{font-size:30px;line-height:1.15;margin:12px 0 10px;letter-spacing:-.02em}
.meta{display:flex;flex-wrap:wrap;gap:6px 16px;font-size:14px;color:#cbd5e1}.meta span{display:inline-flex;gap:6px;align-items:center}.meta .i{color:#60a5fa}
.count{display:inline-block;margin-top:10px;padding:3px 12px;border-radius:999px;background:rgba(96,165,250,.18);color:#bfdbfe;font-size:13px;font-weight:600}
.acts{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
.act{display:inline-flex;align-items:center;gap:7px;padding:8px 14px;border-radius:8px;background:#1e293b;color:#fff;font-weight:600;font-size:14px}
.act.pri{background:#2563eb}.act:hover{text-decoration:none;filter:brightness(1.15)}
.tabs{position:sticky;top:0;z-index:20;background:var(--box);border-bottom:1px solid var(--sep)}
.tabs-in{max-width:860px;margin:0 auto;padding:10px 16px;display:flex;gap:8px;overflow-x:auto;scrollbar-width:none}
.tabs a{flex:none;display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border:1px solid var(--sep);border-radius:999px;font-size:13px;font-weight:600;color:var(--label);background:var(--box)}
.tabs a:hover{text-decoration:none;background:var(--fill)}.tabs a.on{background:var(--blue);border-color:var(--blue);color:#fff}
.wrap{max-width:860px;margin:0 auto;padding:16px 16px 56px;display:grid;gap:12px}
.note{background:var(--warnbg);border:1px solid var(--warnbd);border-radius:12px;padding:14px 18px}
.note .nh{display:flex;gap:7px;align-items:center;color:var(--warnfg);font-weight:700;font-size:13px;letter-spacing:.02em;margin-bottom:6px}
.note ul{margin:0;padding-left:20px}.note li+li{margin-top:5px}
.card{background:var(--box);border:1px solid var(--sep);border-radius:12px;box-shadow:0 1px 2px rgba(15,23,42,.05)}
.card>summary{list-style:none;cursor:pointer;display:flex;align-items:center;gap:10px;padding:14px 16px;font-weight:700;letter-spacing:.03em;text-transform:uppercase;font-size:14px;color:var(--label)}
.card>summary::-webkit-details-marker{display:none}.card>summary .i:first-child{color:var(--blue)}
.ct{flex:1}.chev{color:var(--label2);transition:transform .15s}details[open]>summary .chev{transform:rotate(180deg)}
.card:not([open])>summary .chev{transform:rotate(-90deg)}
.cb{padding:4px 16px 16px;border-top:1px solid var(--sep);padding-top:14px}
.cnt{font-weight:500;color:var(--label2);text-transform:none;letter-spacing:0;font-size:13px}
h3{font-size:17px;margin:0 0 10px}
.lab{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--label2);margin-top:6px}
.cb p{margin:2px 0 10px}.lead{font-weight:600}
.pillbtn{display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:7px;background:var(--dark);color:var(--darkfg);font-size:12.5px;font-weight:600}
.pillbtn:hover{text-decoration:none;opacity:.88}.pillbtn.soft{background:color-mix(in srgb,var(--blue) 12%,transparent);color:var(--blue);padding:6px 12px;font-size:13px}
.num{margin:0 0 10px;padding-left:22px}.num li+li{margin-top:4px}
.chk{list-style:none;padding:0;margin:0}.chk li{display:flex;gap:10px;align-items:flex-start;padding:5px 0}.chk input{margin-top:5px;width:18px;height:18px;flex:none;accent-color:var(--blue)}.chk label{flex:1}.chk input:checked+label{text-decoration:line-through;color:var(--label2)}
.prog{font-size:12px;color:var(--label2);margin-left:6px;font-weight:400}
.tl{list-style:none;margin:0;padding:0}.tl li{display:grid;grid-template-columns:56px 14px 1fr;gap:10px;position:relative;padding-bottom:14px}.tl li:last-child{padding-bottom:0}
.tl time{font-variant-numeric:tabular-nums;font-weight:600;text-align:right}.tl i{width:10px;height:10px;border-radius:50%;background:var(--blue);margin-top:7px;position:relative;z-index:1}
.tl li::before{content:"";position:absolute;left:66px;top:13px;bottom:-6px;width:2px;background:var(--sep)}.tl li:last-child::before{display:none}.tl small{display:block;color:var(--label2)}
.tools{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center;margin-bottom:10px;font-size:13px;color:var(--label2)}.tools .sp{flex:1}
select{font:inherit;font-size:13px;color:var(--label);background:var(--box);border:1px solid var(--sep);border-radius:7px;padding:5px 8px}
.table{overflow-x:auto;border:1px solid var(--sep);border-radius:10px}
table{width:100%;border-collapse:collapse;font-size:14px}
th{text-align:left;font-weight:700;color:var(--label2);font-size:11px;letter-spacing:.06em;text-transform:uppercase;padding:9px 12px;border-bottom:1px solid var(--sep);white-space:nowrap;background:var(--fill)}
td{padding:9px 12px;border-bottom:1px solid var(--sep);vertical-align:top}tr:last-child td{border-bottom:0}
.tbl tbody tr{background:color-mix(in srgb,var(--pc,#fff) 14%,var(--box));box-shadow:inset 4px 0 0 var(--pc,transparent)}
.tbl tbody tr.ph-finish{background:var(--box)}
.tbl tbody tr.me{background:color-mix(in srgb,var(--blue) 28%,var(--box))}
.phl{display:block;font-size:11px;color:var(--label2);font-weight:500}
.cd{display:inline-block;padding:0 6px;border-radius:5px;background:var(--dark);color:var(--darkfg);font-size:11px;font-weight:700;letter-spacing:.03em;margin-right:4px;line-height:19px}
.lgd{display:flex;flex-wrap:wrap;gap:6px 16px;font-size:13px;color:var(--label2);margin-bottom:10px}.lgd i{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:6px}
.mapbox{border-radius:12px;overflow:hidden;border:1px solid var(--sep);position:relative}
#map{height:380px;background:#aad3df}#mapfb svg.map{margin:0}#mapfb .legend,#mapfb .prof,#mapfb .prof-note{display:none}
.sat{position:absolute;top:10px;right:10px;z-index:1000;border:0;border-radius:7px;background:#fff;color:#0f172a;font:600 13px var(--font);padding:7px 12px;box-shadow:0 1px 4px rgba(0,0,0,.3);cursor:pointer}
.pin{display:inline-block;transform:translate(-50%,-50%);white-space:nowrap;padding:2px 9px;border-radius:999px;color:#fff;font:700 11px var(--font);border:1.5px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4)}
.leaflet-div-icon.pinw{background:none;border:0;overflow:visible;width:0!important;height:0!important}
.rt{font-size:13.5px;color:var(--label2);margin-top:10px}.rt strong{color:var(--label)}.tag2{padding:1px 8px;border-radius:6px;font-size:11px;font-weight:600;background:var(--fill)}
.kv{display:grid;grid-template-columns:120px 1fr;gap:6px 12px;margin:12px 0 0}.kv dt{color:var(--label2)}.kv dd{margin:0}
.map{width:100%;height:auto;display:block}
.files{list-style:none;margin:0;padding:0;display:grid;gap:8px}
.files li{display:flex;align-items:center;gap:12px;padding:10px 12px;border:1px solid var(--sep);border-radius:10px;background:var(--fill)}
.fi{flex:none;width:40px;height:40px;border-radius:9px;display:grid;place-items:center;background:var(--box);color:var(--label2)}
.files .nm{flex:1;min-width:0}.files .nm strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.files small{color:var(--label2);font-size:12px}
.k{display:inline-block;padding:0 6px;border-radius:4px;font-size:10.5px;font-weight:700;margin-right:6px}.k-pdf{background:#fee2e2;color:#b91c1c}.k-gpx{background:#dcfce7;color:#15803d}.k-link{background:#e0e7ff;color:#3730a3}
.darkbtn{display:inline-flex;align-items:center;gap:6px;padding:7px 13px;border-radius:8px;background:var(--dark);color:var(--darkfg);font-weight:600;font-size:13px}.darkbtn:hover{text-decoration:none;opacity:.88}
.g2{display:grid;grid-template-columns:1fr 1fr;gap:0 16px;margin-top:8px}
.rooms{margin-top:8px;border:1px solid var(--sep);border-radius:10px;overflow:hidden}
.people{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:10px}
.person{display:flex;gap:12px;align-items:center;border:1px solid var(--sep);border-radius:12px;padding:12px 14px;background:var(--fill)}
.av{flex:none;width:42px;height:42px;border-radius:50%;display:grid;place-items:center;background:var(--dark);color:var(--darkfg);font-weight:700;font-size:13px}
.person small{display:block;color:var(--label2)}
.gal{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}.gal a{display:block;border-radius:10px;overflow:hidden;aspect-ratio:4/3;background:var(--fill)}.gal img{width:100%;height:100%;object-fit:cover;display:block}
.empty{color:var(--label2)}
footer{margin:10px 0 0;text-align:center;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--label2)}
@media(max-width:600px){h1{font-size:25px}.status{position:static;display:inline-block;margin-bottom:8px}.kv{grid-template-columns:1fr}.kv dt{margin-top:6px}.g2{grid-template-columns:1fr}
.tbl thead{display:none}.tbl,.tbl tbody,.tbl tr,.tbl td{display:block}.tbl tr{padding:10px 8px 10px 12px}.tbl td{border:0;padding:2px 4px;display:flex;gap:10px}.tbl td::before{content:attr(data-l);flex:none;width:92px;color:var(--label2);font-size:12px;padding-top:2px}.tbl .phl{display:none}.table{border:0}.tbl tbody tr{margin-bottom:8px;border-radius:10px;border:1px solid var(--sep)}#map{height:320px}}
@media print{.tabs,.acts,.tools,.sat{display:none}.hero{-webkit-print-color-adjust:exact;print-color-adjust:exact}.card{break-inside:avoid}#map{display:none!important}#mapfb{display:block!important}}
</style></head><body data-id="${esc(ev.id)}" data-date="${esc(ev.date)}">
<header class="hero"><div class="hero-in">
<div class="eyebrow">Studio Manager · Briefing sự kiện</div><span class="status ${ev.status}">${esc(status)}</span>
<h1>${esc(ev.name)}</h1>
<div class="meta">${dates ? `<span>${ico("cal", 15)}${esc(dates)}</span>` : ""}${where ? `<span>${ico("pin", 15)}${esc(where)}</span>` : ""}${b?.teamLeader ? `<span>TL: ${esc(b.teamLeader)}</span>` : ""}</div>
<div id="count" class="count" hidden></div>
<div class="acts">
${channels.slice(0, 2).map((c, i) => `<a class="act${i === 0 ? " pri" : ""}" href="${safeUrl(c.url)}" target="_blank" rel="noopener">${ico(i === 0 ? "req" : "cam", 15)}${esc(c.name)}</a>`).join("")}
${leader?.phone ? `<a class="act" href="tel:${esc(digits(leader.phone))}">${ico("phone", 15)}Gọi trưởng nhóm</a>` : ""}
${ics ? `<a class="act" download="${esc(fileSlug(ev.name))}.ics" href="${ics}">${ico("cal", 15)}Thêm vào lịch</a>` : ""}
<a class="act" href="#" onclick="window.print();return false">In / lưu PDF</a>
</div></div></header>
<nav class="tabs" aria-label="Mục lục"><div class="tabs-in">${tabs.map(([id, ic, l]) => `<a href="#${id}">${ico(ic, 14)}${l}</a>`).join("")}</div></nav>
<main class="wrap">
${notesBox}
${card("venue", "pin", "Địa điểm", venueBody)}
${card("briefing", "mega", "Briefing", briefingBody)}
${card("schedule", "clock", "Lịch trình trong ngày", scheduleBody, false)}
${card("tactic", "target", "Phân công", tacticBody)}
${card("course", "route", "Bản đồ lộ trình", courseBody)}
${card("files", "folder", "Tệp", filesBody)}
${card("hotel", "bed", "Khách sạn", hotelBody)}
${card("team", "cam", "Đội", teamBody, false, `<span class="cnt">${team.length} người</span>`)}
${images.length ? card("bestof", "img", "Ảnh tham khảo", `<div class="gal">${images.map((f) => `<a download="${esc(f.name)}" href="${f.data}" title="${esc(f.name)}"><img src="${f.data}" alt="${esc(f.name)}" loading="lazy"></a>`).join("")}</div>`, false, `<span class="cnt">${images.length} ảnh</span>`) : ""}
<footer>Studio Manager · Một sự kiện, một nguồn thông tin</footer>
</main>
<script type="application/json" id="mapdata">${mapJson}</script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>
<script>
(function(){
var id=document.body.dataset.id;
function g(k){try{return localStorage.getItem(k)}catch(e){return null}}function s(k,v){try{localStorage.setItem(k,v)}catch(e){}}
// Countdown to the first day (the viewer's local date).
var c=document.getElementById("count"),d=document.body.dataset.date;
if(c&&/^\\d{4}-\\d{2}-\\d{2}$/.test(d)){var t=new Date(),a=new Date(t.getFullYear(),t.getMonth(),t.getDate()),p=d.split("-"),b=new Date(+p[0],+p[1]-1,+p[2]),n=Math.round((b-a)/864e5);
c.textContent=n>0?"Còn "+n+" ngày":n===0?"Hôm nay là ngày thi đấu":"Đã diễn ra "+(-n)+" ngày trước";c.hidden=false}
// Table: filter, sort, highlight "me".
var body=document.getElementById("rows"),sort=document.getElementById("sortBy"),me=document.getElementById("me"),fp=document.getElementById("fPg");
function rows(){return body?[].slice.call(body.querySelectorAll("tr[data-spot]")):[]}
function paint(){var m=me?me.value:"",f=fp?fp.value:"";rows().forEach(function(r){r.classList.toggle("me",!!m&&r.dataset.pg===m);r.hidden=!!f&&r.dataset.pg!==f})}
function order(){var k=sort.value;rows().sort(function(x,y){return k==="i"?(+x.dataset.i)-(+y.dataset.i):(x.dataset[k]||"").localeCompare(y.dataset[k]||"","vi")}).forEach(function(t){body.appendChild(t)})}
if(sort)sort.addEventListener("change",order);if(fp)fp.addEventListener("change",paint);
if(me){var sv=g("sm-me-"+id)||"";me.value=sv;if(me.value!==sv)me.value="";paint();me.addEventListener("change",function(){s("sm-me-"+id,me.value);paint()})}
// Checklist remembered on this device.
var chk=document.getElementById("chk"),pr=document.getElementById("prog");
if(chk){var saved={};try{saved=JSON.parse(g("sm-chk-"+id)||"{}")}catch(e){}
var boxes=[].slice.call(chk.querySelectorAll("input"));
function upd(){var n=boxes.filter(function(x){return x.checked}).length;pr.textContent=" "+n+"/"+boxes.length}
boxes.forEach(function(x){x.checked=!!saved[x.dataset.i];x.addEventListener("change",function(){saved[x.dataset.i]=x.checked;s("sm-chk-"+id,JSON.stringify(saved));upd()})});upd()}
// Tabs: open the target card, highlight the one in view.
var links=[].slice.call(document.querySelectorAll(".tabs a"));
links.forEach(function(l){l.addEventListener("click",function(){var t=document.querySelector(l.getAttribute("href"));if(t&&t.tagName==="DETAILS")t.open=true})});
if("IntersectionObserver"in window){var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){links.forEach(function(l){l.classList.toggle("on",l.getAttribute("href")==="#"+e.target.id)})}})},{rootMargin:"-30% 0px -60% 0px"});
links.forEach(function(l){var t=document.querySelector(l.getAttribute("href"));if(t)io.observe(t)})}
window.addEventListener("beforeprint",function(){[].forEach.call(document.querySelectorAll("details"),function(x){x.open=true})});
// PDFs open in a new tab through a blob (browsers block data: URLs as pages).
[].forEach.call(document.querySelectorAll("a[data-view]"),function(a){a.addEventListener("click",function(e){try{var u=a.dataset.view,bin=atob(u.split(",")[1]),arr=new Uint8Array(bin.length);for(var i=0;i<bin.length;i++)arr[i]=bin.charCodeAt(i);window.open(URL.createObjectURL(new Blob([arr],{type:"application/pdf"})),"_blank");e.preventDefault()}catch(x){}})});
// Interactive map (Leaflet). If the library or tiles are blocked the static drawing stays visible.
function initMap(){
var el=document.getElementById("map");if(!el||!window.L)return;
var d;try{d=JSON.parse(document.getElementById("mapdata").textContent)}catch(e){return}
if(!d.lines.length&&!d.pins.length)return;
el.hidden=false;document.getElementById("mapfb").hidden=true;
var map=L.map(el,{scrollWheelZoom:false});
var osm=L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"&copy; OpenStreetMap"}).addTo(map);
var sat=L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",{maxZoom:19,attribution:"Tiles &copy; Esri"});
var all=[];
d.lines.forEach(function(l){L.polyline(l.p,{color:l.c,weight:4,opacity:.9}).addTo(map);l.p.forEach(function(q){all.push(q)})});
d.pins.forEach(function(p){var sp=document.createElement("span");sp.className="pin";sp.style.background=p.c;sp.textContent=p.n;
L.marker([p.lat,p.lon],{icon:L.divIcon({className:"pinw",html:sp.outerHTML,iconSize:[0,0]})}).addTo(map);all.push([p.lat,p.lon])});
if(all.length)map.fitBounds(all,{padding:[28,28],maxZoom:16});
var on=false,btn=document.createElement("button");btn.className="sat";btn.type="button";btn.textContent="Vệ tinh";
btn.onclick=function(){on=!on;if(on){map.removeLayer(osm);sat.addTo(map)}else{map.removeLayer(sat);osm.addTo(map)}btn.textContent=on?"Bản đồ":"Vệ tinh"};
el.parentNode.appendChild(btn);
var det=document.getElementById("course");if(det)det.addEventListener("toggle",function(){setTimeout(function(){map.invalidateSize()},50)});
}
if(window.L)initMap();else window.addEventListener("load",initMap);
})();
</script></body></html>`;
}
