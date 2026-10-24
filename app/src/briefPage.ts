// Builds the public event briefing page a photographer opens on their phone before the shoot.
// The output is one self-contained HTML file (no external requests), so it can be previewed in the app,
// downloaded, or hosted anywhere, e.g. as /e/<eventId>/ on Vercel.
import { ROUTE_KIND, type OpsEvent, type Photographer, type RouteInfo, type Spot } from "./opsStore";
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

export function briefHtml(ev: OpsEvent, spots: Spot[], photographers: Photographer[]): string {
  const b = ev.brief;
  const pg = (id: string) => photographers.find((p) => p.id === id);
  const sections: [string, string][] = [["briefing", "Briefing"], ["venue", "Địa điểm"], ["tactic", "Phân công"], ["course", "Lộ trình"], ["files", "Tệp"], ["hotel", "Khách sạn"], ["team", "Đội"]];
  const dates = ev.endDate && ev.endDate !== ev.date ? `${fmtDay(ev.date)} – ${fmtDay(ev.endDate)}` : fmtDay(ev.date);

  const list = (items: string[]) => (items.length ? `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>` : "");
  const rows = spots.map((s) => {
    const p = pg(s.photographerId);
    return `<tr data-spot="${esc(s.name)}" data-pg="${esc(p?.name ?? "")}" data-arrival="${esc(s.arrival ?? "")}">
      <td><strong>${esc(s.name)}</strong></td><td>${esc(p?.name ?? "—")}</td><td>${esc(s.lens || "—")}</td><td>${esc(s.arrival || "—")}</td>
      <td>${link(s.mapsUrl ?? "", "Bản đồ") || "—"}</td><td>${esc(s.tip || "—")}</td></tr>`;
  }).join("");

  const team = Array.from(new Set(spots.map((s) => s.photographerId).filter(Boolean))).map((id) => pg(id)).filter(Boolean) as Photographer[];

  return `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex"><title>${esc(ev.name)} · Briefing</title>
<style>
:root{--bg:#f5f5f7;--box:#fff;--label:rgba(0,0,0,.88);--label2:rgba(0,0,0,.55);--sep:rgba(0,0,0,.1);--blue:#007aff;--green:#28cd41;--orange:#ff9500;--fill:rgba(0,0,0,.05);
--font:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI Variable Text","Segoe UI",system-ui,sans-serif}
@media(prefers-color-scheme:dark){:root{--bg:#161616;--box:#262628;--label:rgba(255,255,255,.88);--label2:rgba(255,255,255,.55);--sep:rgba(255,255,255,.12);--blue:#0a84ff;--fill:rgba(255,255,255,.07)}}
*{box-sizing:border-box}html{scroll-behavior:smooth;scroll-padding-top:64px}
body{margin:0;background:var(--bg);color:var(--label);font:15px/1.5 var(--font);-webkit-font-smoothing:antialiased}
a{color:var(--blue);text-decoration:none}a:hover{text-decoration:underline}
.wrap{max-width:860px;margin:0 auto;padding:0 16px 56px}
header{padding:28px 0 12px}
.eyebrow{font-size:12px;color:var(--label2);letter-spacing:.02em}
.tag{display:inline-block;margin-left:8px;padding:1px 8px;border-radius:6px;font-size:11px;font-weight:600;background:color-mix(in srgb,var(--blue) 15%,transparent);color:var(--blue)}
h1{font-size:30px;line-height:1.2;margin:6px 0 10px;letter-spacing:-.01em}
.meta{display:flex;flex-wrap:wrap;gap:6px 14px;color:var(--label2);font-size:14px}
nav{position:sticky;top:0;z-index:5;margin:0 -16px;padding:8px 16px;display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;background:color-mix(in srgb,var(--bg) 82%,transparent);backdrop-filter:blur(20px) saturate(180%);-webkit-backdrop-filter:blur(20px) saturate(180%);border-bottom:.5px solid var(--sep)}
nav a{flex:none;padding:5px 12px;border-radius:999px;font-size:13px;font-weight:500;color:var(--label);background:var(--fill)}
nav a:hover{text-decoration:none;background:color-mix(in srgb,var(--blue) 15%,transparent)}
section{margin-top:22px}h2{font-size:19px;margin:0 0 8px}
.box{background:var(--box);border-radius:12px;padding:14px 16px;box-shadow:0 0 0 .5px var(--sep)}
.box ul{margin:0;padding-left:20px}.box li+li{margin-top:4px}.box p{margin:0 0 8px}.box p:last-child{margin:0}
.kv{display:grid;grid-template-columns:110px 1fr;gap:6px 12px;margin:0}.kv dt{color:var(--label2)}.kv dd{margin:0}
.table{overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:14px}
th{text-align:left;font-weight:500;color:var(--label2);font-size:12px;padding:6px 10px;border-bottom:.5px solid var(--sep);white-space:nowrap}
td{padding:8px 10px;border-bottom:.5px solid var(--sep);vertical-align:top}td a{white-space:nowrap}tr:last-child td{border-bottom:0}
.sort{display:flex;gap:8px;align-items:center;margin-bottom:8px;font-size:13px;color:var(--label2)}
select{font:inherit;color:var(--label);background:var(--fill);border:0;border-radius:7px;padding:5px 8px}
.chips{display:flex;flex-wrap:wrap;gap:8px}.chip{padding:6px 12px;border-radius:999px;background:var(--fill);font-size:14px}
.empty{color:var(--label2)}
.route+.route,.route+.box{margin-top:10px}.route-head{display:flex;gap:8px;align-items:center;margin-bottom:8px}.tag2{padding:1px 8px;border-radius:6px;font-size:11px;font-weight:600;background:var(--fill);color:var(--label2)}
.map{width:100%;height:auto;margin-top:10px;display:block}.prof{width:100%;height:70px;margin-top:8px;display:block}.prof-note{font-size:12px;color:var(--label2)}.legend{margin:8px 0 0;padding-left:0;list-style:none;display:flex;flex-wrap:wrap;gap:4px 14px;font-size:13px;color:var(--label2);counter-reset:s}.legend li{counter-increment:s}.legend li::before{content:counter(s);display:inline-grid;place-items:center;width:18px;height:18px;margin-right:6px;border-radius:50%;background:var(--orange);color:#fff;font-size:11px;font-weight:700}
footer{margin-top:34px;text-align:center;font-size:12px;color:var(--label2)}
@media(max-width:560px){h1{font-size:25px}.kv{grid-template-columns:1fr}.kv dt{margin-top:6px}}
</style></head><body><div class="wrap">
<header><div class="eyebrow">Studio Manager · Briefing sự kiện<span class="tag">${esc({ draft: "NHÁP", live: "ĐANG DIỄN RA", done: "KẾT THÚC" }[ev.status])}</span></div>
<h1>${esc(ev.name)}</h1>
<div class="meta">${dates ? `<span>${esc(dates)}</span>` : ""}${ev.venue ? `<span>${esc(ev.venue)}</span>` : ""}${b?.teamLeader ? `<span>Trưởng nhóm: ${esc(b.teamLeader)}</span>` : ""}</div></header>
<nav aria-label="Mục lục">${sections.map(([id, l]) => `<a href="#${id}">${l}</a>`).join("")}</nav>

<section id="briefing"><h2>Briefing</h2>
${b && (b.startTime || b.endTime || b.participants) ? `<div class="box"><dl class="kv">${b.startTime ? `<dt>Bắt đầu</dt><dd>${esc(b.startTime)}</dd>` : ""}${b.endTime ? `<dt>Kết thúc</dt><dd>${esc(b.endTime)}</dd>` : ""}${b.participants ? `<dt>Số người tham gia</dt><dd>${esc(b.participants)}</dd>` : ""}</dl></div>` : ""}
${b && b.notes.length ? `<div class="box" style="margin-top:10px"><strong>Lưu ý quan trọng</strong>${list(b.notes)}</div>` : ""}
${b?.welcome ? `<div class="box" style="margin-top:10px"><p>${esc(b.welcome)}</p>${b.guidance.length ? `<strong>Những điều quan trọng nhất</strong>${list(b.guidance)}` : ""}</div>` : ""}
${!b ? `<p class="empty">Chưa có nội dung briefing.</p>` : ""}</section>

<section id="venue"><h2>Địa điểm</h2><div class="box">${b?.venueName || ev.venue ? `<p><strong>${esc(b?.venueName || ev.venue)}</strong></p>${b?.venueAddress ? `<p>${esc(b.venueAddress)}</p>` : ""}${b ? link(b.venueMaps, "Mở bản đồ") : ""}` : `<p class="empty">Chưa có địa điểm.</p>`}</div></section>

<section id="tactic"><h2>Phân công điểm chụp</h2>
<div class="sort">Sắp xếp<select id="sortBy" aria-label="Sắp xếp"><option value="spot">Tên điểm</option><option value="pg">Photographer</option><option value="arrival">Giờ đến</option></select></div>
<div class="box table"><table><thead><tr><th>Điểm</th><th>Photographer</th><th>Ống kính</th><th>Giờ đến</th><th>Vị trí</th><th>Ghi chú</th></tr></thead><tbody id="rows">${rows || `<tr><td colspan="6" class="empty">Chưa có điểm chụp.</td></tr>`}</tbody></table></div></section>

<section id="course"><h2>Lộ trình</h2>
${(b?.routes ?? []).map((r) => `<div class="box route"><div class="route-head"><strong>${esc(r.name)}</strong><span class="tag2">${esc(ROUTE_KIND[r.kind] ?? "")}</span></div><dl class="kv"><dt>Quãng đường</dt><dd>${r.distanceKm.toFixed(1)} km</dd>${r.ascentM || r.descentM ? `<dt>Leo / xuống</dt><dd>↑ ${r.ascentM} m · ↓ ${r.descentM} m</dd>` : ""}</dl>${routeSvg(r, spots)}<p><a download="${esc(r.name.replace(/[^\w\- ]+/g, "").trim() || "route")}.gpx" href="data:application/gpx+xml;base64,${b64(toGpx(r.name, r.points))}">Tải GPX</a></p></div>`).join("")}
<div class="box"${b?.routes?.length ? ' style="margin-top:10px"' : ""}>${b && b.course.length ? `<dl class="kv">${b.course.map((c) => `<dt>${esc(c.label)}</dt><dd>${esc(c.value)}</dd>`).join("")}</dl>` : b?.routes?.length ? `<p class="empty">Không có ghi chú thêm.</p>` : `<p class="empty">Chưa có thông tin lộ trình.</p>`}</div></section>

<section id="files"><h2>Tệp</h2><div class="box">${b && b.files.length ? `<ul>${b.files.map((f) => `<li>${f.data && DATA_OK.test(f.data) ? `<a download="${esc(f.name)}" href="${f.data}">${esc(f.name)}</a>` : link(f.url, f.name) || esc(f.name)}</li>`).join("")}</ul>` : `<p class="empty">Chưa có tệp đính kèm.</p>`}</div></section>

<section id="hotel"><h2>Khách sạn</h2><div class="box">${b && b.hotel.name ? `<p><strong>${esc(b.hotel.name)}</strong></p>${b.hotel.address ? `<p>${esc(b.hotel.address)}</p>` : ""}<dl class="kv">${b.hotel.phone ? `<dt>Điện thoại</dt><dd>${esc(b.hotel.phone)}</dd>` : ""}${b.hotel.checkIn ? `<dt>Nhận phòng</dt><dd>${esc(b.hotel.checkIn)}</dd>` : ""}${b.hotel.checkOut ? `<dt>Trả phòng</dt><dd>${esc(b.hotel.checkOut)}</dd>` : ""}${b.hotel.booking ? `<dt>Mã đặt phòng</dt><dd>${esc(b.hotel.booking)}</dd>` : ""}</dl>${link(b.hotel.maps, "Mở bản đồ")}${b.rooms.length ? `<table style="margin-top:10px"><thead><tr><th>Phòng</th><th>Người ở</th></tr></thead><tbody>${b.rooms.map((r) => `<tr><td>${esc(r.room)}</td><td>${esc(r.people)}</td></tr>`).join("")}</tbody></table>` : ""}` : `<p class="empty">Sự kiện này không có thông tin lưu trú.</p>`}</div></section>

<section id="team"><h2>Đội</h2><div class="box">${team.length ? `<div class="chips">${team.map((p) => `<span class="chip">${esc(p.name)}${p.phone ? ` · ${esc(p.phone)}` : ""}</span>`).join("")}</div>` : `<p class="empty">Chưa phân công photographer.</p>`}</div></section>

<footer>Studio Manager · Một sự kiện, một nguồn thông tin</footer>
</div>
<script>
(function(){var b=document.getElementById("rows"),s=document.getElementById("sortBy");if(!b||!s)return;
s.addEventListener("change",function(){var k=s.value==="pg"?"pg":s.value;var r=[].slice.call(b.querySelectorAll("tr[data-spot]"));
r.sort(function(x,y){return (x.dataset[k]||"").localeCompare(y.dataset[k]||"","vi")});r.forEach(function(t){b.appendChild(t)})})})();
</script></body></html>`;
}
