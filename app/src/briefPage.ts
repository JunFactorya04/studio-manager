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
const digits = (s: string) => s.replace(/[^\d+]/g, "");
const initials = (n: string) => n.trim().split(/\s+/).slice(-2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
const mapsOf = (s: Spot) => s.mapsUrl && safeUrl(s.mapsUrl) ? s.mapsUrl : typeof s.lat === "number" && typeof s.lon === "number" ? `https://maps.google.com/?q=${s.lat},${s.lon}` : "";
// All-day calendar entry so the shoot lands in the photographer's phone calendar.
function icsOf(ev: OpsEvent, where: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ev.date)) return "";
  const end = new Date((ev.endDate && /^\d{4}-\d{2}-\d{2}$/.test(ev.endDate) ? ev.endDate : ev.date) + "T00:00:00Z"); end.setUTCDate(end.getUTCDate() + 1);
  const t = (x: string) => x.replace(/\\/g, "\\\\").replace(/[,;]/g, (c) => "\\" + c).replace(/\n/g, "\\n");
  const body = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Studio Manager//Briefing//VI", "BEGIN:VEVENT", `UID:${ev.id}@studio-manager`, `DTSTAMP:${new Date().toISOString().replace(/[-:]|\.\d+/g, "")}`,
    `DTSTART;VALUE=DATE:${ev.date.replace(/-/g, "")}`, `DTEND;VALUE=DATE:${end.toISOString().slice(0, 10).replace(/-/g, "")}`, `SUMMARY:${t(ev.name)}`, where ? `LOCATION:${t(where)}` : "", "END:VEVENT", "END:VCALENDAR"].filter(Boolean).join("\r\n");
  return "data:text/calendar;charset=utf-8," + encodeURIComponent(body);
}

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
  const totalKm = routes.reduce((n, r) => n + r.distanceKm, 0);
  const ics = icsOf(ev, [where, b?.venueAddress].filter(Boolean).join(", "));

  const sections: [string, string, boolean][] = [
    ["briefing", "Briefing", true], ["schedule", "Lịch trình", true], ["venue", "Địa điểm", true], ["tactic", "Phân công", true], ["course", "Lộ trình", true],
    ["files", "Tệp", true], ["bestof", "Ảnh tham khảo", images.length > 0], ["hotel", "Khách sạn", true], ["team", "Đội", true],
  ];
  const list = (items: string[]) => (items.length ? `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>` : "");

  // Timeline of the day: start, each spot's arrival time, finish.
  const tl: { t: string; title: string; sub: string }[] = [];
  if (b?.startTime) tl.push({ t: b.startTime, title: "Xuất phát", sub: where || "" });
  spots.filter((s) => s.arrival).forEach((s) => tl.push({ t: s.arrival!, title: `Đến ${s.name}`, sub: [pg(s.photographerId)?.name, s.lens].filter(Boolean).join(" · ") }));
  if (b?.endTime) tl.push({ t: b.endTime, title: "Kết thúc", sub: "" });
  tl.sort((a, c) => a.t.localeCompare(c.t));

  const rows = spots.map((s) => {
    const p = pg(s.photographerId), m = mapsOf(s);
    return `<tr data-spot="${esc(s.name)}" data-pg="${esc(p?.name ?? "")}" data-arrival="${esc(s.arrival ?? "")}">
      <td data-l="Điểm"><strong>${esc(s.name)}</strong></td><td data-l="Photographer">${esc(p?.name ?? "—")}</td><td data-l="Ống kính">${esc(s.lens || "—")}</td><td data-l="Giờ đến">${esc(s.arrival || "—")}</td>
      <td data-l="Vị trí">${m ? link(m, "Chỉ đường") : "—"}</td><td data-l="Ghi chú">${esc(s.tip || "—")}</td></tr>`;
  }).join("");

  const stat = (v: string, l: string) => `<div class="stat"><b>${esc(v)}</b><span>${esc(l)}</span></div>`;
  const stats = [
    spots.length ? stat(String(spots.length), "điểm chụp") : "", team.length ? stat(String(team.length), "photographer") : "",
    routes.length ? stat(`${totalKm.toFixed(1)} km`, routes.length > 1 ? `${routes.length} lộ trình` : "lộ trình") : "", b?.participants ? stat(b.participants, "người tham gia") : "",
    b?.startTime ? stat(`${b.startTime}${b.endTime ? "–" + b.endTime : ""}`, "giờ chạy") : "",
  ].join("");

  return `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex"><meta name="theme-color" content="#0a3d91"><title>${esc(ev.name)} · Briefing</title>
<style>
:root{--bg:#f5f5f7;--box:#fff;--label:rgba(0,0,0,.88);--label2:rgba(0,0,0,.55);--sep:rgba(0,0,0,.1);--blue:#007aff;--green:#28cd41;--orange:#ff9500;--fill:rgba(0,0,0,.05);
--font:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI Variable Text","Segoe UI",system-ui,sans-serif}
@media(prefers-color-scheme:dark){:root{--bg:#161616;--box:#262628;--label:rgba(255,255,255,.88);--label2:rgba(255,255,255,.55);--sep:rgba(255,255,255,.12);--blue:#0a84ff;--fill:rgba(255,255,255,.07)}}
*{box-sizing:border-box}html{scroll-behavior:smooth;scroll-padding-top:60px}
body{margin:0;background:var(--bg);color:var(--label);font:15px/1.5 var(--font);-webkit-font-smoothing:antialiased}
a{color:var(--blue);text-decoration:none}a:hover{text-decoration:underline}
.wrap{max-width:900px;margin:0 auto;padding:0 16px 56px}
.hero{margin:0 -16px;padding:34px 16px 22px;color:#fff;background:linear-gradient(135deg,#0a3d91 0%,#1d6fe0 55%,#35a7ff 100%);position:relative;overflow:hidden}
.hero::after{content:"";position:absolute;right:-60px;top:-60px;width:260px;height:260px;border-radius:50%;background:rgba(255,255,255,.1)}
.hero-in{max-width:868px;margin:0 auto;position:relative;z-index:1}
.eyebrow{font-size:12px;opacity:.85;letter-spacing:.04em;text-transform:uppercase}
.tag{display:inline-block;margin-left:8px;padding:1px 8px;border-radius:6px;font-size:11px;font-weight:700;background:rgba(255,255,255,.22);color:#fff}
h1{font-size:34px;line-height:1.15;margin:8px 0 12px;letter-spacing:-.02em}
.meta{display:flex;flex-wrap:wrap;gap:4px 16px;font-size:14px;opacity:.95}
.count{display:inline-block;margin-top:12px;padding:4px 12px;border-radius:999px;background:rgba(255,255,255,.2);font-size:13px;font-weight:600}
.acts{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px}
.act{display:inline-flex;align-items:center;gap:6px;padding:8px 14px;border-radius:10px;background:#fff;color:#0a3d91;font-weight:600;font-size:14px}
.act:hover{text-decoration:none;opacity:.92}.act.ghost{background:rgba(255,255,255,.2);color:#fff}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin-top:16px}
.stat{background:var(--box);border-radius:12px;padding:12px 14px;box-shadow:0 0 0 .5px var(--sep)}.stat b{display:block;font-size:22px;letter-spacing:-.01em}.stat span{font-size:12px;color:var(--label2)}
nav{position:sticky;top:0;z-index:5;margin:14px -16px 0;padding:8px 16px;display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;background:color-mix(in srgb,var(--bg) 82%,transparent);backdrop-filter:blur(20px) saturate(180%);-webkit-backdrop-filter:blur(20px) saturate(180%);border-bottom:.5px solid var(--sep)}
nav a{flex:none;padding:5px 12px;border-radius:999px;font-size:13px;font-weight:500;color:var(--label);background:var(--fill)}
nav a.on{background:var(--blue);color:#fff}nav a:hover{text-decoration:none}
section{margin-top:26px}h2{font-size:20px;margin:0 0 10px;letter-spacing:-.01em}
.box{background:var(--box);border-radius:14px;padding:14px 16px;box-shadow:0 0 0 .5px var(--sep)}
.box+.box{margin-top:10px}
.box ul{margin:0;padding-left:20px}.box li+li{margin-top:4px}.box p{margin:0 0 8px}.box p:last-child{margin:0}
.warn{border-left:4px solid var(--orange)}
.chk{list-style:none;padding:0!important}.chk li{display:flex;gap:10px;align-items:flex-start}.chk input{margin-top:5px;width:18px;height:18px;flex:none;accent-color:var(--blue)}.chk label{flex:1}.chk input:checked+label{text-decoration:line-through;color:var(--label2)}
.prog{font-size:12px;color:var(--label2);margin-left:6px;font-weight:400}
.kv{display:grid;grid-template-columns:120px 1fr;gap:6px 12px;margin:0}.kv dt{color:var(--label2)}.kv dd{margin:0}
.tl{list-style:none;margin:0;padding:0}.tl li{display:grid;grid-template-columns:56px 14px 1fr;gap:10px;position:relative;padding-bottom:14px}.tl li:last-child{padding-bottom:0}
.tl time{font-variant-numeric:tabular-nums;font-weight:600;text-align:right}.tl i{width:10px;height:10px;border-radius:50%;background:var(--blue);margin-top:6px;position:relative;z-index:1}
.tl li::before{content:"";position:absolute;left:66px;top:12px;bottom:-6px;width:2px;background:var(--sep)}.tl li:last-child::before{display:none}.tl small{display:block;color:var(--label2)}
.table{overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:14px}
th{text-align:left;font-weight:500;color:var(--label2);font-size:12px;padding:6px 10px;border-bottom:.5px solid var(--sep);white-space:nowrap}
td{padding:8px 10px;border-bottom:.5px solid var(--sep);vertical-align:top}td a{white-space:nowrap}tr:last-child td{border-bottom:0}
tr.me{background:color-mix(in srgb,var(--blue) 12%,transparent)}
.tools{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center;margin-bottom:8px;font-size:13px;color:var(--label2)}
select{font:inherit;color:var(--label);background:var(--fill);border:0;border-radius:7px;padding:5px 8px}
.chips{display:flex;flex-wrap:wrap;gap:8px}.chip{padding:6px 12px;border-radius:999px;background:var(--fill);font-size:14px}
.people{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:10px}
.person{display:flex;gap:12px;align-items:center;background:var(--box);border-radius:14px;padding:12px 14px;box-shadow:0 0 0 .5px var(--sep)}
.av{flex:none;width:42px;height:42px;border-radius:50%;display:grid;place-items:center;background:linear-gradient(135deg,#1d6fe0,#35a7ff);color:#fff;font-weight:700}
.person small{display:block;color:var(--label2)}
.empty{color:var(--label2)}
.route-head{display:flex;gap:8px;align-items:center;margin-bottom:8px}.tag2{padding:1px 8px;border-radius:6px;font-size:11px;font-weight:600;background:var(--fill);color:var(--label2)}
.map{width:100%;height:auto;margin-top:10px;display:block}.prof{width:100%;height:70px;margin-top:8px;display:block}.prof-note{font-size:12px;color:var(--label2)}.legend{margin:8px 0 0;padding-left:0;list-style:none;display:flex;flex-wrap:wrap;gap:4px 14px;font-size:13px;color:var(--label2);counter-reset:s}.legend li{counter-increment:s}.legend li::before{content:counter(s);display:inline-grid;place-items:center;width:18px;height:18px;margin-right:6px;border-radius:50%;background:var(--orange);color:#fff;font-size:11px;font-weight:700}
.files{list-style:none;padding:0!important}.files li{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:.5px solid var(--sep)}.files li:last-child{border-bottom:0}.files .ic{flex:none;width:34px;height:34px;border-radius:8px;display:grid;place-items:center;background:var(--fill);font-size:11px;font-weight:700;color:var(--label2)}.files .nm{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gal{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}.gal a{display:block;border-radius:10px;overflow:hidden;aspect-ratio:4/3;background:var(--fill)}.gal img{width:100%;height:100%;object-fit:cover;display:block}
.lnk{display:flex;flex-wrap:wrap;gap:8px}.lnk a{padding:8px 14px;border-radius:10px;background:var(--fill);color:var(--label);font-weight:500}
footer{margin-top:34px;text-align:center;font-size:12px;color:var(--label2)}
@media(max-width:560px){h1{font-size:27px}.kv{grid-template-columns:1fr}.kv dt{margin-top:6px}
.tbl thead{display:none}.tbl,.tbl tbody,.tbl tr,.tbl td{display:block}.tbl tr{padding:10px 4px;border-bottom:.5px solid var(--sep)}.tbl tr:last-child{border-bottom:0}.tbl td{border:0;padding:2px 6px;display:flex;gap:10px}.tbl td::before{content:attr(data-l);flex:none;width:92px;color:var(--label2);font-size:12px;padding-top:2px}}
@media print{.hero{background:#0a3d91!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}nav,.acts,.tools{display:none}section{break-inside:avoid}}
</style></head><body><div class="wrap" data-id="${esc(ev.id)}" data-date="${esc(ev.date)}" data-end="${esc(ev.endDate || ev.date)}">
<div class="hero"><div class="hero-in">
<div class="eyebrow">Studio Manager · Briefing sự kiện<span class="tag">${esc({ draft: "NHÁP", live: "ĐANG DIỄN RA", done: "KẾT THÚC" }[ev.status])}</span></div>
<h1>${esc(ev.name)}</h1>
<div class="meta">${dates ? `<span>📅 ${esc(dates)}</span>` : ""}${where ? `<span>📍 ${esc(where)}</span>` : ""}${b?.teamLeader ? `<span>👤 Trưởng nhóm: ${esc(b.teamLeader)}</span>` : ""}</div>
<div id="count" class="count" hidden></div>
<div class="acts">
${b && safeUrl(b.venueMaps) ? `<a class="act" href="${safeUrl(b.venueMaps)}" target="_blank" rel="noopener">Chỉ đường đến địa điểm</a>` : ""}
${channels.slice(0, 3).map((c) => `<a class="act ghost" href="${safeUrl(c.url)}" target="_blank" rel="noopener">${esc(c.name)}</a>`).join("")}
${leader?.phone ? `<a class="act ghost" href="tel:${esc(digits(leader.phone))}">Gọi trưởng nhóm</a>` : ""}
${ics ? `<a class="act ghost" download="${esc(ev.name.replace(/[^\w\- ]+/g, "").trim() || "event")}.ics" href="${ics}">Thêm vào lịch</a>` : ""}
<a class="act ghost" href="#" onclick="window.print();return false">In / lưu PDF</a>
</div></div></div>
${stats ? `<div class="stats">${stats}</div>` : ""}
<nav aria-label="Mục lục">${sections.filter((x) => x[2]).map(([id, l]) => `<a href="#${id}">${l}</a>`).join("")}</nav>

<section id="briefing"><h2>Briefing</h2>
${b && (b.startTime || b.endTime || b.participants) ? `<div class="box"><dl class="kv">${b.startTime ? `<dt>Bắt đầu</dt><dd>${esc(b.startTime)}</dd>` : ""}${b.endTime ? `<dt>Kết thúc</dt><dd>${esc(b.endTime)}</dd>` : ""}${b.participants ? `<dt>Số người tham gia</dt><dd>${esc(b.participants)}</dd>` : ""}</dl></div>` : ""}
${b && b.notes.length ? `<div class="box warn"><strong>Lưu ý quan trọng</strong>${list(b.notes)}</div>` : ""}
${b?.welcome ? `<div class="box"><p>${esc(b.welcome)}</p></div>` : ""}
${b && b.guidance.length ? `<div class="box"><strong>Danh sách chuẩn bị<span class="prog" id="prog"></span></strong><ul class="chk" id="chk">${b.guidance.map((g, i) => `<li><input type="checkbox" id="g${i}" data-i="${i}"><label for="g${i}">${esc(g)}</label></li>`).join("")}</ul></div>` : ""}
${channels.length ? `<div class="box"><strong>Kênh liên lạc</strong><div class="lnk" style="margin-top:8px">${channels.map((c) => `<a href="${safeUrl(c.url)}" target="_blank" rel="noopener">${esc(c.name)}</a>`).join("")}</div></div>` : ""}
${!b ? `<p class="empty">Chưa có nội dung briefing.</p>` : ""}</section>

<section id="schedule"><h2>Lịch trình trong ngày</h2><div class="box">${tl.length >= 2 ? `<ol class="tl">${tl.map((x) => `<li><time>${esc(x.t)}</time><i></i><div><strong>${esc(x.title)}</strong>${x.sub ? `<small>${esc(x.sub)}</small>` : ""}</div></li>`).join("")}</ol>` : `<p class="empty">Chưa có giờ giấc. Nhập giờ bắt đầu, kết thúc và giờ đến của từng điểm chụp.</p>`}</div></section>

<section id="venue"><h2>Địa điểm</h2><div class="box">${where ? `<p><strong>${esc(where)}</strong></p>${b?.venueAddress ? `<p>${esc(b.venueAddress)}</p>` : ""}${b ? link(b.venueMaps, "Mở bản đồ") : ""}` : `<p class="empty">Chưa có địa điểm.</p>`}</div></section>

<section id="tactic"><h2>Phân công điểm chụp</h2>
<div class="tools"><label>Sắp xếp <select id="sortBy" aria-label="Sắp xếp"><option value="spot">Tên điểm</option><option value="pg">Photographer</option><option value="arrival">Giờ đến</option></select></label>
${team.length ? `<label>Tôi là <select id="me" aria-label="Tôi là"><option value="">— chọn tên —</option>${team.map((p) => `<option>${esc(p.name)}</option>`).join("")}</select></label>` : ""}</div>
<div class="box table"><table class="tbl"><thead><tr><th>Điểm</th><th>Photographer</th><th>Ống kính</th><th>Giờ đến</th><th>Vị trí</th><th>Ghi chú</th></tr></thead><tbody id="rows">${rows || `<tr><td colspan="6" class="empty">Chưa có điểm chụp.</td></tr>`}</tbody></table></div></section>

<section id="course"><h2>Lộ trình</h2>
${routes.map((r) => `<div class="box"><div class="route-head"><strong>${esc(r.name)}</strong><span class="tag2">${esc(ROUTE_KIND[r.kind] ?? "")}</span></div><dl class="kv"><dt>Quãng đường</dt><dd>${r.distanceKm.toFixed(1)} km</dd>${r.ascentM || r.descentM ? `<dt>Leo / xuống</dt><dd>↑ ${r.ascentM} m · ↓ ${r.descentM} m</dd>` : ""}</dl>${routeSvg(r, spots)}<p style="margin-top:8px"><a download="${esc(r.name.replace(/[^\w\- ]+/g, "").trim() || "route")}.gpx" href="data:application/gpx+xml;base64,${b64(toGpx(r.name, r.points))}">Tải GPX</a>${r.points.length ? ` · ${link(`https://maps.google.com/?q=${r.points[0].lat},${r.points[0].lon}`, "Mở điểm xuất phát")}` : ""}</p></div>`).join("")}
<div class="box">${b && b.course.length ? `<dl class="kv">${b.course.map((c) => `<dt>${esc(c.label)}</dt><dd>${esc(c.value)}</dd>`).join("")}</dl>` : routes.length ? `<p class="empty">Không có ghi chú thêm.</p>` : `<p class="empty">Chưa có thông tin lộ trình.</p>`}</div></section>

<section id="files"><h2>Tệp</h2><div class="box">${docs.length ? `<ul class="files">${docs.map((f) => {
    const ext = (f.data?.match(/^data:(?:application|image)\/([a-z+]+)/)?.[1] ?? f.name.split(".").pop() ?? "").slice(0, 4).toUpperCase();
    const a = f.data ? `<a download="${esc(f.name)}" href="${f.data}">Tải</a>` : link(f.url, "Mở");
    return `<li><span class="ic">${esc(ext || "FILE")}</span><span class="nm">${esc(f.name)}</span>${a}</li>`;
  }).join("")}</ul>` : `<p class="empty">Chưa có tệp đính kèm.</p>`}</div></section>

${images.length ? `<section id="bestof"><h2>Ảnh tham khảo <span class="prog">${images.length} ảnh</span></h2><div class="gal">${images.map((f) => `<a download="${esc(f.name)}" href="${f.data}" title="${esc(f.name)}"><img src="${f.data}" alt="${esc(f.name)}" loading="lazy"></a>`).join("")}</div></section>` : ""}

<section id="hotel"><h2>Khách sạn</h2><div class="box">${b && b.hotel.name ? `<p><strong>${esc(b.hotel.name)}</strong></p>${b.hotel.address ? `<p>${esc(b.hotel.address)}</p>` : ""}<dl class="kv">${b.hotel.phone ? `<dt>Điện thoại</dt><dd><a href="tel:${esc(digits(b.hotel.phone))}">${esc(b.hotel.phone)}</a></dd>` : ""}${b.hotel.checkIn ? `<dt>Nhận phòng</dt><dd>${esc(b.hotel.checkIn)}</dd>` : ""}${b.hotel.checkOut ? `<dt>Trả phòng</dt><dd>${esc(b.hotel.checkOut)}</dd>` : ""}${b.hotel.booking ? `<dt>Mã đặt phòng</dt><dd>${esc(b.hotel.booking)}</dd>` : ""}</dl><p style="margin-top:8px">${link(b.hotel.maps, "Mở bản đồ")}</p>${b.rooms.length ? `<table style="margin-top:10px"><thead><tr><th>Phòng</th><th>Người ở</th></tr></thead><tbody>${b.rooms.map((r) => `<tr><td>${esc(r.room)}</td><td>${esc(r.people)}</td></tr>`).join("")}</tbody></table>` : ""}` : `<p class="empty">Sự kiện này không có thông tin lưu trú.</p>`}</div></section>

<section id="team"><h2>Đội</h2>${team.length ? `<div class="people">${team.map((p) => {
    const mine = spots.filter((s) => s.photographerId === p.id);
    return `<div class="person"><span class="av">${esc(initials(p.name))}</span><div><strong>${esc(p.name)}</strong>${p.phone ? `<small><a href="tel:${esc(digits(p.phone))}">${esc(p.phone)}</a></small>` : ""}<small>${mine.length} điểm: ${esc(mine.map((s) => s.name).join(", "))}</small></div></div>`;
  }).join("")}</div>` : `<div class="box"><p class="empty">Chưa phân công photographer.</p></div>`}</section>

<footer>Studio Manager · Một sự kiện, một nguồn thông tin</footer>
</div>
<script>
(function(){
var w=document.querySelector(".wrap"),id=w.dataset.id;
function g(k){try{return localStorage.getItem(k)}catch(e){return null}}function s(k,v){try{localStorage.setItem(k,v)}catch(e){}}
// Countdown to the first day (Asia/Taipei is not assumed: uses the viewer's local date).
var c=document.getElementById("count"),d=w.dataset.date;
if(c&&/^\\d{4}-\\d{2}-\\d{2}$/.test(d)){var t=new Date(),a=new Date(t.getFullYear(),t.getMonth(),t.getDate()),p=d.split("-"),b=new Date(+p[0],+p[1]-1,+p[2]),n=Math.round((b-a)/864e5);
c.textContent=n>0?"Còn "+n+" ngày":n===0?"Hôm nay là ngày thi đấu":"Đã diễn ra "+(-n)+" ngày trước";c.hidden=false}
// Sort + "I am" highlight.
var body=document.getElementById("rows"),sort=document.getElementById("sortBy"),me=document.getElementById("me");
function rows(){return body?[].slice.call(body.querySelectorAll("tr[data-spot]")):[]}
function mark(){var m=me?me.value:"";rows().forEach(function(r){r.classList.toggle("me",!!m&&r.dataset.pg===m)})}
if(sort)sort.addEventListener("change",function(){var k=sort.value;rows().sort(function(x,y){return (x.dataset[k]||"").localeCompare(y.dataset[k]||"","vi")}).forEach(function(t){body.appendChild(t)})});
if(me){me.value=g("sm-me-"+id)||"";if(me.value!==(g("sm-me-"+id)||""))me.value="";mark();me.addEventListener("change",function(){s("sm-me-"+id,me.value);mark()})}
// Checklist remembered on this device.
var chk=document.getElementById("chk"),pr=document.getElementById("prog");
if(chk){var saved={};try{saved=JSON.parse(g("sm-chk-"+id)||"{}")}catch(e){}
var boxes=[].slice.call(chk.querySelectorAll("input"));
function upd(){var n=boxes.filter(function(x){return x.checked}).length;pr.textContent=" "+n+"/"+boxes.length}
boxes.forEach(function(x){x.checked=!!saved[x.dataset.i];x.addEventListener("change",function(){saved[x.dataset.i]=x.checked;s("sm-chk-"+id,JSON.stringify(saved));upd()})});upd()}
// Highlight the section in view.
var links=[].slice.call(document.querySelectorAll("nav a"));
if("IntersectionObserver"in window){var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){links.forEach(function(l){l.classList.toggle("on",l.getAttribute("href")==="#"+e.target.id)})}})},{rootMargin:"-40% 0px -55% 0px"});
links.forEach(function(l){var t=document.querySelector(l.getAttribute("href"));if(t)io.observe(t)})}
})();
</script></body></html>`;
}
