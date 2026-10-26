import { useEffect, useMemo, useState } from "react";
import { Header } from "../components/Header";
import { Icon } from "../components/Icon";
import { DELIVERY_STATUS, JOB_STATUS, opsActions, useOps, type DeliveryStatus, type JobStatus } from "../opsStore";
import { pauseJob, resumeJob, retryDelivery, retryJob, tick, useEngine } from "../opsEngine";
import { checkDir, fmtBytes, isDesktop, type DirCheck } from "../native";
import type { Go } from "../nav";

const SHOW = 200; // rows drawn at once; a big event can have thousands of photos
const timeOf = (iso: string) => iso.slice(11, 16);

// Shared strip at the top of the three screens: is the engine working, pause it, scan now, clear sample data.
function EngineBar() {
  const o = useOps();
  const eng = useEngine();
  const paused = !!o.engine?.paused;
  return (
    <div className="card pad engine-bar">
      <span className={"sys-dot " + (!isDesktop ? "" : paused ? "" : "ok")} />
      <span className="row-main">
        <strong>{!isDesktop ? "Chỉ chạy trong bản app" : paused ? "Đã tạm dừng" : eng.busy ? `Đang xử lý ${eng.busy} tác vụ` : "Đang theo dõi thư mục"}</strong>
        <small>{!isDesktop ? "Bản web không đọc được thư mục trên máy. Mở bản app (Mo-Studio.command) để chạy thật." : eng.lastTick ? `Quét lần cuối ${new Date(eng.lastTick).toLocaleTimeString("vi-VN")} · mỗi ${o.engine?.pollSec ?? 5} giây` : "Chuẩn bị quét…"}</small>
      </span>
      {isDesktop ? (
        <>
          <button className="chip-btn" onClick={() => opsActions.setEngine({ paused: !paused })}>{paused ? "Tiếp tục" : "Tạm dừng tất cả"}</button>
          <button className="chip-btn" onClick={() => void tick()} disabled={paused}>Quét ngay</button>
        </>
      ) : null}
      {opsActions.hasDemo() ? <button className="chip-btn danger" onClick={() => opsActions.clearDemo()}>Xóa dữ liệu mẫu</button> : null}
    </div>
  );
}

export function Ingest({ go }: { go: Go }) {
  const o = useOps();
  const eng = useEngine();
  const spots = o.spots.filter((s) => s.captureDir.trim() || o.events.find((e) => e.id === s.eventId)?.status === "live");
  return (
    <div className="page ops-page">
      <Header title="Nhận ảnh" eyebrow="Theo dõi thư mục chụp / FTP" />
      <EngineBar />
      <p className="f-hint">Trỏ thư mục FTP (hoặc thư mục máy ảnh đẩy ảnh vào) vào ô "Thư mục nhận ảnh" của từng điểm chụp. Chỉ sự kiện ở trạng thái "Đang diễn ra" mới được theo dõi. Ảnh phải ngừng thay đổi dung lượng giữa hai lần quét mới được nhận, nên file đang ghi dở sẽ không bị lấy. Tệp RAW chỉ được đếm; Capture One sẽ xử lý ở bước sau.</p>
      <div className="card list">
        {spots.map((s) => {
          const ev = o.events.find((e) => e.id === s.eventId);
          const live = ev?.status === "live";
          const d = eng.dirs[s.captureDir.trim()];
          const jobs = o.jobs.filter((j) => j.spotId === s.id && j.source).length;
          const [tone, label] = !s.captureDir.trim() ? ["gray", "Chưa đặt thư mục"] : !live ? ["gray", "Không theo dõi"] : !isDesktop ? ["gray", "Chỉ trong app"] : !d ? ["gray", "Chờ quét"] : d.ok ? ["green", "Đang nhận"] : ["red", "Lỗi thư mục"];
          return (
            <button key={s.id} className="row" onClick={() => go({ view: "events", eventId: s.eventId })}>
              <span className="row-main">
                <strong>{s.name} <small>· {ev?.name}</small></strong>
                <small>{s.captureDir || "—"}</small>
                <small>{d?.ok ? `${d.jpg} JPG · ${d.raw} RAW trong thư mục · ${jobs} ảnh đã nhận` : d?.error ?? (live ? "" : ev ? `Sự kiện đang ở trạng thái "${ev.status === "draft" ? "Nháp" : "Đã kết thúc"}"` : "")}</small>
              </span>
              <span className={"badge tone-" + tone}>{label}</span>
            </button>
          );
        })}
        {spots.length === 0 ? <p className="empty">Chưa có điểm chụp nào có thư mục nhận ảnh. Tạo trong Sự kiện & Spot.</p> : null}
      </div>
    </div>
  );
}

export function Queue({ go }: { go: Go }) {
  const o = useOps();
  const [f, setF] = useState<JobStatus | "all">("all");
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: o.jobs.length };
    o.jobs.forEach((j) => { c[j.status] = (c[j.status] ?? 0) + 1; });
    return c;
  }, [o.jobs]);
  const rank: Record<JobStatus, number> = { running: 0, failed: 1, paused: 2, pending: 3, succeeded: 4 };
  const rows = useMemo(() => o.jobs.filter((j) => f === "all" || j.status === f).sort((a, b) => rank[a.status] - rank[b.status] || b.createdAt.localeCompare(a.createdAt)), [o.jobs, f]); // eslint-disable-line react-hooks/exhaustive-deps
  const failed = o.jobs.filter((j) => j.status === "failed" && j.source);
  const waiting = o.jobs.filter((j) => j.status === "pending" && j.source);
  return (
    <div className="page ops-page">
      <Header title="Xử lý ảnh" eyebrow={`${(counts.pending ?? 0) + (counts.running ?? 0)} đang chờ hoặc chạy`} />
      <EngineBar />
      <div className="filter-row">
        {(["all", "running", "pending", "failed", "paused", "succeeded"] as const).map((k) => (
          <button key={k} className={"chip-btn" + (f === k ? " on" : "")} onClick={() => setF(k)}>{k === "all" ? "Tất cả" : JOB_STATUS[k][0]} {counts[k] ?? 0}</button>
        ))}
        <span style={{ flex: 1 }} />
        {failed.length ? <button className="chip-btn" onClick={() => failed.forEach((j) => retryJob(j.id))}>Thử lại {failed.length} lỗi</button> : null}
        {waiting.length ? <button className="chip-btn" onClick={() => waiting.forEach((j) => pauseJob(j.id))}>Tạm dừng {waiting.length} đang chờ</button> : null}
      </div>
      <p className="f-hint">App thu nhỏ ảnh JPG về cạnh dài theo recipe của điểm chụp (ví dụ "JPEG 2400px"), lưu vào thư mục ảnh xuất, rồi chuyển sang Giao ảnh. Lỗi tạm thời được tự thử lại tối đa {o.engine?.maxAttempts ?? 3} lần.</p>
      <div className="card list">
        {rows.slice(0, SHOW).map((j) => {
          const sp = o.spots.find((s) => s.id === j.spotId);
          const real = !!j.source;
          return (
            <div key={j.id} className="row">
              <span className="row-main">
                <strong>{j.file}</strong>
                <small>{sp?.name ?? "—"} · {timeOf(j.createdAt)}{j.size ? ` · ${fmtBytes(j.size)}` : ""}{j.attempts ? ` · lần thử ${j.attempts}` : ""}{j.status === "succeeded" && j.durationSec ? ` · ${j.durationSec}s` : ""}{j.demo ? " · mẫu" : ""}</small>
                {j.error ? <small className="danger">{j.error}</small> : null}
              </span>
              <span className={"badge tone-" + JOB_STATUS[j.status][1]}>{JOB_STATUS[j.status][0]}</span>
              {real && (j.status === "failed" || j.status === "paused") ? <button className="chip-btn" onClick={() => (j.status === "paused" ? resumeJob(j.id) : retryJob(j.id))}>{j.status === "paused" ? "Tiếp tục" : "Thử lại"}</button> : null}
              {real && j.status === "succeeded" ? <button className={"chip-btn" + (j.keep ? " on" : "")} onClick={() => opsActions.setJobKeep(j.id, j.keep === "lock" ? "marketing" : j.keep ? undefined : "lock")}>{j.keep === "lock" ? "Đã khóa" : j.keep === "marketing" ? "Marketing" : "Khóa ảnh"}</button> : null}
              {real && j.status === "pending" ? <button className="chip-btn" onClick={() => pauseJob(j.id)}>Tạm dừng</button> : null}
            </div>
          );
        })}
        {rows.length === 0 ? <p className="empty">Không có job nào. Khi có ảnh mới trong thư mục chụp, job sẽ tự xuất hiện.</p> : null}
        {rows.length > SHOW ? <p className="empty">Hiện {SHOW} trong {rows.length} job. Lọc theo trạng thái để thu hẹp.</p> : null}
      </div>
      <button className="as-link" onClick={() => go({ view: "ops" })}>Về tổng quan vận hành</button>
    </div>
  );
}

export function Delivery({ go }: { go: Go }) {
  const o = useOps();
  const [f, setF] = useState<DeliveryStatus | "all">("all");
  const [checks, setChecks] = useState<Record<string, DirCheck | undefined>>({});
  const dirKey = o.events.map((e) => e.deliveryDir ?? "").join("|");
  useEffect(() => {
    if (!isDesktop) return;
    let alive = true;
    o.events.filter((e) => e.deliveryDir?.trim()).forEach((e) => checkDir(e.deliveryDir!.trim()).then((r) => alive && setChecks((c) => ({ ...c, [e.id]: r }))).catch(() => alive && setChecks((c) => ({ ...c, [e.id]: { exists: false, writable: false } }))));
    return () => { alive = false; };
  }, [dirKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const rows = useMemo(() => {
    const rank: Record<DeliveryStatus, number> = { uploading: 0, failed: 1, pending: 2, done: 3 };
    return o.deliveries.filter((d) => f === "all" || d.status === f).sort((a, b) => rank[a.status] - rank[b.status] || b.at.localeCompare(a.at));
  }, [o.deliveries, f]);
  const count = (s: DeliveryStatus) => o.deliveries.filter((d) => d.status === s).length;
  const failed = o.deliveries.filter((d) => d.status === "failed" && !d.demo);
  const targets = o.events.filter((e) => o.spots.some((s) => s.eventId === e.id));
  return (
    <div className="page ops-page">
      <Header title="Giao ảnh" eyebrow={`${count("done")} đã giao · ${count("pending") + count("uploading")} chờ`} />
      <EngineBar />
      <h2 className="section-title">Thư mục giao theo sự kiện</h2>
      <div className="card list">
        {targets.map((e) => {
          const c = checks[e.id];
          const has = !!e.deliveryDir?.trim();
          const [tone, label] = !has ? ["gray", "Chưa đặt"] : !isDesktop ? ["gray", "Chỉ trong app"] : !c ? ["gray", "Đang kiểm tra"] : !c.exists ? ["red", "Không thấy thư mục"] : !c.writable ? ["orange", "Không ghi được"] : ["green", "Sẵn sàng"];
          return (
            <button key={e.id} className="row" onClick={() => go({ view: "events", eventId: e.id })}>
              <span className="row-main"><strong>{e.name}</strong><small>{has ? e.deliveryDir : 'Đặt "Thư mục giao ảnh" khi sửa sự kiện để bật tự động giao'}</small></span>
              <span className={"badge tone-" + tone}>{label}</span>
            </button>
          );
        })}
        {targets.length === 0 ? <p className="empty">Chưa có sự kiện nào có điểm chụp.</p> : null}
      </div>
      <div className="filter-row">
        {(["all", "uploading", "pending", "failed", "done"] as const).map((k) => (
          <button key={k} className={"chip-btn" + (f === k ? " on" : "")} onClick={() => setF(k)}>{k === "all" ? "Tất cả" : DELIVERY_STATUS[k][0]} {k === "all" ? o.deliveries.length : count(k)}</button>
        ))}
        <span style={{ flex: 1 }} />
        {failed.length ? <button className="chip-btn" onClick={() => failed.forEach((d) => retryDelivery(d.id))}>Thử lại {failed.length} lỗi</button> : null}
      </div>
      <p className="f-hint">Ảnh đã xử lý được chép vào &lt;thư mục giao&gt;/&lt;tên điểm chụp&gt;/ kèm kiểm tra SHA-256. Ghi dở sẽ không để lại file hỏng; ảnh xuất lại sẽ thay bản cũ.</p>
      <div className="card list">
        {rows.slice(0, SHOW).map((d) => (
          <div key={d.id} className="row">
            <span className="row-main">
              <strong>{d.file}</strong>
              <small>{o.spots.find((s) => s.id === d.spotId)?.name ?? "—"} · {timeOf(d.at)}{d.attempts ? ` · lần thử ${d.attempts}` : ""}{d.demo ? " · mẫu" : ""}</small>
              {d.dest ? <small>{d.dest}</small> : null}
              {d.error ? <small className="danger">{d.error}</small> : null}
            </span>
            <span className={"badge tone-" + DELIVERY_STATUS[d.status][1]}>{DELIVERY_STATUS[d.status][0]}</span>
            {!d.demo && d.status === "failed" ? <button className="chip-btn" onClick={() => retryDelivery(d.id)}><Icon name="refresh" size={14} /> Thử lại</button> : null}
          </div>
        ))}
        {rows.length === 0 ? <p className="empty">Chưa có ảnh nào cần giao.</p> : null}
        {rows.length > SHOW ? <p className="empty">Hiện {SHOW} trong {rows.length}. Lọc theo trạng thái để thu hẹp.</p> : null}
      </div>
    </div>
  );
}
