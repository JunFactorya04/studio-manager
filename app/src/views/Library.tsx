import { useEffect, useState } from "react";
import { Header } from "../components/Header";
import { Icon } from "../components/Icon";
import { ImportSheet } from "../components/ImportSheet";
import { Viewer } from "../components/Viewer";
import { actions, fmtDate, useData, type Asset, type Mark } from "../store";
import { fileUrl, fmtBytes, isDesktop, pickFolder } from "../native";
import type { Go, Route } from "../nav";

type Tab = Mark | "all" | "picked";
const TABS: { id: Tab; label: string }[] = [
  { id: "all", label: "Tất cả" },
  { id: "none", label: "Chờ lọc" },
  { id: "keep", label: "Giữ" },
  { id: "reject", label: "Loại" },
  { id: "picked", label: "Khách chọn" },
];
const loadSize = () => { try { return Number(localStorage.getItem("lib-tile")) || 150; } catch { return 150; } };

export function Library({ go, route }: { go: Go; route?: Route }) {
  const d = useData();
  const [projectId, setProjectId] = useState<string>(route?.projectId ?? route?.importFor ?? "all");
  const [tab, setTab] = useState<Tab>(route?.photos ?? "all");
  const [minStars, setMinStars] = useState(0);
  const [size, setSizeState] = useState(loadSize);
  const [importing, setImporting] = useState(!!route?.importFor);
  const [viewing, setViewing] = useState<number | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => { if (route?.importFor) setImporting(true); }, [route?.importFor]);
  const setSize = (n: number) => { setSizeState(n); try { localStorage.setItem("lib-tile", String(n)); } catch { /* ignore */ } };

  const scoped = d.assets.filter((a) => projectId === "all" || a.projectId === projectId);
  const visible = scoped.filter((a) => (tab === "all" || (tab === "picked" ? a.picked : a.mark === tab)) && a.rating >= minStars);
  const projects = d.projects.filter((p) => visible.some((a) => a.projectId === p.id));
  const groups = projects.map((p) => ({ p, items: visible.filter((a) => a.projectId === p.id) }));
  const total = scoped.reduce((s, a) => s + a.bytes, 0);
  const counts: Record<Tab, number> = {
    all: scoped.length, none: scoped.filter((a) => a.mark === "none").length, keep: scoped.filter((a) => a.mark === "keep").length,
    reject: scoped.filter((a) => a.mark === "reject").length, picked: scoped.filter((a) => a.picked).length,
  };
  const sel = d.assets.find((a) => a.id === selected);
  const title = tab === "all" ? "Thư viện" : TABS.find((t) => t.id === tab)!.label;

  // Keyboard culling on the grid too: P keep, X reject, U clear, 0–5 stars, Space opens the photo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!sel || viewing !== null || importing) return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      const k = e.key.toLowerCase();
      if (k === "p") actions.updateAsset(sel.id, { mark: "keep" });
      else if (k === "x") actions.updateAsset(sel.id, { mark: "reject" });
      else if (k === "u") actions.updateAsset(sel.id, { mark: "none" });
      else if (/^[0-5]$/.test(k)) actions.updateAsset(sel.id, { rating: Number(k) });
      else if (k === " ") setViewing(visible.indexOf(sel));
      else if (k === "arrowright" || k === "arrowleft") {
        const i = visible.indexOf(sel) + (k === "arrowright" ? 1 : -1);
        if (visible[i]) setSelected(visible[i].id);
      } else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sel, visible, viewing, importing]);

  const chooseNas = async () => {
    const dir = await pickFolder("Chọn thư mục gốc trên NAS");
    if (dir) actions.updateSettings({ nasRoot: dir });
  };

  return (
    <div className="page lib-page">
      <Header
        title={title}
        eyebrow={`${visible.length.toLocaleString("vi-VN")} ảnh · ${fmtBytes(total)}`}
        center={
          <div className="segmented" role="tablist" aria-label="Lọc ảnh">
            {TABS.map((t) => (
              <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? "on" : ""} onClick={() => setTab(t.id)}>
                {t.label}{t.id !== "all" && counts[t.id] ? <span className="seg-n">{counts[t.id]}</span> : null}
              </button>
            ))}
          </div>
        }
        actions={
          <>
            <label className="zoom" title="Cỡ ảnh">
              <Icon name="grid" size={13} />
              <span className="sr-only">Cỡ ảnh</span>
              <input type="range" min={90} max={300} step={10} value={size} onChange={(e) => setSize(Number(e.target.value))} />
            </label>
            <button className="icon-btn primary" aria-label="Nhập ảnh từ thẻ nhớ" title="Nhập ảnh từ thẻ nhớ" onClick={() => setImporting(true)}><Icon name="sd" /></button>
          </>
        }
      />

      <div className="lib-bar">
        <label className="sr-only" htmlFor="lib-project">Dự án</label>
        <select id="lib-project" className="select" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          <option value="all">Tất cả dự án</option>
          {d.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <label className="sr-only" htmlFor="lib-stars">Số sao tối thiểu</label>
        <select id="lib-stars" className="select" value={minStars} onChange={(e) => setMinStars(Number(e.target.value))}>
          <option value={0}>Mọi số sao</option>
          {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{"★".repeat(n)} trở lên</option>)}
        </select>
        <span className="lib-nas" title={d.settings.nasRoot || undefined}>
          <Icon name="server" size={14} />
          <code>{d.settings.nasRoot || "Chưa chọn thư mục NAS"}</code>
          {isDesktop ? <button className="link" onClick={chooseNas}>{d.settings.nasRoot ? "Đổi" : "Chọn"}</button> : null}
        </span>
        <span className="lib-keys">P giữ · X loại · 1–5 sao · Space xem lớn</span>
      </div>

      <div className="lib-split">
        <div className="lib-main" style={{ ["--tile" as string]: size + "px" }}>
          {groups.map(({ p, items }) => (
            <section key={p.id} className="lib-group">
              <button className="group-head" onClick={() => go({ view: "projects", projectId: p.id })}>
                <strong>{p.name}</strong>
                <small>{fmtDate(p.date)} · {items.length} ảnh</small>
              </button>
              <div className="photo-grid">
                {items.map((a) => <Tile key={a.id} a={a} selected={a.id === selected} onSelect={() => setSelected(a.id)} onOpen={() => setViewing(visible.indexOf(a))} />)}
              </div>
            </section>
          ))}
          {groups.length === 0 ? (
            <div className="empty-state">
              <Icon name="photo" size={32} />
              <p>{scoped.length ? "Không có ảnh nào khớp bộ lọc." : "Chưa có ảnh. Nhập ảnh từ thẻ nhớ để bắt đầu."}</p>
              {!scoped.length ? <button className="btn primary sm" onClick={() => setImporting(true)}><Icon name="sd" size={16} />Nhập ảnh</button> : null}
            </div>
          ) : null}
        </div>

        <aside className="inspector card lib-insp" aria-label="Thông tin ảnh">
          {sel ? <PhotoInfo a={sel} onOpen={() => setViewing(visible.indexOf(sel))} /> : <p className="empty">Chọn một ảnh để xem thông tin.</p>}
        </aside>
      </div>

      {importing ? (
        <ImportSheet
          projectId={route?.importFor ?? (projectId !== "all" ? projectId : undefined)}
          onClose={() => setImporting(false)}
          onDone={(pid) => { setProjectId(pid); setTab("all"); }}
        />
      ) : null}
      {viewing !== null && viewing >= 0 ? <Viewer assets={visible} index={viewing} onIndex={setViewing} onClose={() => setViewing(null)} /> : null}
    </div>
  );
}

function Tile({ a, selected, onSelect, onOpen }: { a: Asset; selected: boolean; onSelect: () => void; onOpen: () => void }) {
  const src = fileUrl(a.thumbPath) ?? fileUrl(a.jpgPath);
  const phone = typeof window !== "undefined" && window.matchMedia("(max-width: 760px)").matches;
  return (
    <div className={"tile" + (a.mark === "reject" ? " rejected" : "") + (selected ? " sel" : "")} style={{ background: a.color }}>
      <button
        className="tile-open"
        aria-label={`${a.base}: ${a.mark === "keep" ? "giữ" : a.mark === "reject" ? "loại" : "chưa xem"}${a.rating ? `, ${a.rating} sao` : ""}`}
        aria-pressed={selected}
        onClick={phone ? onOpen : onSelect}
        onDoubleClick={onOpen}
      >
        {src ? <img src={src} alt="" loading="lazy" draggable={false} /> : null}
      </button>
      <span className="tile-tag">{a.rawPath || !a.jpgPath ? "RAW" : "JPG"}</span>
      <button className={"tile-mark keep" + (a.mark === "keep" ? " on" : "")} aria-pressed={a.mark === "keep"} aria-label="Giữ" onClick={() => actions.updateAsset(a.id, { mark: a.mark === "keep" ? "none" : "keep" })}>
        <Icon name="check" size={12} stroke={3} />
      </button>
      <button className={"tile-mark reject" + (a.mark === "reject" ? " on" : "")} aria-pressed={a.mark === "reject"} aria-label="Loại" onClick={() => actions.updateAsset(a.id, { mark: a.mark === "reject" ? "none" : "reject" })}>
        <Icon name="x" size={11} stroke={3} />
      </button>
      {a.rating ? <span className="tile-stars">{"★".repeat(a.rating)}</span> : null}
      {a.picked ? <span className="tile-heart" aria-label="Khách đã chọn"><Icon name="heart" size={12} stroke={2.4} /></span> : null}
    </div>
  );
}

function PhotoInfo({ a, onOpen }: { a: Asset; onOpen: () => void }) {
  const d = useData();
  const p = d.projects.find((x) => x.id === a.projectId);
  const src = fileUrl(a.thumbPath) ?? fileUrl(a.jpgPath);
  return (
    <div className="insp">
      <button className="insp-photo" style={{ background: a.color }} onClick={onOpen} aria-label="Xem lớn">
        {src ? <img src={src} alt="" /> : null}
      </button>
      <div className="insp-title"><strong>{a.base}</strong></div>
      <div className="stars light" role="group" aria-label="Đánh giá sao">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} className={n <= a.rating ? "on" : ""} onClick={() => actions.updateAsset(a.id, { rating: a.rating === n ? 0 : n })} aria-label={`${n} sao`}>
            <Icon name="star" size={16} />
          </button>
        ))}
      </div>
      <div className="segmented full" role="group" aria-label="Đánh dấu">
        {([["none", "Chưa xem"], ["keep", "Giữ"], ["reject", "Loại"]] as const).map(([m, l]) => (
          <button key={m} className={a.mark === m ? "on" : ""} onClick={() => actions.updateAsset(a.id, { mark: m })}>{l}</button>
        ))}
      </div>
      <dl className="insp-kv">
        <dt>Dự án</dt><dd>{p?.name ?? "—"}</dd>
        <dt>Loại tệp</dt><dd>{a.rawPath ? "RAW + JPG" : "JPG"}</dd>
        <dt>Dung lượng</dt><dd>{fmtBytes(a.bytes)}</dd>
        <dt>Khách chọn</dt><dd>{a.picked ? "Có" : "Không"}</dd>
        {a.rawPath ? <><dt>RAW</dt><dd title={a.rawPath}><code>{a.rawPath}</code></dd></> : null}
        {a.jpgPath ? <><dt>JPG</dt><dd title={a.jpgPath}><code>{a.jpgPath}</code></dd></> : null}
        {a.checksum ? <><dt>SHA-256</dt><dd title={a.checksum}><code>{a.checksum.slice(0, 16)}…</code></dd></> : null}
      </dl>
      <button className="btn tinted" onClick={onOpen}><Icon name="eye" size={15} />Xem lớn</button>
    </div>
  );
}
