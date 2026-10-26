import { useEffect, useState } from "react";
import { Header } from "../components/Header";
import { dirStats, fileInfo, fmtBytes, isDesktop, machineInfo, type DirStats, type FileInfo, type MachineInfo } from "../native";
import { useOps } from "../opsStore";
import { useEngine } from "../opsEngine";
import type { Go } from "../nav";

const isAbs = (p: string) => /^([A-Za-z]:[\\/]|\\\\|\/)/.test(p);
const ago = (ms: number) => {
  if (!ms) return "chưa có";
  const m = Math.max(0, Math.round((Date.now() - ms) / 60000));
  return m < 1 ? "vừa xong" : m < 60 ? `${m} phút trước` : m < 1440 ? `${Math.round(m / 60)} giờ trước` : `${Math.round(m / 1440)} ngày trước`;
};

interface Probe { session?: FileInfo; cap?: DirStats; out?: DirStats }

// Read-only look at Capture One's work: is the program running, is the session file there, how far behind is the export.
export function CaptureOne({ go }: { go: Go }) {
  const o = useOps();
  const [probe, setProbe] = useState<Record<string, Probe>>({});
  const [mac, setMac] = useState<MachineInfo>();
  const spots = o.spots.filter((s) => o.events.find((e) => e.id === s.eventId)?.status === "live" || s.c1Session.trim());
  const key = spots.map((s) => s.id + s.captureDir + s.outputDir + s.c1Session).join("|");
  useEffect(() => {
    if (!isDesktop) return;
    let alive = true;
    const run = async () => {
      try { const m = await machineInfo(); if (alive) setMac(m); } catch { /* ignore */ }
      const next: Record<string, Probe> = {};
      for (const s of spots) {
        const p: Probe = {};
        try {
          if (isAbs(s.c1Session.trim())) p.session = await fileInfo(s.c1Session.trim());
          if (s.captureDir.trim()) p.cap = await dirStats(s.captureDir.trim());
          if (s.outputDir.trim()) p.out = await dirStats(s.outputDir.trim());
        } catch { /* leave blank */ }
        next[s.id] = p;
      }
      if (alive) setProbe(next);
    };
    void run();
    const t = setInterval(run, 10_000);
    return () => { alive = false; clearInterval(t); };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const verdict = (p?: Probe): [string, string, string] => {
    if (!isDesktop) return ["gray", "Chỉ trong app", ""];
    if (!p) return ["gray", "Đang kiểm tra", ""];
    if (p.session && !p.session.exists) return ["red", "Không thấy session", "Đường dẫn session không tồn tại"];
    if (p.cap && !p.cap.exists) return ["red", "Lỗi thư mục chụp", "Thư mục nhận ảnh không tồn tại"];
    const behind = (p.cap?.count ?? 0) - (p.out?.count ?? 0);
    const recent = p.cap && p.cap.latestMs && Date.now() - p.cap.latestMs < 10 * 60_000;
    if (recent && mac && !mac.captureOneRunning) return ["orange", "Capture One chưa mở", "Đang có ảnh mới nhưng không thấy Capture One chạy"];
    if (p.cap && p.out && p.out.exists && behind > 0 && p.cap.latestMs - (p.out.latestMs || 0) > 10 * 60_000) return ["orange", "Xuất chậm", `Còn ${behind} ảnh chưa thấy ở thư mục xuất, ảnh xuất mới nhất ${ago(p.out.latestMs)}`];
    return ["green", "Bình thường", ""];
  };

  return (
    <div className="page ops-page">
      <Header title="Capture One" eyebrow="Giám sát, chỉ đọc" />
      <div className="card pad engine-bar">
        <span className={"sys-dot " + (mac?.captureOneRunning ? "ok" : "")} />
        <span className="row-main"><strong>{!isDesktop ? "Chỉ chạy trong bản app" : mac ? (mac.captureOneRunning ? "Capture One đang chạy" : "Không thấy Capture One đang chạy") : "Đang kiểm tra…"}</strong><small>App chỉ đọc: kiểm tra tiến trình, file session và số ảnh trong thư mục chụp / xuất. Không điều khiển Capture One.</small></span>
      </div>
      <p className="f-hint">Ô "Session" của điểm chụp: điền đường dẫn đầy đủ tới file .cosessiondb để kiểm tra file tồn tại và lần sửa cuối; chỉ điền tên thì app chỉ hiển thị tên.</p>
      <div className="card list">
        {spots.map((s) => {
          const p = probe[s.id];
          const [tone, label, why] = verdict(p);
          const ev = o.events.find((e) => e.id === s.eventId);
          return (
            <button key={s.id} className="row" onClick={() => go({ view: "events", eventId: s.eventId })}>
              <span className="row-main">
                <strong>{s.name} <small>· {ev?.name}</small></strong>
                <small>Session: {s.c1Session || "—"}{p?.session?.exists ? ` · sửa ${ago(p.session.modifiedMs)} · ${fmtBytes(p.session.size)}` : ""}</small>
                <small>{p?.cap ? `Chụp: ${p.cap.count} ảnh (${ago(p.cap.latestMs)})` : "Chụp: chưa đặt thư mục"} · {p?.out ? `Xuất: ${p.out.count} ảnh (${ago(p.out.latestMs)})` : "Xuất: chưa đặt thư mục"}</small>
                {why ? <small className={tone === "red" ? "danger" : ""}>{why}</small> : null}
              </span>
              <span className={"badge tone-" + tone}>{label}</span>
            </button>
          );
        })}
        {spots.length === 0 ? <p className="empty">Chưa có điểm chụp nào thuộc sự kiện đang diễn ra.</p> : null}
      </div>
    </div>
  );
}

export function Agent() {
  const o = useOps();
  const eng = useEngine();
  const a = o.agent;
  const dirs = Object.values(eng.dirs);
  const queue = o.jobs.filter((j) => j.source && (j.status === "pending" || j.status === "running")).length;
  const rows: [string, string, string, string][] = [
    ["Máy này", a.real ? `${a.host}${a.os ? " · " + a.os : ""}` : "Chưa kết nối (đang là dữ liệu mẫu)", a.real && a.online ? "green" : "gray", a.real ? (a.online ? "Trực tuyến" : "Tạm dừng") : "Mẫu"],
    ["Bộ theo dõi thư mục", dirs.length ? `${dirs.filter((d) => d.ok).length}/${dirs.length} thư mục đọc được` : "Chưa có thư mục nào để theo dõi", dirs.some((d) => !d.ok) ? "red" : dirs.length ? "green" : "gray", dirs.some((d) => !d.ok) ? "Có lỗi" : dirs.length ? "Hoạt động" : "Chờ"],
    ["Capture One", a.real ? (a.captureOne === "ok" ? "Đang chạy trên máy này" : "Không thấy tiến trình") : "—", a.real && a.captureOne === "ok" ? "green" : "gray", a.real && a.captureOne === "ok" ? "Chạy" : "Chờ"],
    ["Hàng đợi", `${queue} ảnh chờ/đang xử lý, ${eng.busy} tác vụ đang chạy`, "blue", String(queue)],
  ];
  return (
    <div className="page ops-page">
      <Header title="Studio Agent" eyebrow="Máy này" />
      <div className="card list">
        {rows.map(([t, sub, tone, badge]) => (
          <div key={t} className="row"><span className="row-main"><strong>{t}</strong><small>{sub}</small></span><span className={"badge tone-" + tone}>{badge}</span></div>
        ))}
      </div>
      <p className="f-hint">Hiện mỗi máy tự chạy bộ nhận, xử lý và giao ảnh của riêng nó, và báo trạng thái lên màn hình Tổng quan vận hành. Chưa có máy chủ trung tâm, nên chưa xem được nhiều máy cùng lúc. Lần cập nhật cuối: {a.real ? a.lastSeen.replace("T", " ") : "—"}.</p>
    </div>
  );
}
