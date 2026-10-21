import { useEffect, useMemo, useState } from "react";
import { Header } from "../components/Header";
import { Icon } from "../components/Icon";
import { ImportSheet } from "../components/ImportSheet";
import { Viewer } from "../components/Viewer";
import { actions, fmtDate, useData, type Mark } from "../store";
import { fileUrl, fmtBytes, isDesktop, pickFolder } from "../native";
import type { Go, Route } from "../nav";

const TABS: { id: Mark | "all"; label: string }[] = [
  { id: "all", label: "Tất cả" },
  { id: "keep", label: "Giữ" },
  { id: "reject", label: "Loại" },
  { id: "none", label: "Chưa xem" },
];

export function Library({ go, route }: { go: Go; route?: Route }) {
  const d = useData();
  const [projectId, setProjectId] = useState<string>(route?.projectId ?? route?.importFor ?? "all");
  const [tab, setTab] = useState<Mark | "all">("all");
  const [minStars, setMinStars] = useState(0);
  const [importing, setImporting] = useState(!!route?.importFor);
  const [viewing, setViewing] = useState<number | null>(null);

  useEffect(() => { if (route?.importFor) setImporting(true); }, [route?.importFor]);

  const projects = d.projects.filter((p) => d.assets.some((a) => a.projectId === p.id));
  const scoped = d.assets.filter((a) => projectId === "all" || a.projectId === projectId);
  const visible = useMemo(
    () => scoped.filter((a) => (tab === "all" || a.mark === tab) && a.rating >= minStars),
    [scoped, tab, minStars],
  );
  const groups = projectId === "all"
    ? projects.map((p) => ({ p, items: visible.filter((a) => a.projectId === p.id) })).filter((g) => g.items.length)
    : [{ p: d.projects.find((p) => p.id === projectId)!, items: visible }].filter((g) => g.p);

  const total = scoped.reduce((s, a) => s + a.bytes, 0);
  const counts = { keep: scoped.filter((a) => a.mark === "keep").length, reject: scoped.filter((a) => a.mark === "reject").length, none: scoped.filter((a) => a.mark === "none").length };

  const chooseNas = async () => {
    const dir = await pickFolder("Chọn thư mục gốc trên NAS");
    if (dir) actions.updateSettings({ nasRoot: dir });
  };

  return (
    <div className="page">
      <Header
        title="Thư viện"
        actions={
          <button className="icon-btn primary" aria-label="Nhập ảnh từ thẻ nhớ" onClick={() => setImporting(true)}>
            <Icon name="sd" />
          </button>
        }
      />

      <div className="card storage">
        <div className="storage-nas">
          <div className="storage-top"><strong>Thư mục NAS</strong><small>{fmtBytes(total)} · {scoped.length} ảnh</small></div>
          <code className="path-line">{d.settings.nasRoot || "Chưa chọn thư mục gốc"}</code>
        </div>
        {isDesktop ? <button className="chip-btn" onClick={chooseNas}>{d.settings.nasRoot ? "Đổi" : "Chọn"}</button> : null}
      </div>

      <div className="toolbar">
        <label className="sr-only" htmlFor="lib-project">Dự án</label>
        <select id="lib-project" className="select" style={{ width: "auto", minWidth: 200, height: 34, borderRadius: 17 }} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          <option value="all">Tất cả dự án</option>
          {d.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <div className="segmented" role="tablist" aria-label="Trạng thái chọn lọc">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? "on" : ""} onClick={() => setTab(t.id)}>
              {t.label}{t.id !== "all" ? ` ${counts[t.id]}` : ""}
            </button>
          ))}
        </div>
        <label className="sr-only" htmlFor="lib-stars">Số sao tối thiểu</label>
        <select id="lib-stars" className="select" style={{ width: "auto", height: 34, borderRadius: 17 }} value={minStars} onChange={(e) => setMinStars(Number(e.target.value))}>
          <option value={0}>Mọi số sao</option>
          {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>Từ {n} sao</option>)}
        </select>
      </div>
      <p className="f-hint">Rê chuột lên ảnh để bấm Giữ ✓ hoặc Loại ✕. Bấm vào ảnh để xem lớn và lọc nhanh bằng phím P, X, 1–5.</p>

      {groups.map(({ p, items }) => (
        <section key={p.id} className="lib-group">
          <button className="group-head" onClick={() => go({ view: "projects", projectId: p.id })}>
            <strong>{p.name} · {fmtDate(p.date)}</strong>
            <small>{items.length} ảnh</small>
          </button>
          <div className="photo-grid">
            {items.map((a) => {
              const src = fileUrl(a.thumbPath) ?? fileUrl(a.jpgPath);
              return (
                <div key={a.id} className={"tile" + (a.mark === "reject" ? " rejected" : "")} style={{ background: a.color }}>
                  <button
                    className="tile-open"
                    aria-label={`Mở ${a.base}: ${a.mark === "keep" ? "giữ" : a.mark === "reject" ? "loại" : "chưa xem"}${a.rating ? `, ${a.rating} sao` : ""}`}
                    onClick={() => setViewing(visible.indexOf(a))}
                  >
                    {src ? <img src={src} alt="" loading="lazy" /> : null}
                  </button>
                  <span className="tile-tag">{a.rawPath || !a.jpgPath ? "RAW+JPG" : "JPG"}</span>
                  <button className={"tile-mark keep" + (a.mark === "keep" ? " on" : "")} aria-pressed={a.mark === "keep"} aria-label="Giữ" onClick={() => actions.updateAsset(a.id, { mark: a.mark === "keep" ? "none" : "keep" })}>
                    <Icon name="check" size={13} stroke={3} />
                  </button>
                  <button className={"tile-mark reject" + (a.mark === "reject" ? " on" : "")} aria-pressed={a.mark === "reject"} aria-label="Loại" onClick={() => actions.updateAsset(a.id, { mark: a.mark === "reject" ? "none" : "reject" })}>
                    <Icon name="x" size={12} stroke={3} />
                  </button>
                  {a.rating ? <span className="tile-stars">{"★".repeat(a.rating)}</span> : null}
                  {a.picked ? <span className="tile-heart" aria-label="Khách đã chọn"><Icon name="heart" size={13} stroke={2.4} /></span> : null}
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {groups.length === 0 ? (
        <div className="empty-state">
          <Icon name="photo" size={32} />
          <p>{scoped.length ? "Không có ảnh nào khớp bộ lọc." : "Chưa có ảnh. Nhập ảnh từ thẻ nhớ để bắt đầu."}</p>
          {!scoped.length ? <button className="btn primary sm" onClick={() => setImporting(true)}><Icon name="sd" size={18} />Nhập ảnh</button> : null}
        </div>
      ) : null}

      {importing ? (
        <ImportSheet
          projectId={route?.importFor ?? (projectId !== "all" ? projectId : undefined)}
          onClose={() => setImporting(false)}
          onDone={(pid) => { setProjectId(pid); setTab("all"); }}
        />
      ) : null}
      {viewing !== null ? <Viewer assets={visible} index={viewing} onIndex={setViewing} onClose={() => setViewing(null)} /> : null}
    </div>
  );
}
