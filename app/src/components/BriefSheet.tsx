import { useState } from "react";
import { Field, Sheet } from "./Sheet";
import { briefHtml } from "../briefPage";
import { emptyBrief, opsActions, ROUTE_KIND, useOps, type Brief, type OpsEvent, type RouteKind } from "../opsStore";
import { parseGpx } from "../gpx";
import { Icon } from "./Icon";
import { uid } from "../store";

const MAX_FILE = 1_000_000; // bytes per attachment; the app stores everything in the browser's local storage
const MAX_ALL = 3_000_000;
const OK_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp", "image/gif"];
const readAsDataUrl = (f: File) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsDataURL(f); });

const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);
const pairs = (s: string, sep: string) => lines(s).map((l) => { const i = l.indexOf(sep); return i < 0 ? [l, ""] : [l.slice(0, i).trim(), l.slice(i + 1).trim()]; });

// Edit what a photographer sees on the event briefing page, preview it, and download it as one HTML file.
export function BriefSheet({ event, onClose }: { event: OpsEvent; onClose: () => void }) {
  const o = useOps();
  const b0: Brief = { ...emptyBrief(), ...event.brief, hotel: { ...emptyBrief().hotel, ...event.brief?.hotel } };
  const [b, setB] = useState(b0);
  const [notes, setNotes] = useState(b0.notes.join("\n"));
  const [guidance, setGuidance] = useState(b0.guidance.join("\n"));
  const [course, setCourse] = useState(b0.course.map((c) => `${c.label}: ${c.value}`).join("\n"));
  const [files, setFiles] = useState(b0.files.filter((f) => !f.data).map((f) => `${f.name} | ${f.url}`).join("\n"));
  const [rooms, setRooms] = useState(b0.rooms.map((r) => `${r.room}: ${r.people}`).join("\n"));
  const [preview, setPreview] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  const addGpx = async (list: FileList | null) => {
    if (!list) return;
    for (const f of Array.from(list)) {
      try {
        const g = parseGpx(await f.text(), f.name.replace(/\.gpx$/i, ""));
        const lower = (g.name + " " + f.name).toLowerCase();
        const kind: RouteKind = /bike|cycl|ride|đạp|xe/.test(lower) ? "bike" : /run|chạy/.test(lower) ? "run" : /swim|bơi/.test(lower) ? "swim" : "other";
        setB((x) => ({ ...x, routes: [...x.routes, { id: uid(), name: g.name, kind, distanceKm: g.distanceKm, ascentM: g.ascentM, descentM: g.descentM, points: g.points }] }));
        setMsg(`Đã đọc ${f.name}: ${g.distanceKm.toFixed(1)} km, ${g.rawPoints.toLocaleString("vi-VN")} điểm.`);
      } catch (e) { setMsg(`${f.name}: ${(e as Error).message}`); }
    }
  };
  const addFiles = async (list: FileList | null) => {
    if (!list) return;
    let used = b.files.reduce((n, f) => n + (f.data?.length ?? 0), 0);
    for (const f of Array.from(list)) {
      if (!OK_TYPES.includes(f.type)) { setMsg(`${f.name}: chỉ nhận PDF hoặc ảnh (PNG, JPG, WebP).`); continue; }
      if (f.size > MAX_FILE) { setMsg(`${f.name} nặng ${(f.size / 1e6).toFixed(1)} MB, tối đa 1 MB. Dùng liên kết cho tệp lớn.`); continue; }
      const data = await readAsDataUrl(f);
      if (used + data.length > MAX_ALL) { setMsg("Tệp đính kèm đã đầy (3 MB). Xóa bớt hoặc dùng liên kết."); break; }
      used += data.length;
      setB((x) => ({ ...x, files: [...x.files, { name: f.name, url: "", data, size: f.size }] }));
      setMsg(`Đã đính kèm ${f.name}.`);
    }
  };

  const build = (): Brief => ({
    ...b, notes: lines(notes), guidance: lines(guidance),
    course: pairs(course, ":").map(([label, value]) => ({ label, value })),
    files: [...b.files.filter((f) => f.data), ...pairs(files, "|").map(([name, url]) => ({ name, url }))],
    rooms: pairs(rooms, ":").map(([room, people]) => ({ room, people })),
  });
  const html = () => briefHtml({ ...event, brief: build() }, o.spots.filter((s) => s.eventId === event.id), o.photographers);
  const save = () => { opsActions.updateEvent(event.id, { brief: build() }); onClose(); };
  const download = () => {
    const url = URL.createObjectURL(new Blob([html()], { type: "text/html;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `briefing-${event.id}.html`; a.click(); URL.revokeObjectURL(url);
  };
  const set = (patch: Partial<Brief>) => setB((x) => ({ ...x, ...patch }));
  const hotel = (patch: Partial<Brief["hotel"]>) => setB((x) => ({ ...x, hotel: { ...x.hotel, ...patch } }));

  return (
    <>
      <Sheet
        wide title="Trang briefing" onClose={onClose}
        footer={<><button className="btn ghost" onClick={onClose}>Hủy</button><button className="btn tinted" onClick={download}>Tải HTML</button><button className="btn tinted" onClick={() => setPreview(html())}>Xem trước</button><button className="btn primary sm" onClick={save}>Lưu</button></>}
      >
        <p className="f-hint">Photographer mở trang này trên điện thoại để nắm sự kiện. Phân công điểm chụp lấy từ danh sách Spot của sự kiện.</p>
        <div className="f-row">
          <Field label="Trưởng nhóm"><input className="input" value={b.teamLeader} onChange={(e) => set({ teamLeader: e.target.value })} /></Field>
          <Field label="Bắt đầu"><input className="input" value={b.startTime} onChange={(e) => set({ startTime: e.target.value })} placeholder="06:00" /></Field>
          <Field label="Kết thúc"><input className="input" value={b.endTime} onChange={(e) => set({ endTime: e.target.value })} placeholder="15:00" /></Field>
          <Field label="Số người tham gia"><input className="input" value={b.participants} onChange={(e) => set({ participants: e.target.value })} /></Field>
        </div>
        <Field label="Lưu ý quan trọng (mỗi dòng một ý)"><textarea className="textarea" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        <Field label="Lời chào"><textarea className="textarea" rows={2} value={b.welcome} onChange={(e) => set({ welcome: e.target.value })} /></Field>
        <Field label="Hướng dẫn chung (mỗi dòng một ý)"><textarea className="textarea" rows={3} value={guidance} onChange={(e) => setGuidance(e.target.value)} /></Field>
        <div className="f-row">
          <Field label="Tên địa điểm"><input className="input" value={b.venueName} onChange={(e) => set({ venueName: e.target.value })} /></Field>
          <Field label="Liên kết bản đồ"><input className="input" value={b.venueMaps} onChange={(e) => set({ venueMaps: e.target.value })} placeholder="https://maps.google.com/..." /></Field>
        </div>
        <Field label="Địa chỉ"><input className="input" value={b.venueAddress} onChange={(e) => set({ venueAddress: e.target.value })} /></Field>
        <Field label="Lộ trình (mỗi dòng dạng Nhãn: Giá trị)"><textarea className="textarea" rows={2} value={course} onChange={(e) => setCourse(e.target.value)} placeholder="Cự ly: 10 km" /></Field>
        <div className="f-field">
          <span className="f-label">Lộ trình GPX</span>
          {b.routes.map((r) => (
            <div key={r.id} className="route-row">
              <input className="input" value={r.name} aria-label="Tên lộ trình" onChange={(e) => setB((x) => ({ ...x, routes: x.routes.map((y) => (y.id === r.id ? { ...y, name: e.target.value } : y)) }))} />
              <select className="select" value={r.kind} aria-label="Loại" onChange={(e) => setB((x) => ({ ...x, routes: x.routes.map((y) => (y.id === r.id ? { ...y, kind: e.target.value as RouteKind } : y)) }))}>
                {(Object.keys(ROUTE_KIND) as RouteKind[]).map((k) => <option key={k} value={k}>{ROUTE_KIND[k]}</option>)}
              </select>
              <small>{r.distanceKm.toFixed(1)} km · ↑{r.ascentM} m</small>
              <button className="icon-mini" aria-label={`Xóa lộ trình ${r.name}`} onClick={() => setB((x) => ({ ...x, routes: x.routes.filter((y) => y.id !== r.id) }))}><Icon name="trash" size={15} /></button>
            </div>
          ))}
          <label className="btn tinted file-btn"><Icon name="upload" size={15} />Thêm GPX…<input type="file" accept=".gpx,application/gpx+xml,text/xml" multiple hidden onChange={(e) => { addGpx(e.target.files); e.target.value = ""; }} /></label>
          <small className="f-hint">App đọc quãng đường, độ cao và vẽ sơ đồ. Tệp lớn được rút gọn còn tối đa 400 điểm.</small>
        </div>
        <div className="f-field">
          <span className="f-label">Tệp đính kèm (PDF, ảnh)</span>
          {b.files.filter((f) => f.data).map((f, i) => (
            <div key={i} className="route-row"><Icon name="doc" size={15} /><span className="row-main">{f.name}</span><small>{Math.max(1, Math.round((f.size ?? 0) / 1000))} KB</small>
              <button className="icon-mini" aria-label={`Xóa tệp ${f.name}`} onClick={() => setB((x) => ({ ...x, files: x.files.filter((y) => y !== f) }))}><Icon name="trash" size={15} /></button></div>
          ))}
          <label className="btn tinted file-btn"><Icon name="upload" size={15} />Thêm tệp…<input type="file" accept="application/pdf,image/png,image/jpeg,image/webp,image/gif" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} /></label>
        </div>
        {msg ? <small className="f-hint" role="status">{msg}</small> : null}
        <Field label="Liên kết tệp khác (mỗi dòng dạng Tên | liên kết)"><textarea className="textarea" rows={2} value={files} onChange={(e) => setFiles(e.target.value)} placeholder="Lộ trình GPX | https://..." /></Field>
        <div className="f-row">
          <Field label="Khách sạn"><input className="input" value={b.hotel.name} onChange={(e) => hotel({ name: e.target.value })} /></Field>
          <Field label="Điện thoại"><input className="input" value={b.hotel.phone} onChange={(e) => hotel({ phone: e.target.value })} /></Field>
        </div>
        <Field label="Địa chỉ khách sạn"><input className="input" value={b.hotel.address} onChange={(e) => hotel({ address: e.target.value })} /></Field>
        <div className="f-row">
          <Field label="Nhận phòng"><input className="input" value={b.hotel.checkIn} onChange={(e) => hotel({ checkIn: e.target.value })} /></Field>
          <Field label="Trả phòng"><input className="input" value={b.hotel.checkOut} onChange={(e) => hotel({ checkOut: e.target.value })} /></Field>
          <Field label="Mã đặt phòng"><input className="input" value={b.hotel.booking} onChange={(e) => hotel({ booking: e.target.value })} /></Field>
        </div>
        <Field label="Phòng (mỗi dòng dạng Phòng: Người ở)"><textarea className="textarea" rows={2} value={rooms} onChange={(e) => setRooms(e.target.value)} /></Field>
        <p className="f-hint">Trang briefing có thể chứa thông tin riêng như mã đặt phòng. Chỉ chia sẻ liên kết cho đội của bạn.</p>
      </Sheet>
      {preview !== null ? (
        <Sheet wide title="Xem trước briefing" onClose={() => setPreview(null)}>
          <iframe title="Xem trước briefing" className="brief-frame" sandbox="allow-scripts" srcDoc={preview} />
        </Sheet>
      ) : null}
    </>
  );
}
