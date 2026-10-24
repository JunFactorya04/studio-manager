import { Header } from "../components/Header";
import { Icon } from "../components/Icon";
import { fmtDate } from "../store";
import { SPOT_STATUS, spotStats, useOps, type LogKind } from "../opsStore";
import type { Go } from "../nav";

const KIND_LABEL: Record<LogKind, string> = { ingest: "Nhận ảnh", process: "Xử lý", export: "Xuất", upload: "Gửi", error: "Lỗi", retry: "Thử lại", config: "Cấu hình" };
const KIND_TONE: Record<LogKind, string> = { ingest: "blue", process: "purple", export: "teal", upload: "green", error: "red", retry: "orange", config: "gray" };

const timeOf = (iso: string) => iso.slice(11, 16);
const ago = (iso: string) => {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "vừa xong";
  if (mins < 60) return `${mins} phút trước`;
  if (mins < 1440) return `${Math.round(mins / 60)} giờ trước`;
  return `${Math.round(mins / 1440)} ngày trước`;
};

export function OpsOverview({ go }: { go: Go }) {
  const o = useOps();
  const all = spotStats(o);
  const live = o.events.filter((e) => e.status === "live");
  const state = (ok: "ok" | "idle" | "error") => (ok === "ok" ? ["Hoạt động", "green"] : ok === "idle" ? ["Chờ", "gray"] : ["Lỗi", "red"]);

  // Things that need a person: failed jobs, failed uploads, spots in error, stalled agent.
  const alerts: { tone: string; text: string; sub: string }[] = [];
  o.spots.filter((s) => s.status === "error").forEach((s) => alerts.push({ tone: "red", text: `${s.name}: điểm chụp đang lỗi`, sub: o.events.find((e) => e.id === s.eventId)?.name ?? "" }));
  if (all.failed) alerts.push({ tone: "red", text: `${all.failed} job xử lý ảnh bị lỗi`, sub: "Mở hàng đợi để xem nguyên nhân và thử lại" });
  if (all.deliveryFailed) alerts.push({ tone: "orange", text: `${all.deliveryFailed} ảnh gửi thất bại`, sub: "Mất kết nối hoặc quá thời gian chờ" });
  if (all.paused) alerts.push({ tone: "orange", text: `${all.paused} job đang tạm dừng`, sub: "Tiếp tục khi sẵn sàng" });
  if (!o.agent.online) alerts.push({ tone: "red", text: "Máy Studio mất kết nối", sub: `Lần cuối ${ago(o.agent.lastSeen)}` });

  const pct = all.total ? Math.round((all.succeeded / all.total) * 100) : 0;

  return (
    <div className="page ops-page">
      <Header title="Tổng quan vận hành" eyebrow={`${live.length} sự kiện đang diễn ra`} actions={<button className="icon-btn primary" aria-label="Mở sự kiện" onClick={() => go({ view: "events" })}><Icon name="flag" /></button>} />

      <div className="stat-grid">
        <div className="card stat"><span className="stat-label">Sự kiện</span><span className="stat-value">{o.events.length}</span><span className="stat-sub">{live.length} đang diễn ra · {o.spots.length} điểm chụp</span></div>
        <div className="card stat"><span className="stat-label">Tổng số ảnh</span><span className="stat-value">{all.total.toLocaleString("vi-VN")}</span><span className="stat-sub">{pct}% đã hoàn thành</span></div>
        <div className="card stat"><span className="stat-label">Chờ và đang xử lý</span><span className="stat-value">{all.pending + all.running}</span><span className="stat-sub">{all.pending} chờ · {all.running} đang chạy</span></div>
        <div className="card stat"><span className="stat-label">Đã giao</span><span className="stat-value">{all.delivered}</span><span className={"stat-sub" + (all.deliveryFailed ? " danger" : "")}>{all.deliveryWaiting} chờ gửi · {all.deliveryFailed} lỗi</span></div>
      </div>

      <div className="two-col">
        <section className="card pad" aria-label="Tình trạng hệ thống">
          <h2 className="card-title">Tình trạng hệ thống</h2>
          <ul className="sys-list">
            <li><span className={"sys-dot " + (o.agent.online ? "ok" : "bad")} /><span className="row-main"><strong>Máy Studio ({o.agent.host})</strong><small>{o.agent.online ? `Đồng bộ ${ago(o.agent.lastSeen)}` : `Mất kết nối, lần cuối ${ago(o.agent.lastSeen)}`}{o.agent.localQueue ? ` · ${o.agent.localQueue} tác vụ chờ` : ""}</small></span><span className={"badge tone-" + (o.agent.online ? "green" : "red")}>{o.agent.online ? "Trực tuyến" : "Ngoại tuyến"}</span></li>
            <li><span className={"sys-dot " + (o.agent.captureOne === "ok" ? "ok" : o.agent.captureOne === "idle" ? "idle" : "bad")} /><span className="row-main"><strong>Capture One</strong><small>{o.spots.filter((s) => s.c1Session).length} session được theo dõi</small></span><span className={"badge tone-" + state(o.agent.captureOne)[1]}>{state(o.agent.captureOne)[0]}</span></li>
            <li><span className={"sys-dot " + (o.agent.ftp === "ok" ? "ok" : o.agent.ftp === "idle" ? "idle" : "bad")} /><span className="row-main"><strong>FTP</strong><small>Nhận ảnh từ các điểm chụp</small></span><span className={"badge tone-" + state(o.agent.ftp)[1]}>{state(o.agent.ftp)[0]}</span></li>
          </ul>
        </section>

        <section className="card pad" aria-label="Cảnh báo">
          <h2 className="card-title">Cần xử lý {alerts.length ? <span className="count-pill">{alerts.length}</span> : null}</h2>
          {alerts.length ? (
            <ul className="alert-list">
              {alerts.map((a, i) => (
                <li key={i}><span className={"chip-icon tone-" + a.tone}><Icon name="alert" /></span><span className="row-main"><strong>{a.text}</strong><small>{a.sub}</small></span></li>
              ))}
            </ul>
          ) : <p className="f-hint">Mọi thứ đang chạy bình thường.</p>}
        </section>
      </div>

      <h2 className="section-title">Điểm chụp</h2>
      <div className="card table-wrap desk-only">
        <table className="mtable">
          <thead><tr><th><span className="th">Điểm chụp</span></th><th><span className="th">Sự kiện</span></th><th><span className="th">Trạng thái</span></th><th className="num"><span className="th">Ảnh</span></th><th><span className="th">Tiến độ</span></th><th className="num"><span className="th">Lỗi</span></th><th className="num"><span className="th">Đã giao</span></th></tr></thead>
          <tbody>
            {o.spots.map((s) => {
              const st = spotStats(o, s.id);
              const ev = o.events.find((e) => e.id === s.eventId);
              const p = st.total ? Math.round((st.succeeded / st.total) * 100) : 0;
              return (
                <tr key={s.id} onDoubleClick={() => go({ view: "events", eventId: s.eventId })}>
                  <td><button className="as-link" onClick={() => go({ view: "events", eventId: s.eventId })}>{s.name}</button></td>
                  <td className="muted">{ev?.name}</td>
                  <td><span className={"badge tone-" + SPOT_STATUS[s.status][1]}>{SPOT_STATUS[s.status][0]}</span></td>
                  <td className="num">{st.total}</td>
                  <td><span className="mini-meter wide"><span style={{ width: p + "%" }} /></span> <span className="muted">{p}%</span></td>
                  <td className={"num" + (st.failed ? " danger" : "")}>{st.failed || "—"}</td>
                  <td className="num">{st.delivered}</td>
                </tr>
              );
            })}
            {o.spots.length === 0 ? <tr><td colSpan={7} className="empty">Chưa có điểm chụp. Tạo trong Sự kiện & Spot.</td></tr> : null}
          </tbody>
        </table>
      </div>
      <div className="card list phone-only">
        {o.spots.map((s) => {
          const st = spotStats(o, s.id);
          return (
            <button key={s.id} className="row" onClick={() => go({ view: "events", eventId: s.eventId })}>
              <span className="row-main"><strong>{s.name}</strong><small>{st.total} ảnh · {st.failed} lỗi · đã giao {st.delivered}</small></span>
              <span className={"badge tone-" + SPOT_STATUS[s.status][1]}>{SPOT_STATUS[s.status][0]}</span>
            </button>
          );
        })}
      </div>

      <h2 className="section-title">Hoạt động gần đây</h2>
      <div className="card list">
        {o.logs.slice(0, 8).map((l) => (
          <div key={l.id} className="row">
            <span className={"badge tone-" + KIND_TONE[l.kind]}>{KIND_LABEL[l.kind]}</span>
            <span className="row-main"><strong>{l.text}</strong><small>{o.spots.find((s) => s.id === l.spotId)?.name ?? ""}</small></span>
            <small>{l.at.slice(0, 10) === new Date().toISOString().slice(0, 10) ? timeOf(l.at) : fmtDate(l.at.slice(0, 10))}</small>
          </div>
        ))}
        {o.logs.length === 0 ? <p className="empty">Chưa có hoạt động.</p> : null}
      </div>
      <p className="f-hint">Hiện là dữ liệu mẫu lưu trong app. Studio Agent và máy chủ trung tâm sẽ thay thế khi được nối.</p>
    </div>
  );
}
