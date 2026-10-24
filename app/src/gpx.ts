// Reads a GPX file in the browser: distance, climb and a small set of points for drawing the route.
export interface RoutePoint { lat: number; lon: number; ele?: number }
export interface ParsedGpx { name: string; points: RoutePoint[]; distanceKm: number; ascentM: number; descentM: number; rawPoints: number }

const R = 6371000;
const rad = (d: number) => (d * Math.PI) / 180;
export function haversine(a: RoutePoint, b: RoutePoint): number {
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function parseGpx(text: string, fallbackName = "Lộ trình", maxPoints = 400): ParsedGpx {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("Tệp không phải GPX hợp lệ.");
  // Tracks first; routes and bare waypoints only when there is no track.
  let nodes = [...doc.getElementsByTagName("trkpt")];
  if (!nodes.length) nodes = [...doc.getElementsByTagName("rtept")];
  const pts: RoutePoint[] = [];
  for (const n of nodes) {
    const lat = parseFloat(n.getAttribute("lat") ?? ""), lon = parseFloat(n.getAttribute("lon") ?? "");
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    const e = parseFloat(n.getElementsByTagName("ele")[0]?.textContent ?? "");
    pts.push({ lat, lon, ele: Number.isFinite(e) ? e : undefined });
  }
  if (pts.length < 2) throw new Error("GPX không có đủ điểm đường đi (cần ít nhất 2).");

  let dist = 0, up = 0, down = 0;
  // Ignore elevation changes under 3 m so GPS noise does not inflate the climb.
  let ref = pts[0].ele;
  for (let i = 1; i < pts.length; i++) {
    dist += haversine(pts[i - 1], pts[i]);
    const e = pts[i].ele;
    if (e !== undefined && ref !== undefined && Math.abs(e - ref) >= 3) { if (e > ref) up += e - ref; else down += ref - e; ref = e; }
    else if (ref === undefined) ref = e;
  }
  const name = doc.getElementsByTagName("name")[0]?.textContent?.trim() || fallbackName;
  const step = Math.max(1, Math.ceil(pts.length / maxPoints));
  const small = pts.filter((_, i) => i % step === 0);
  if (small[small.length - 1] !== pts[pts.length - 1]) small.push(pts[pts.length - 1]);
  return { name, points: small.map((p) => ({ lat: +p.lat.toFixed(5), lon: +p.lon.toFixed(5), ele: p.ele === undefined ? undefined : Math.round(p.ele) })), distanceKm: dist / 1000, ascentM: Math.round(up), descentM: Math.round(down), rawPoints: pts.length };
}

const xml = (s: string) => s.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]!));
// A small GPX rebuilt from the kept points, so the briefing page can offer a download without carrying the original file.
export function toGpx(name: string, pts: RoutePoint[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Studio Manager" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>${xml(name)}</name><trkseg>` +
    pts.map((p) => `<trkpt lat="${p.lat}" lon="${p.lon}">${p.ele === undefined ? "" : `<ele>${p.ele}</ele>`}</trkpt>`).join("") + `</trkseg></trk></gpx>`;
}
