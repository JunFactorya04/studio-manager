import { useState } from "react";
import { Header } from "../components/Header";
import { Icon } from "../components/Icon";
import { Confirm, Field, Sheet } from "../components/Sheet";
import { BriefSheet } from "../components/BriefSheet";
import { fmtDate, today } from "../store";
import { pickFolder, isDesktop } from "../native";
import {
  EVENT_STATUS, SPOT_STATUS, opsActions, spotStats, useOps,
  type EventStatus, type OpsEvent, type Spot, type SpotStatus,
} from "../opsStore";
import type { Go, Route } from "../nav";

export function Events({ go, route }: { go: Go; route?: Route }) {
  const o = useOps();
  const [sel, setSel] = useState<string | null>(route?.eventId ?? o.events[0]?.id ?? null);
  const [q, setQ] = useState("");
  const [editEvent, setEditEvent] = useState<OpsEvent | "new" | null>(null);
  const [editSpot, setEditSpot] = useState<Spot | "new" | null>(null);
  const [delEvent, setDelEvent] = useState<OpsEvent | null>(null);
  const [delSpot, setDelSpot] = useState<Spot | null>(null);
  const [brief, setBrief] = useState(false);

  const query = q.trim().toLowerCase();
  const list = o.events.filter((e) => !query || (e.name + " " + e.venue).toLowerCase().includes(query)).sort((a, b) => b.date.localeCompare(a.date));
  const ev = o.events.find((e) => e.id === sel);
  const spots = ev ? o.spots.filter((s) => s.eventId === ev.id) : [];
  const evStats = ev ? spotStats(o, undefined, ev.id) : null;
  const pg = (id: string) => o.photographers.find((p) => p.id === id)?.name ?? "Chưa phân công";

  return (
    <div className="page ops-page">
      <Header
        title="Sự kiện & Spot"
        eyebrow={`${o.events.length} sự kiện · ${o.spots.length} điểm chụp`}
        search={{ value: q, onChange: setQ, placeholder: "Tìm sự kiện" }}
        actions={<button className="icon-btn primary" aria-label="Tạo sự kiện" onClick={() => setEditEvent("new")}><Icon name="plus" /></button>}
      />

      <div className="split ops-split">
        <div>
          <div className="card table-wrap desk-only">
            <table className="mtable">
              <thead><tr><th><span className="th">Sự kiện</span></th><th><span className="th">Ngày</span></th><th><span className="th">Trạng thái</span></th><th className="num"><span className="th">Spot</span></th><th className="num"><span className="th">Ảnh</span></th></tr></thead>
              <tbody>
                {list.map((e) => (
                  <tr key={e.id} className={e.id === sel ? "sel" : ""} tabIndex={0} onClick={() => setSel(e.id)} onKeyDown={(k) => { if (k.key === "Enter") setSel(e.id); }}>
                    <td><strong>{e.name}</strong><div className="muted small-line">{e.venue || "Chưa có địa điểm"}</div></td>
                    <td>{fmtDate(e.date)}{e.endDate !== e.date ? ` – ${fmtDate(e.endDate)}` : ""}</td>
                    <td><span className={"badge tone-" + EVENT_STATUS[e.status][1]}>{EVENT_STATUS[e.status][0]}</span></td>
                    <td className="num">{o.spots.filter((s) => s.eventId === e.id).length}</td>
                    <td className="num">{spotStats(o, undefined, e.id).total}</td>
                  </tr>
                ))}
                {list.length === 0 ? <tr><td colSpan={5} className="empty">Chưa có sự kiện nào.</td></tr> : null}
              </tbody>
            </table>
          </div>
          <div className="card list phone-only">
            {list.map((e) => (
              <button key={e.id} className={"row" + (e.id === sel ? " selected" : "")} onClick={() => setSel(e.id)}>
                <span className="row-main"><strong>{e.name}</strong><small>{fmtDate(e.date)} · {o.spots.filter((s) => s.eventId === e.id).length} spot</small></span>
                <span className={"badge tone-" + EVENT_STATUS[e.status][1]}>{EVENT_STATUS[e.status][0]}</span>
              </button>
            ))}
          </div>
        </div>

        <aside className="card inspector" aria-label="Chi tiết sự kiện">
          {ev && evStats ? (
            <div className="insp">
              <div className="insp-title">
                <strong>{ev.name}</strong>
                <span className={"badge tone-" + EVENT_STATUS[ev.status][1]}>{EVENT_STATUS[ev.status][0]}</span>
              </div>
              <dl className="insp-kv">
                <dt>Ngày</dt><dd>{fmtDate(ev.date)}{ev.endDate !== ev.date ? ` – ${fmtDate(ev.endDate)}` : ""}</dd>
                <dt>Địa điểm</dt><dd>{ev.venue || "—"}</dd>
                <dt>Ảnh</dt><dd>{evStats.total} · xong {evStats.succeeded} · lỗi {evStats.failed}</dd>
                <dt>Đã giao</dt><dd>{evStats.delivered}</dd>
                {ev.note ? <><dt>Ghi chú</dt><dd>{ev.note}</dd></> : null}
              </dl>
              <div className="insp-actions inline">
                <button className="btn tinted" onClick={() => setEditEvent(ev)}><Icon name="edit" />Sửa</button>
                <button className="btn tinted" onClick={() => setDelEvent(ev)}><Icon name="trash" />Xóa</button>
              </div>
              <button className="btn tinted" onClick={() => setBrief(true)}><Icon name="doc" />Trang briefing cho photographer</button>

              <div className="section-head"><h3 className="insp-h">Điểm chụp ({spots.length})</h3><button className="link" onClick={() => setEditSpot("new")}>+ Spot</button></div>
              {spots.length ? spots.map((s) => {
                const st = spotStats(o, s.id);
                return (
                  <div key={s.id} className="spot-card">
                    <div className="spot-top">
                      <strong>{s.name}</strong>
                      <span className={"badge tone-" + SPOT_STATUS[s.status][1]}>{SPOT_STATUS[s.status][0]}</span>
                    </div>
                    <small>{pg(s.photographerId)} · {st.total} ảnh{st.failed ? ` · ${st.failed} lỗi` : ""}</small>
                    <small className="path" title={s.captureDir}><Icon name="folder" size={12} /> {s.captureDir || "Chưa gán thư mục"}</small>
                    <small className="path" title={s.c1Session}><Icon name="camera" size={12} /> {s.c1Session || "Chưa gán session"}</small>
                    <div className="spot-actions">
                      <button className="link" onClick={() => setEditSpot(s)}>Sửa</button>
                      <button className="link danger-link" onClick={() => setDelSpot(s)}>Xóa</button>
                    </div>
                  </div>
                );
              }) : <p className="insp-note">Chưa có điểm chụp. Thêm Spot để gán thư mục ảnh và session Capture One.</p>}
              <button className="btn primary" onClick={() => go({ view: "ops" })}><Icon name="bolt" />Xem tổng quan vận hành</button>
            </div>
          ) : (
            <div className="empty-insp"><p className="insp-note">Chọn một sự kiện để xem điểm chụp.</p></div>
          )}
        </aside>
      </div>

      {brief && ev ? <BriefSheet event={ev} onClose={() => setBrief(false)} /> : null}
      {editEvent ? <EventForm event={editEvent === "new" ? undefined : editEvent} onClose={() => setEditEvent(null)} onSaved={(id) => setSel(id)} /> : null}
      {editSpot && ev ? <SpotForm eventId={ev.id} spot={editSpot === "new" ? undefined : editSpot} onClose={() => setEditSpot(null)} /> : null}
      {delEvent ? <Confirm title="Xóa sự kiện" text={`Xóa "${delEvent.name}" cùng các điểm chụp, job và lịch sử giao ảnh trong app? Ảnh trên ổ đĩa không bị xóa.`} confirmLabel="Xóa" onConfirm={() => { opsActions.deleteEvent(delEvent.id); setSel(o.events.find((e) => e.id !== delEvent.id)?.id ?? null); }} onClose={() => setDelEvent(null)} /> : null}
      {delSpot ? <Confirm title="Xóa điểm chụp" text={`Xóa "${delSpot.name}" và các job của điểm này? Ảnh trên ổ đĩa không bị xóa.`} confirmLabel="Xóa" onConfirm={() => opsActions.deleteSpot(delSpot.id)} onClose={() => setDelSpot(null)} /> : null}
    </div>
  );
}

function EventForm({ event, onClose, onSaved }: { event?: OpsEvent; onClose: () => void; onSaved: (id: string) => void }) {
  const [f, setF] = useState({ name: event?.name ?? "", date: event?.date ?? today(), endDate: event?.endDate ?? event?.date ?? today(), venue: event?.venue ?? "", status: (event?.status ?? "draft") as EventStatus, note: event?.note ?? "" });
  const [err, setErr] = useState("");
  const save = () => {
    if (!f.name.trim()) return setErr("Nhập tên sự kiện.");
    if (f.endDate < f.date) return setErr("Ngày kết thúc phải sau ngày bắt đầu.");
    if (event) { opsActions.updateEvent(event.id, { ...f, name: f.name.trim() }); onSaved(event.id); }
    else onSaved(opsActions.addEvent({ ...f, name: f.name.trim() }).id);
    onClose();
  };
  return (
    <Sheet title={event ? "Sửa sự kiện" : "Sự kiện mới"} onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>Hủy</button><button className="btn primary sm" onClick={save}>Lưu</button></>}>
      <Field label="Tên sự kiện" error={err}><input className="input" value={f.name} onChange={(e) => { setF({ ...f, name: e.target.value }); setErr(""); }} autoFocus /></Field>
      <div className="f-row">
        <Field label="Bắt đầu"><input className="input" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value, endDate: f.endDate < e.target.value ? e.target.value : f.endDate })} /></Field>
        <Field label="Kết thúc"><input className="input" type="date" value={f.endDate} min={f.date} onChange={(e) => setF({ ...f, endDate: e.target.value })} /></Field>
      </div>
      <Field label="Địa điểm"><input className="input" value={f.venue} onChange={(e) => setF({ ...f, venue: e.target.value })} /></Field>
      <Field label="Trạng thái">
        <select className="select" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as EventStatus })}>
          {(Object.keys(EVENT_STATUS) as EventStatus[]).map((s) => <option key={s} value={s}>{EVENT_STATUS[s][0]}</option>)}
        </select>
      </Field>
      <Field label="Ghi chú"><textarea className="textarea" rows={2} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
    </Sheet>
  );
}

function SpotForm({ eventId, spot, onClose }: { eventId: string; spot?: Spot; onClose: () => void }) {
  const o = useOps();
  const [f, setF] = useState({ name: spot?.name ?? "", captureDir: spot?.captureDir ?? "", outputDir: spot?.outputDir ?? "", c1Session: spot?.c1Session ?? "", recipe: spot?.recipe ?? "JPEG 2400px", photographerId: spot?.photographerId ?? "", status: (spot?.status ?? "idle") as SpotStatus, arrival: spot?.arrival ?? "", lens: spot?.lens ?? "", mapsUrl: spot?.mapsUrl ?? "", tip: spot?.tip ?? "" });
  const [err, setErr] = useState("");
  const browse = async (key: "captureDir" | "outputDir") => { const p = await pickFolder(key === "captureDir" ? "Thư mục nhận ảnh của điểm chụp" : "Thư mục ảnh đã xuất"); if (p) setF((x) => ({ ...x, [key]: p })); };
  const save = () => {
    if (!f.name.trim()) return setErr("Nhập tên điểm chụp.");
    if (spot) opsActions.updateSpot(spot.id, { ...f, name: f.name.trim() });
    else opsActions.addSpot({ ...f, name: f.name.trim(), eventId });
    onClose();
  };
  const dirField = (label: string, key: "captureDir" | "outputDir") => (
    <Field label={label}>
      <div className="f-row tight">
        <input className="input" value={f[key]} onChange={(e) => setF({ ...f, [key]: e.target.value })} placeholder="D:\Capture\Su-kien\Spot" />
        {isDesktop ? <button className="btn tinted" type="button" onClick={() => browse(key)}>Chọn…</button> : null}
      </div>
    </Field>
  );
  return (
    <Sheet title={spot ? "Sửa điểm chụp" : "Điểm chụp mới"} onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>Hủy</button><button className="btn primary sm" onClick={save}>Lưu</button></>}>
      <Field label="Tên điểm chụp" error={err}><input className="input" value={f.name} onChange={(e) => { setF({ ...f, name: e.target.value }); setErr(""); }} autoFocus /></Field>
      {dirField("Thư mục nhận ảnh (Capture)", "captureDir")}
      {dirField("Thư mục ảnh xuất (Output)", "outputDir")}
      <div className="f-row">
        <Field label="Session Capture One"><input className="input" value={f.c1Session} onChange={(e) => setF({ ...f, c1Session: e.target.value })} placeholder="Ten.cosessiondb" /></Field>
        <Field label="Recipe"><input className="input" value={f.recipe} onChange={(e) => setF({ ...f, recipe: e.target.value })} /></Field>
      </div>
      <div className="f-row">
        <Field label="Photographer">
          <select className="select" value={f.photographerId} onChange={(e) => setF({ ...f, photographerId: e.target.value })}>
            <option value="">Chưa phân công</option>
            {o.photographers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="Trạng thái">
          <select className="select" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as SpotStatus })}>
            {(Object.keys(SPOT_STATUS) as SpotStatus[]).map((s) => <option key={s} value={s}>{SPOT_STATUS[s][0]}</option>)}
          </select>
        </Field>
      </div>
      <div className="f-row">
        <Field label="Giờ đến"><input className="input" value={f.arrival} onChange={(e) => setF({ ...f, arrival: e.target.value })} placeholder="05:30" /></Field>
        <Field label="Ống kính"><input className="input" value={f.lens} onChange={(e) => setF({ ...f, lens: e.target.value })} placeholder="24-70 / 70-200" /></Field>
      </div>
      <Field label="Liên kết bản đồ điểm chụp"><input className="input" value={f.mapsUrl} onChange={(e) => setF({ ...f, mapsUrl: e.target.value })} placeholder="https://maps.google.com/..." /></Field>
      <Field label="Ghi chú cho photographer"><input className="input" value={f.tip} onChange={(e) => setF({ ...f, tip: e.target.value })} /></Field>
    </Sheet>
  );
}
