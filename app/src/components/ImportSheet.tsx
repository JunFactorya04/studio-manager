import { useState } from "react";
import { Field, Sheet } from "./Sheet";
import { Icon } from "./Icon";
import { STAGES, actions, useData, type Project } from "../store";
import { fmtBytes, importItems, isDesktop, joinPath, pickFolder, scanSource, sep, slug, type ImportResult, type Progress, type ScanResult } from "../native";

type Step = "source" | "review" | "running" | "done";

const defaultDest = (nasRoot: string, p: Project) =>
  nasRoot ? joinPath(nasRoot, p.date.slice(0, 4), `${p.date.slice(5)}_${slug(p.name)}`) : "";

const newName = (pattern: string, p: Project, n: number, orig: string) =>
  pattern
    .replace("{date}", p.date)
    .replace("{project}", slug(p.name))
    .replace("{n}", String(n).padStart(4, "0"))
    .replace("{orig}", orig);

// Card → NAS import: pick the card folder, review what was found, copy with checksum, add to the project.
export function ImportSheet({ projectId, onClose, onDone }: { projectId?: string; onClose: () => void; onDone: (projectId: string) => void }) {
  const d = useData();
  const [step, setStep] = useState<Step>("source");
  const [source, setSource] = useState("");
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [pid, setPid] = useState(projectId ?? d.projects.find((p) => p.stage === "shoot" || p.stage === "cull")?.id ?? d.projects[0]?.id ?? "");
  const project = d.projects.find((p) => p.id === pid);
  const [dest, setDest] = useState(project ? defaultDest(d.settings.nasRoot, project) : "");
  const [rename, setRename] = useState(true);
  const [pattern, setPattern] = useState(d.settings.renamePattern);
  const [thumbs, setThumbs] = useState(true);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const chooseSource = async () => {
    const dir = await pickFolder("Chọn thư mục thẻ nhớ (DCIM)");
    if (!dir) return;
    setSource(dir); setError(""); setBusy(true);
    try {
      const r = await scanSource(dir);
      if (r.items.length === 0) { setError("Không tìm thấy ảnh RAW hoặc JPG trong thư mục này."); setScan(null); }
      else { setScan(r); setStep("review"); }
    } catch (e) { setError(String(e)); } finally { setBusy(false); }
  };

  const chooseDest = async () => {
    const dir = await pickFolder("Chọn thư mục lưu trên NAS");
    if (dir) setDest(dir);
  };

  const changeProject = (id: string) => {
    setPid(id);
    const p = d.projects.find((x) => x.id === id);
    if (p) setDest(defaultDest(d.settings.nasRoot, p));
  };

  const start = async () => {
    if (!project || !scan) return;
    if (!dest) return setError("Chọn thư mục lưu trên NAS.");
    setError(""); setStep("running");
    const items = scan.items.map((it, i) => ({ raw: it.raw, jpg: it.jpg, newBase: rename ? newName(pattern, project, i + 1, it.base) : it.base }));
    try {
      const r = await importItems({ items, dest, makeThumbs: thumbs }, setProgress);
      const existing = new Set(d.assets.filter((a) => a.projectId === project.id).map((a) => a.base));
      actions.addAssets(
        r.imported.filter((it) => !existing.has(it.base)).map((it) => ({
          projectId: project.id, base: it.base, rawPath: it.rawPath ?? undefined, jpgPath: it.jpgPath ?? undefined,
          thumbPath: it.thumbPath ?? undefined, bytes: it.bytes, checksum: it.checksum, rating: 0, mark: "none", picked: false,
        })),
      );
      const cullIdx = STAGES.findIndex((s) => s.id === "cull");
      if (STAGES.findIndex((s) => s.id === project.stage) < cullIdx) actions.setStage(project.id, "cull");
      actions.updateProject(project.id, { nasPath: dest });
      actions.logActivity(project.id, `Nhập ${r.copied} ảnh từ thẻ${r.skipped ? `, bỏ qua ${r.skipped} ảnh trùng` : ""}`);
      if (!d.settings.nasRoot) {
        // Remember the NAS root when the destination follows <root>/<year>/<folder>.
        const parts = dest.split(/[\\/]/);
        if (parts.length > 2 && /^\d{4}$/.test(parts[parts.length - 2])) actions.updateSettings({ nasRoot: parts.slice(0, -2).join(sep(dest)) });
      }
      actions.updateSettings({ renamePattern: pattern });
      setResult(r); setStep("done");
    } catch (e) {
      setError(String(e)); setStep("review");
    }
  };

  const pct = progress && progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <Sheet title="Nhập ảnh từ thẻ nhớ" onClose={step === "running" ? () => {} : onClose} wide footer={
      step === "review" ? (
        <>
          <button className="btn ghost" onClick={() => setStep("source")}>Quay lại</button>
          <button className="btn primary sm" onClick={start} disabled={!project}>Nhập {scan?.items.length} ảnh</button>
        </>
      ) : step === "done" ? (
        <button className="btn primary sm" onClick={() => { onDone(pid); onClose(); }}>Xem trong thư viện</button>
      ) : undefined
    }>
      {!isDesktop ? (
        <div className="notice">
          <Icon name="sd" size={20} />
          <span>Nhập ảnh cần đọc thẻ nhớ và ổ NAS, nên chỉ chạy trong app desktop (Windows hoặc Mac), không chạy trên trình duyệt.</span>
        </div>
      ) : null}

      {step === "source" ? (
        <>
          <p className="f-hint">Cắm thẻ SD rồi chọn thư mục <code>DCIM</code> trên thẻ. App tìm mọi ảnh RAW và JPG, ghép cặp theo tên file.</p>
          <button className="drop-zone" onClick={chooseSource} disabled={!isDesktop || busy}>
            <Icon name="sd" size={28} />
            <strong>{busy ? "Đang quét…" : "Chọn thư mục thẻ nhớ"}</strong>
            {source ? <code>{source}</code> : <small>Ví dụ E:\DCIM</small>}
          </button>
          {error ? <p className="f-error" role="alert">{error}</p> : null}
        </>
      ) : null}

      {step === "review" && scan ? (
        <>
          <div className="scan-summary">
            <div><strong>{scan.items.length}</strong><small>ảnh</small></div>
            <div><strong>{scan.pairs}</strong><small>cặp RAW + JPG</small></div>
            <div><strong>{scan.rawOnly}</strong><small>chỉ RAW</small></div>
            <div><strong>{scan.jpgOnly}</strong><small>chỉ JPG</small></div>
            <div><strong>{fmtBytes(scan.bytes)}</strong><small>dung lượng</small></div>
          </div>
          <code className="path-line">{source}</code>
          <div className="f-row">
            <Field label="Dự án">
              <select className="select" value={pid} onChange={(e) => changeProject(e.target.value)}>
                {d.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <Field label="Lưu vào NAS" hint="Tạo sẵn 01_RAW và 02_JPG bên trong">
              <div className="path-pick">
                <input className="input" value={dest} onChange={(e) => setDest(e.target.value)} placeholder="Chọn thư mục trên NAS" />
                <button className="chip-btn" onClick={chooseDest}>Chọn</button>
              </div>
            </Field>
          </div>
          <div className="card list">
            <label className="toggle-row">
              <span><strong>Đặt tên theo mẫu</strong><small>{project ? newName(pattern, project, 1, scan.items[0].base) : ""}</small></span>
              <input type="checkbox" className="switch" checked={rename} onChange={(e) => setRename(e.target.checked)} />
            </label>
            {rename ? (
              <div className="toggle-row">
                <input className="input" value={pattern} onChange={(e) => setPattern(e.target.value)} aria-label="Mẫu tên file" />
                <small style={{ whiteSpace: "nowrap" }}>{"{date} {project} {n} {orig}"}</small>
              </div>
            ) : null}
            <label className="toggle-row">
              <span><strong>Tạo ảnh xem nhanh</strong><small>Ảnh nhỏ 480px từ JPG cho thư viện</small></span>
              <input type="checkbox" className="switch" checked={thumbs} onChange={(e) => setThumbs(e.target.checked)} />
            </label>
            <div className="toggle-row">
              <span><strong>Kiểm tra checksum</strong><small>Luôn bật. Ảnh đã có và giống hệt sẽ được bỏ qua, không bao giờ ghi đè.</small></span>
              <Icon name="shield" size={20} />
            </div>
          </div>
          {error ? <p className="f-error" role="alert">{error}</p> : null}
        </>
      ) : null}

      {step === "running" ? (
        <div className="import-run">
          <strong>Đang chép {progress?.done ?? 0} / {progress?.total ?? scan?.items.length}</strong>
          <span className="meter big"><span style={{ width: pct + "%" }} /></span>
          <small>{progress?.file || "Đang chuẩn bị…"} · {fmtBytes(progress?.bytesDone ?? 0)}</small>
          <p className="f-hint">Đừng rút thẻ nhớ cho đến khi xong.</p>
        </div>
      ) : null}

      {step === "done" && result ? (
        <div className="import-done">
          <div className={"result-badge" + (result.verified ? " ok" : " warn")}>
            <Icon name={result.verified ? "shield" : "x"} size={22} />
            <span>{result.verified ? "Đã kiểm tra checksum. Có thể xóa thẻ an toàn." : "Có tệp lỗi. Chưa nên xóa thẻ."}</span>
          </div>
          <div className="scan-summary">
            <div><strong>{result.copied}</strong><small>đã chép</small></div>
            <div><strong>{result.skipped}</strong><small>đã có, bỏ qua</small></div>
            <div><strong>{result.failures.length}</strong><small>lỗi</small></div>
          </div>
          {result.failures.length ? (
            <ul className="fail-list">
              {result.failures.slice(0, 20).map((f) => <li key={f.file}><code>{f.file}</code><small>{f.error}</small></li>)}
            </ul>
          ) : null}
          <code className="path-line">{dest}</code>
        </div>
      ) : null}
    </Sheet>
  );
}
