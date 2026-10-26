import { useState } from "react";
import { Header } from "../components/Header";
import { Confirm, Field, Sheet } from "../components/Sheet";
import { actions, today } from "../store";
import { BOOKING_STATUS, defaultEngine, opsActions, spotStats, useOps, type Booking, type LogKind, type Photographer } from "../opsStore";
import type { Go } from "../nav";

export function downloadCsv(name: string, rows: (string | number)[][]) {
  const cell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const text = "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n"); // BOM so Excel reads Vietnamese correctly
  const u = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a"); a.href = u; a.download = name; a.click(); URL.revokeObjectURL(u);
}

// ---------- 08 protected / marketing photos ----------
export function Selects() {
  const o = useOps();
  const target = o.engine?.keepTarget ?? 20;
  const kept = o.jobs.filter((j) => j.keep);
  const rows = o.spots.map((s) => ({ s, ev: o.events.find((e) => e.id === s.eventId), lock: kept.filter((j) => j.spotId === s.id && j.keep === "lock").length, mk: kept.filter((j) => j.spotId === s.id && j.keep === "marketing").length })).filter((r) => r.lock || r.mk || r.ev?.status === "live");
  return (
    <div className="page ops-page">
      <Header title="Ảnh chọn lọc" eyebrow={`${kept.length} ảnh được giữ`} actions={kept.length ? <button className="btn tinted sm" onClick={() => downloadCsv(`anh-chon-loc-${today()}.csv`, [["Tên file", "Điểm chụp", "Sự kiện", "Loại", "Đường dẫn"], ...kept.map((j) => [j.file, o.spots.find((s) => s.id === j.spotId)?.name ?? "", o.events.find((e) => e.id === j.eventId)?.name ?? "", j.keep === "lock" ? "Khóa" : "Marketing", j.output ?? ""])])}>Tải CSV</button> : undefined} />
      <p className="f-hint">Đánh dấu ảnh đẹp ngay trong màn hình Xử lý ảnh (nút "Khóa ảnh": bấm một lần để khóa, hai lần để đánh dấu marketing). Ảnh đã khóa không bị xóa khi dọn hàng đợi. Mục tiêu mỗi điểm chụp: {target} ảnh khóa.</p>
      <div className="card list">
        {rows.map(({ s, ev, lock, mk }) => (
          <div key={s.id} className="row">
            <span className="row-main"><strong>{s.name} <small>· {ev?.name}</small></strong><small>{lock}/{target} ảnh khóa · {mk} ảnh marketing</small><span className="mini-meter wide"><span style={{ width: Math.min(100, (lock / target) * 100) + "%" }} /></span></span>
            <span className={"badge tone-" + (lock >= target ? "green" : "gray")}>{lock >= target ? "Đủ" : `Thiếu ${target - lock}`}</span>
          </div>
        ))}
        {rows.length === 0 ? <p className="empty">Chưa có điểm chụp nào cần theo dõi.</p> : null}
      </div>
      {kept.length ? (
        <div className="card list">
          {kept.map((j) => (
            <div key={j.id} className="row">
              <span className="row-main"><strong>{j.file}</strong><small>{o.spots.find((s) => s.id === j.spotId)?.name}</small></span>
              <span className={"badge tone-" + (j.keep === "lock" ? "orange" : "purple")}>{j.keep === "lock" ? "Khóa" : "Marketing"}</span>
              <button className="chip-btn" onClick={() => opsActions.setJobKeep(j.id, undefined)}>Bỏ</button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ---------- 09 bookings ----------
export function Bookings({ go }: { go: Go }) {
  const o = useOps();
  const list = o.bookings ?? [];
  const [edit, setEdit] = useState<Booking | "new" | null>(null);
  const convert = (b: Booking) => {
    const c = actions.addClient({ name: b.name, phone: /@/.test(b.contact) ? "" : b.contact, email: /@/.test(b.contact) ? b.contact : "", channel: /@/.test(b.contact) ? "email" : "line", note: "Từ booking" });
    const pr = actions.addProject({ name: `${b.type || "Chụp ảnh"} · ${b.name}`, clientId: c.id, type: b.type || "Khác", date: b.date || today(), time: b.time || "09:00", durationH: 2, location: "", stage: "quote", deadline: b.date || today(), pkgName: "", pkgPhotos: 20, photographers: "", nasPath: "", total: 0, note: b.note });
    opsActions.updateBooking(b.id, { status: "confirmed", projectId: pr.id });
    go({ view: "projects", projectId: pr.id });
  };
  return (
    <div className="page ops-page">
      <Header title="Booking" eyebrow={`${list.filter((b) => b.status === "new").length} yêu cầu mới`} actions={<button className="btn primary sm" onClick={() => setEdit("new")}>Thêm booking</button>} />
      <p className="f-hint">Ghi nhận yêu cầu đặt lịch (qua LINE, điện thoại, email). Bấm "Tạo dự án" để chuyển thành khách và dự án ở bước báo giá. Form đặt lịch công khai cho khách cần máy chủ, sẽ làm sau.</p>
      <div className="card list">
        {list.map((b) => (
          <div key={b.id} className="row">
            <span className="row-main"><strong>{b.name} <small>· {b.type}</small></strong><small>{b.date} {b.time} · {b.contact}</small>{b.note ? <small>{b.note}</small> : null}</span>
            <span className={"badge tone-" + BOOKING_STATUS[b.status][1]}>{BOOKING_STATUS[b.status][0]}</span>
            {b.projectId ? <button className="chip-btn" onClick={() => go({ view: "projects", projectId: b.projectId })}>Mở dự án</button> : b.status === "new" ? <button className="chip-btn" onClick={() => convert(b)}>Tạo dự án</button> : null}
            {b.status === "new" ? <button className="chip-btn" onClick={() => opsActions.updateBooking(b.id, { status: "declined" })}>Từ chối</button> : null}
            <button className="chip-btn" onClick={() => setEdit(b)}>Sửa</button>
          </div>
        ))}
        {list.length === 0 ? <p className="empty">Chưa có booking nào.</p> : null}
      </div>
      {edit ? <BookingForm b={edit === "new" ? undefined : edit} onClose={() => setEdit(null)} /> : null}
    </div>
  );
}
function BookingForm({ b, onClose }: { b?: Booking; onClose: () => void }) {
  const [f, setF] = useState({ name: b?.name ?? "", contact: b?.contact ?? "", date: b?.date ?? today(), time: b?.time ?? "09:00", type: b?.type ?? "", note: b?.note ?? "" });
  const [err, setErr] = useState("");
  const save = () => {
    if (!f.name.trim()) return setErr("Nhập tên khách.");
    if (b) opsActions.updateBooking(b.id, { ...f, name: f.name.trim() }); else opsActions.addBooking({ ...f, name: f.name.trim(), status: "new" });
    onClose();
  };
  return (
    <Sheet title={b ? "Sửa booking" : "Booking mới"} onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>Hủy</button><button className="btn primary sm" onClick={save}>Lưu</button></>}>
      <Field label="Tên khách" error={err}><input className="input" value={f.name} onChange={(e) => { setF({ ...f, name: e.target.value }); setErr(""); }} autoFocus /></Field>
      <Field label="Liên hệ (điện thoại hoặc email)"><input className="input" value={f.contact} onChange={(e) => setF({ ...f, contact: e.target.value })} /></Field>
      <div className="f-row">
        <Field label="Ngày"><input className="input" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        <Field label="Giờ"><input className="input" type="time" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} /></Field>
      </div>
      <Field label="Loại chụp"><input className="input" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} placeholder="Gia đình, sự kiện, sản phẩm…" /></Field>
      <Field label="Ghi chú"><textarea className="textarea" rows={2} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
    </Sheet>
  );
}

// ---------- 10 photographers ----------
export function Crew() {
  const o = useOps();
  const [edit, setEdit] = useState<Photographer | "new" | null>(null);
  const [del, setDel] = useState<Photographer | null>(null);
  return (
    <div className="page ops-page">
      <Header title="Photographer" eyebrow={`${o.photographers.length} người`} actions={<button className="btn primary sm" onClick={() => setEdit("new")}>Thêm</button>} />
      <div className="card list">
        {o.photographers.map((p) => {
          const spots = o.spots.filter((s) => s.photographerId === p.id);
          const st = spots.reduce((n, s) => n + spotStats(o, s.id).total, 0);
          return (
            <div key={p.id} className="row">
              <span className="row-main"><strong>{p.name}</strong><small>{[p.phone, p.email].filter(Boolean).join(" · ") || "—"}{p.note ? ` · ${p.note}` : ""}</small><small>{spots.length} điểm chụp · {st} ảnh{spots.length ? ` (${spots.map((s) => s.name).join(", ")})` : ""}</small></span>
              <button className="chip-btn" onClick={() => setEdit(p)}>Sửa</button>
              <button className="chip-btn danger" onClick={() => setDel(p)}>Xóa</button>
            </div>
          );
        })}
        {o.photographers.length === 0 ? <p className="empty">Chưa có photographer.</p> : null}
      </div>
      {edit ? <CrewForm p={edit === "new" ? undefined : edit} onClose={() => setEdit(null)} /> : null}
      {del ? <Confirm title="Xóa photographer" text={`Xóa "${del.name}"? Các điểm chụp của người này sẽ chuyển về chưa phân công.`} confirmLabel="Xóa" onConfirm={() => opsActions.deletePhotographer(del.id)} onClose={() => setDel(null)} /> : null}
    </div>
  );
}
function CrewForm({ p, onClose }: { p?: Photographer; onClose: () => void }) {
  const [f, setF] = useState({ name: p?.name ?? "", phone: p?.phone ?? "", email: p?.email ?? "", note: p?.note ?? "" });
  const [err, setErr] = useState("");
  const save = () => {
    if (!f.name.trim()) return setErr("Nhập tên.");
    if (p) opsActions.updatePhotographer(p.id, { ...f, name: f.name.trim() }); else opsActions.addPhotographer({ ...f, name: f.name.trim() });
    onClose();
  };
  return (
    <Sheet title={p ? "Sửa photographer" : "Thêm photographer"} onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>Hủy</button><button className="btn primary sm" onClick={save}>Lưu</button></>}>
      <Field label="Tên" error={err}><input className="input" value={f.name} onChange={(e) => { setF({ ...f, name: e.target.value }); setErr(""); }} autoFocus /></Field>
      <Field label="Điện thoại"><input className="input" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
      <Field label="Email"><input className="input" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
      <Field label="Ghi chú"><input className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
    </Sheet>
  );
}

// ---------- 11 reports ----------
export function Reports() {
  const o = useOps();
  const rows = o.events.map((e) => {
    const st = spotStats(o, undefined, e.id);
    const spots = o.spots.filter((s) => s.eventId === e.id).length;
    return { e, st, spots, rate: st.total ? Math.round((st.succeeded / st.total) * 100) : 0 };
  });
  const byPh = o.photographers.map((p) => {
    const ids = o.spots.filter((s) => s.photographerId === p.id).map((s) => s.id);
    const jobs = o.jobs.filter((j) => ids.includes(j.spotId));
    return { p, spots: ids.length, total: jobs.length, ok: jobs.filter((j) => j.status === "succeeded").length, kept: jobs.filter((j) => j.keep).length };
  });
  const csv = () => downloadCsv(`bao-cao-van-hanh-${today()}.csv`, [
    ["Sự kiện", "Ngày", "Điểm chụp", "Tổng ảnh", "Thành công", "Lỗi", "Đã giao", "Giao lỗi", "% hoàn thành"],
    ...rows.map((r) => [r.e.name, r.e.date, r.spots, r.st.total, r.st.succeeded, r.st.failed, r.st.delivered, r.st.deliveryFailed, r.rate]),
    [], ["Photographer", "Điểm chụp", "Tổng ảnh", "Thành công", "Ảnh chọn lọc"],
    ...byPh.map((r) => [r.p.name, r.spots, r.total, r.ok, r.kept]),
  ]);
  return (
    <div className="page ops-page">
      <Header title="Báo cáo" eyebrow="Theo sự kiện và photographer" actions={<button className="btn tinted sm" onClick={csv}>Tải CSV</button>} />
      <div className="card table-wrap">
        <table className="mtable">
          <thead><tr><th><span className="th">Sự kiện</span></th><th className="num"><span className="th">Điểm</span></th><th className="num"><span className="th">Ảnh</span></th><th className="num"><span className="th">Xong</span></th><th className="num"><span className="th">Lỗi</span></th><th className="num"><span className="th">Đã giao</span></th><th className="num"><span className="th">%</span></th></tr></thead>
          <tbody>
            {rows.map((r) => <tr key={r.e.id}><td>{r.e.name}</td><td className="num">{r.spots}</td><td className="num">{r.st.total}</td><td className="num">{r.st.succeeded}</td><td className={"num" + (r.st.failed ? " danger" : "")}>{r.st.failed || "—"}</td><td className="num">{r.st.delivered}</td><td className="num">{r.rate}%</td></tr>)}
            {rows.length === 0 ? <tr><td colSpan={7} className="empty">Chưa có sự kiện.</td></tr> : null}
          </tbody>
        </table>
      </div>
      <h2 className="section-title">Theo photographer</h2>
      <div className="card list">
        {byPh.map((r) => <div key={r.p.id} className="row"><span className="row-main"><strong>{r.p.name}</strong><small>{r.spots} điểm · {r.total} ảnh · {r.ok} xong · {r.kept} chọn lọc</small></span></div>)}
        {byPh.length === 0 ? <p className="empty">Chưa có photographer.</p> : null}
      </div>
    </div>
  );
}

// ---------- 12 activity log ----------
const KIND_LABEL: Record<LogKind, string> = { ingest: "Nhận ảnh", process: "Xử lý", export: "Xuất", upload: "Giao", error: "Lỗi", retry: "Thử lại", config: "Cấu hình" };
const KIND_TONE: Record<LogKind, string> = { ingest: "blue", process: "purple", export: "teal", upload: "green", error: "red", retry: "orange", config: "gray" };
export function Logs() {
  const o = useOps();
  const [k, setK] = useState<LogKind | "all">("all");
  const [q, setQ] = useState("");
  const rows = o.logs.filter((l) => (k === "all" || l.kind === k) && (!q.trim() || l.text.toLowerCase().includes(q.trim().toLowerCase())));
  return (
    <div className="page ops-page">
      <Header title="Nhật ký" eyebrow={`${o.logs.length} dòng gần nhất`} actions={<button className="btn tinted sm" onClick={() => downloadCsv(`nhat-ky-${today()}.csv`, [["Thời gian", "Loại", "Nội dung", "Sự kiện", "Điểm chụp"], ...rows.map((l) => [l.at.replace("T", " "), KIND_LABEL[l.kind], l.text, o.events.find((e) => e.id === l.eventId)?.name ?? "", o.spots.find((s) => s.id === l.spotId)?.name ?? ""])])}>Tải CSV</button>} />
      <div className="filter-row">
        {(["all", "error", "retry", "ingest", "export", "upload", "config"] as const).map((x) => <button key={x} className={"chip-btn" + (k === x ? " on" : "")} onClick={() => setK(x)}>{x === "all" ? "Tất cả" : KIND_LABEL[x]}</button>)}
        <input className="input" style={{ maxWidth: 220 }} placeholder="Tìm trong nhật ký" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="card list">
        {rows.slice(0, 200).map((l) => (
          <div key={l.id} className="row"><span className={"badge tone-" + KIND_TONE[l.kind]}>{KIND_LABEL[l.kind]}</span><span className="row-main"><strong>{l.text}</strong><small>{o.spots.find((s) => s.id === l.spotId)?.name ?? ""}</small></span><small>{l.at.slice(5, 16).replace("T", " ")}</small></div>
        ))}
        {rows.length === 0 ? <p className="empty">Không có dòng nào.</p> : null}
      </div>
    </div>
  );
}

// ---------- 13 operations settings ----------
export function OpsSettings() {
  const o = useOps();
  const e = { ...defaultEngine(), ...o.engine };
  const [confirm, setConfirm] = useState(false);
  const num = (label: string, hint: string, key: "pollSec" | "maxAttempts" | "quality" | "keepTarget", min: number, max: number) => (
    <Field label={label} hint={hint}><input className="input" type="number" min={min} max={max} value={e[key]} onChange={(ev) => { const v = Math.round(Number(ev.target.value)); if (v >= min && v <= max) opsActions.setEngine({ [key]: v }); }} /></Field>
  );
  return (
    <div className="page ops-page">
      <Header title="Cài đặt vận hành" />
      <section className="card pad">
        {num("Quét thư mục mỗi (giây)", "2 đến 60. Nhỏ hơn thì nhận ảnh nhanh hơn nhưng quét nhiều hơn.", "pollSec", 2, 60)}
        {num("Số lần thử lại tối đa", "Áp dụng cho xử lý ảnh và giao ảnh. 1 đến 10.", "maxAttempts", 1, 10)}
        {num("Chất lượng JPEG khi xuất", "40 đến 100. 90 là mức cân bằng.", "quality", 40, 100)}
        {num("Mục tiêu ảnh khóa mỗi điểm chụp", "Dùng cho màn hình Ảnh chọn lọc.", "keepTarget", 1, 500)}
      </section>
      <section className="card list">
        <div className="toggle-row"><span><strong>Dữ liệu mẫu</strong><small>Xóa job, giao ảnh và nhật ký mẫu; dữ liệu thật giữ nguyên</small></span><button className="chip-btn danger" onClick={() => opsActions.clearDemo()} disabled={!opsActions.hasDemo()}>Xóa dữ liệu mẫu</button></div>
        <div className="toggle-row"><span><strong>Nạp lại dữ liệu vận hành mẫu</strong><small>Thay toàn bộ dữ liệu vận hành bằng bản mẫu</small></span><button className="chip-btn" onClick={() => setConfirm(true)}>Nạp</button></div>
      </section>
      {confirm ? <Confirm title="Nạp dữ liệu mẫu" text="Thay toàn bộ sự kiện, điểm chụp, job và nhật ký bằng dữ liệu mẫu? Nên tải bản sao lưu trước (Cài đặt → Sao lưu)." confirmLabel="Nạp" onConfirm={() => opsActions.reset()} onClose={() => setConfirm(false)} /> : null}
    </div>
  );
}
