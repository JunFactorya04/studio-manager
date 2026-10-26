import { useCallback, useEffect, useRef, useState } from "react";
import { Header } from "../components/Header";
import { Icon } from "../components/Icon";
import { checkLut, fmtBytes, gradePreview, isDesktop, joinPath, listPhotos, photoThumb, pickFiles, pickFolder, processImage, readGrade, writeGrades, type PhotoEntry } from "../native";
import { GROUPS, GROUP_LABEL, defaultGrade, isNeutral, mergeGroups, normalizeGrade, type Grade, type GroupKey } from "../grade";
import { opsActions, presetsOf, useOps } from "../opsStore";

const errText = (e: unknown) => (typeof e === "string" ? e : e instanceof Error ? e.message : "Lỗi không rõ");
const LS_DIR = "studio-manager-grade-dir";
const lsGet = (k: string) => { try { return localStorage.getItem(k) ?? ""; } catch { return ""; } };
const lsSet = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } };

// ---- thumbnails: load a few at a time, only for cards that are on screen ----
const thumbCache = new Map<string, string>();
let thumbActive = 0;
const thumbQueue: (() => void)[] = [];
function pumpThumbs() {
  while (thumbActive < 3 && thumbQueue.length) { thumbActive++; thumbQueue.shift()!(); }
}
function loadThumb(path: string, stamp: number): Promise<string> {
  const key = `${path}|${stamp}`;
  const hit = thumbCache.get(key);
  if (hit) return Promise.resolve(hit);
  return new Promise((resolve, reject) => {
    thumbQueue.push(() => {
      photoThumb(path, 240).then((u) => { thumbCache.set(key, u); resolve(u); }, reject).finally(() => { thumbActive--; pumpThumbs(); });
    });
    pumpThumbs();
  });
}

function Thumb({ p }: { p: PhotoEntry }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [url, setUrl] = useState<string | undefined>(thumbCache.get(`${p.path}|${p.modifiedMs}`));
  const [bad, setBad] = useState(false);
  useEffect(() => {
    if (url || !ref.current) return;
    let alive = true;
    const io = new IntersectionObserver((en) => {
      if (en.some((x) => x.isIntersecting)) { io.disconnect(); loadThumb(p.path, p.modifiedMs).then((u) => alive && setUrl(u)).catch(() => alive && setBad(true)); }
    }, { rootMargin: "200px" });
    io.observe(ref.current);
    return () => { alive = false; io.disconnect(); };
  }, [p.path, p.modifiedMs, url]);
  return <span ref={ref} className="gr-thumb">{url ? <img src={url} alt="" draggable={false} /> : <small>{bad ? "Lỗi" : ""}</small>}</span>;
}

function Slider({ label, value, min, max, step, unit, onChange }: { label: string; value: number; min: number; max: number; step: number; unit?: string; onChange: (v: number) => void }) {
  const shown = step < 1 ? value.toFixed(2) : String(Math.round(value));
  return (
    <label className="gr-slider" onDoubleClick={() => onChange(0)} title="Bấm đúp để đặt lại">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} />
      <output className={Math.abs(value) < 1e-4 ? "zero" : ""}>{shown}{unit ?? ""}</output>
    </label>
  );
}

export function GradeView() {
  const o = useOps();
  const presets = presetsOf(o);
  const [dir, setDir] = useState(lsGet(LS_DIR));
  const [photos, setPhotos] = useState<PhotoEntry[]>([]);
  const [sel, setSel] = useState<string[]>([]);
  const [active, setActive] = useState<string>("");
  const [grade, setGrade] = useState<Grade>(defaultGrade());
  const [url, setUrl] = useState<string>("");
  const [before, setBefore] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [clip, setClip] = useState<Grade | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteGroups, setPasteGroups] = useState<GroupKey[]>(["light", "color", "effect"]);
  const [presetName, setPresetName] = useState("");
  const [busy, setBusy] = useState(false);
  const [exp, setExp] = useState({ outDir: "", edge: 2400, quality: 90 });
  const anchor = useRef("");
  const req = useRef(0);
  const pending = useRef<{ path: string; grade: Grade; timer?: number } | null>(null);

  const flush = useCallback(async () => {
    const p = pending.current;
    if (!p) return;
    window.clearTimeout(p.timer);
    pending.current = null;
    try {
      await writeGrades([p.path], p.grade);
      setPhotos((ps) => ps.map((x) => (x.path === p.path ? { ...x, edited: !isNeutral(p.grade) } : x)));
    } catch (e) { setErr(errText(e)); }
  }, []);

  const load = useCallback(async (d: string) => {
    if (!d.trim()) return;
    setErr(""); setMsg("");
    try {
      await flush();
      const list = await listPhotos(d.trim());
      setPhotos(list); setSel([]); setActive(""); setUrl("");
      lsSet(LS_DIR, d.trim());
      setExp((x) => ({ ...x, outDir: joinPath(d.trim(), "Xuat") }));
      if (list.length === 0) setMsg("Thư mục này chưa có ảnh JPG.");
    } catch (e) { setPhotos([]); setErr(errText(e)); }
  }, [flush]);

  useEffect(() => { if (isDesktop && dir) void load(dir); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // open a photo: load its saved edit
  const open = useCallback(async (path: string) => {
    await flush();
    setActive(path);
    try { const g = await readGrade(path); setGrade(normalizeGrade(g)); } catch { setGrade(defaultGrade()); }
  }, [flush]);

  const click = (e: React.MouseEvent, p: PhotoEntry) => {
    if (e.shiftKey && anchor.current) {
      const a = photos.findIndex((x) => x.path === anchor.current), b = photos.findIndex((x) => x.path === p.path);
      const [lo, hi] = a < b ? [a, b] : [b, a];
      setSel(photos.slice(lo, hi + 1).map((x) => x.path));
    } else if (e.metaKey || e.ctrlKey) {
      setSel((s) => (s.includes(p.path) ? s.filter((x) => x !== p.path) : [...s, p.path]));
      anchor.current = p.path;
    } else {
      setSel([p.path]); anchor.current = p.path;
    }
    void open(p.path);
  };

  // live preview: latest request wins
  useEffect(() => {
    if (!active) return;
    const my = ++req.current;
    const t = window.setTimeout(async () => {
      try {
        const u = await gradePreview(active, 1600, before ? defaultGrade() : grade);
        if (my !== req.current) { URL.revokeObjectURL(u); return; }
        setUrl((old) => { if (old) URL.revokeObjectURL(old); return u; });
        setErr("");
      } catch (e) { if (my === req.current) setErr(errText(e)); }
    }, 60);
    return () => window.clearTimeout(t);
  }, [active, grade, before]);

  useEffect(() => () => { void flush(); }, [flush]);

  const change = (g: Grade) => {
    setGrade(g);
    if (!active) return;
    if (pending.current) window.clearTimeout(pending.current.timer);
    const entry = { path: active, grade: g, timer: window.setTimeout(() => void flush(), 500) };
    pending.current = entry;
  };
  const set = (k: keyof Grade, v: number | string) => change({ ...grade, [k]: v } as Grade);

  const targets = sel.length ? sel : active ? [active] : [];
  const applyTo = async (g: Grade, paths: string[], label: string) => {
    if (!paths.length) return;
    setBusy(true); setErr("");
    try {
      await flush();
      await writeGrades(paths, g);
      setPhotos((ps) => ps.map((x) => (paths.includes(x.path) ? { ...x, edited: !isNeutral(g) } : x)));
      setMsg(`${label} cho ${paths.length} ảnh.`);
    } catch (e) { setErr(errText(e)); } finally { setBusy(false); }
  };
  const doPaste = async () => {
    if (!clip || !targets.length) return;
    setBusy(true); setErr("");
    try {
      await flush();
      for (const p of targets) {
        const cur = normalizeGrade(await readGrade(p));
        await writeGrades([p], mergeGroups(cur, clip, pasteGroups));
      }
      setPhotos((ps) => ps.map((x) => (targets.includes(x.path) ? { ...x, edited: true } : x)));
      if (targets.includes(active)) { const g = normalizeGrade(await readGrade(active)); setGrade(g); }
      setMsg(`Đã dán ${pasteGroups.map((k) => GROUP_LABEL[k]).join(", ")} cho ${targets.length} ảnh.`);
      setPasteOpen(false);
    } catch (e) { setErr(errText(e)); } finally { setBusy(false); }
  };

  const chooseLut = async () => {
    const f = await pickFiles("Chọn LUT (.cube)", ["cube"]);
    if (!f[0]) return;
    try { await checkLut(f[0]); change({ ...grade, lutPath: f[0] }); } catch (e) { setErr(errText(e)); }
  };

  const runExport = async () => {
    const list = sel.length ? sel : photos.map((p) => p.path);
    if (!list.length || !exp.outDir.trim()) return;
    setBusy(true); setErr(""); setMsg("");
    await flush();
    let done = 0; const fails: string[] = [];
    let next = 0;
    const worker = async () => {
      while (next < list.length) {
        const p = list[next++];
        try { await processImage(p, exp.outDir.trim(), exp.edge, exp.quality); } catch (e) { fails.push(`${p.split(/[\\/]/).pop()}: ${errText(e)}`); }
        done++; setMsg(`Đang xuất ${done}/${list.length}…`);
      }
    };
    await Promise.all([worker(), worker()]);
    setBusy(false);
    setMsg(`Đã xuất ${list.length - fails.length}/${list.length} ảnh vào ${exp.outDir}.`);
    if (fails.length) setErr(fails.slice(0, 3).join("\n") + (fails.length > 3 ? `\n…và ${fails.length - 3} lỗi khác` : ""));
  };

  const spotsWithDir = o.spots.filter((s) => s.captureDir.trim() || s.outputDir.trim());

  if (!isDesktop) {
    return (
      <div className="page ops-page">
        <Header title="Chỉnh ảnh" />
        <div className="card pad"><p className="empty">Chỉnh ảnh cần đọc thư mục trên máy, chỉ chạy trong bản app. Mở app bằng Mo-Studio.command (Mac) hoặc Mo-Studio.bat (Windows).</p></div>
      </div>
    );
  }

  return (
    <div className="page ops-page grade-page">
      <Header title="Chỉnh ảnh" eyebrow={photos.length ? `${photos.length} ảnh · ${photos.filter((p) => p.edited).length} đã chỉnh` : "JPG"} />
      <div className="card pad gr-bar">
        <input className="input" value={dir} onChange={(e) => setDir(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void load(dir)} placeholder="Thư mục ảnh JPG" />
        <button className="btn tinted" onClick={async () => { const p = await pickFolder("Thư mục ảnh cần chỉnh"); if (p) { setDir(p); void load(p); } }}>Chọn…</button>
        {spotsWithDir.length ? (
          <select className="select gr-spot" value="" onChange={(e) => { const s = o.spots.find((x) => x.id === e.target.value); if (s) { const d = s.captureDir.trim() || s.outputDir.trim(); setDir(d); void load(d); } }}>
            <option value="">Mở thư mục của điểm chụp…</option>
            {spotsWithDir.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        ) : null}
        <button className="chip-btn" onClick={() => void load(dir)}>Tải lại</button>
      </div>
      {err ? <p className="f-error gr-err">{err}</p> : null}
      {msg ? <p className="f-hint">{msg}</p> : null}

      <div className="gr-split">
        <div className="card gr-strip">
          {photos.length === 0 ? <p className="empty">Chọn thư mục có ảnh JPG.</p> : null}
          <div className="gr-grid">
            {photos.map((p) => (
              <button key={p.path} className={"gr-card" + (sel.includes(p.path) ? " sel" : "") + (active === p.path ? " active" : "")} onClick={(e) => click(e, p)} title={`${p.name} · ${fmtBytes(p.size)}`}>
                <Thumb p={p} />
                <span className="gr-name">{p.edited ? <i className="gr-dot" /> : null}{p.name}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="card gr-stage">
          {active ? (
            <>
              <div className="gr-img">{url ? <img src={url} alt="" draggable={false} /> : <small>Đang tạo bản xem trước…</small>}{before ? <span className="gr-tag">Gốc</span> : null}</div>
              <div className="gr-stage-bar">
                <button className={"chip-btn" + (before ? " on" : "")} onPointerDown={() => setBefore(true)} onPointerUp={() => setBefore(false)} onPointerLeave={() => setBefore(false)}>Giữ để xem ảnh gốc</button>
                <span className="muted small-line">{active.split(/[\\/]/).pop()}{sel.length > 1 ? ` · đang chọn ${sel.length} ảnh` : ""}</span>
              </div>
            </>
          ) : <p className="empty">Chọn một ảnh để chỉnh. Bấm giữ Shift hoặc Ctrl/Cmd để chọn nhiều ảnh.</p>}
        </div>

        <div className="card pad gr-panel">
          <div className="gr-preset">
            <select className="select" value="" onChange={(e) => { const p = presets.find((x) => x.id === e.target.value); if (p) change({ ...p.grade }); }}>
              <option value="">Áp preset…</option>
              {presets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <button className="chip-btn" disabled={!active} onClick={() => change(defaultGrade())}>Đặt lại</button>
          </div>
          {GROUPS.map((grp) => (
            <section key={grp.key} className="gr-group">
              <h4 className="insp-h">{grp.label}</h4>
              {grp.sliders.map((s) => <Slider key={s.key} label={s.label} value={grade[s.key]} min={s.min} max={s.max} step={s.step} unit={s.unit} onChange={(v) => set(s.key, v)} />)}
            </section>
          ))}
          <section className="gr-group">
            <h4 className="insp-h">LUT (.cube)</h4>
            <div className="f-row tight">
              <input className="input" value={grade.lutPath} onChange={(e) => set("lutPath", e.target.value)} placeholder="Đường dẫn tệp .cube" />
              <button className="btn tinted" onClick={() => void chooseLut()}>Chọn…</button>
            </div>
            {grade.lutPath ? <Slider label="Cường độ" value={grade.lutAmount} min={0} max={100} step={1} onChange={(v) => set("lutAmount", v)} /> : null}
          </section>

          <section className="gr-group">
            <h4 className="insp-h">Lưu preset</h4>
            <div className="f-row tight">
              <input className="input" value={presetName} onChange={(e) => setPresetName(e.target.value)} placeholder="Tên preset mới" />
              <button className="btn tinted" disabled={!presetName.trim()} onClick={() => { opsActions.savePreset(presetName, grade); setPresetName(""); setMsg("Đã lưu preset."); }}>Lưu</button>
            </div>
            <div className="gr-presets-list">
              {presets.filter((p) => !p.builtin).map((p) => (
                <span key={p.id} className="gr-tagrow">{p.name}<button className="as-link danger-link" onClick={() => opsActions.deletePreset(p.id)}>Xóa</button></span>
              ))}
            </div>
            <small className="muted">Preset gắn vào điểm chụp ở Sự kiện & Spot, ảnh nhận về sẽ tự được áp màu.</small>
          </section>

          <section className="gr-group">
            <h4 className="insp-h">Áp cho nhiều ảnh {targets.length ? `(${targets.length})` : ""}</h4>
            <div className="gr-actions">
              <button className="btn tinted" disabled={busy || !targets.length} onClick={() => void applyTo(grade, targets, "Đã áp chỉnh sửa hiện tại")}>Áp chỉnh sửa này cho ảnh đã chọn</button>
              <button className="chip-btn" disabled={!active} onClick={() => { setClip(grade); setMsg("Đã sao chép chỉnh sửa."); }}>Sao chép</button>
              <button className="chip-btn" disabled={!clip || !targets.length} onClick={() => setPasteOpen((v) => !v)}>Dán một phần…</button>
              <button className="chip-btn danger" disabled={busy || !targets.length} onClick={() => void applyTo(defaultGrade(), targets, "Đã đặt lại")}>Đặt lại ảnh đã chọn</button>
            </div>
            {pasteOpen ? (
              <div className="gr-paste">
                {(["light", "color", "effect", "lut"] as GroupKey[]).map((k) => (
                  <label key={k} className="gr-check"><input type="checkbox" checked={pasteGroups.includes(k)} onChange={(e) => setPasteGroups((g) => (e.target.checked ? [...g, k] : g.filter((x) => x !== k)))} />{GROUP_LABEL[k]}</label>
                ))}
                <button className="btn primary sm" disabled={busy || !pasteGroups.length} onClick={() => void doPaste()}>Dán cho {targets.length} ảnh</button>
              </div>
            ) : null}
          </section>

          <section className="gr-group">
            <h4 className="insp-h">Xuất JPG</h4>
            <div className="f-row tight">
              <input className="input" value={exp.outDir} onChange={(e) => setExp({ ...exp, outDir: e.target.value })} placeholder="Thư mục xuất" />
              <button className="btn tinted" onClick={async () => { const p = await pickFolder("Thư mục xuất"); if (p) setExp((x) => ({ ...x, outDir: p })); }}>Chọn…</button>
            </div>
            <div className="f-row tight">
              <label className="gr-num">Cạnh dài<input className="input" type="number" min={200} max={12000} value={exp.edge} onChange={(e) => setExp({ ...exp, edge: +e.target.value })} /></label>
              <label className="gr-num">Chất lượng<input className="input" type="number" min={40} max={100} value={exp.quality} onChange={(e) => setExp({ ...exp, quality: +e.target.value })} /></label>
            </div>
            <button className="btn primary" disabled={busy || !photos.length || !exp.outDir.trim()} onClick={() => void runExport()}>
              <Icon name="download" size={16} /> Xuất {sel.length ? `${sel.length} ảnh đã chọn` : `tất cả ${photos.length} ảnh`}
            </button>
            <small className="muted">Mỗi ảnh được xuất kèm chỉnh sửa riêng của nó. Ảnh gốc không bị thay đổi.</small>
          </section>
        </div>
      </div>
    </div>
  );
}
