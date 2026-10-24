import { useState } from "react";
import { Field, Sheet } from "./Sheet";
import { briefHtml } from "../briefPage";
import { emptyBrief, opsActions, useOps, type Brief, type OpsEvent } from "../opsStore";

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
  const [files, setFiles] = useState(b0.files.map((f) => `${f.name} | ${f.url}`).join("\n"));
  const [rooms, setRooms] = useState(b0.rooms.map((r) => `${r.room}: ${r.people}`).join("\n"));
  const [preview, setPreview] = useState<string | null>(null);

  const build = (): Brief => ({
    ...b, notes: lines(notes), guidance: lines(guidance),
    course: pairs(course, ":").map(([label, value]) => ({ label, value })),
    files: pairs(files, "|").map(([name, url]) => ({ name, url })),
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
        <Field label="Tệp đính kèm (mỗi dòng dạng Tên | liên kết)"><textarea className="textarea" rows={2} value={files} onChange={(e) => setFiles(e.target.value)} placeholder="Lộ trình GPX | https://..." /></Field>
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
