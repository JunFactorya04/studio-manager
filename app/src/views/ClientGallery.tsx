import { useState } from "react";
import { Header } from "../components/Header";
import { Icon } from "../components/Icon";
import { Field } from "../components/Sheet";
import { actions, addDays, clientOf, fmtDate, today, useData, type Project } from "../store";
import { fileUrl } from "../native";
import type { Go } from "../nav";

type Filter = "all" | "picked" | "unpicked";

// Studio side: set up the selection gallery and copy the result for Lightroom.
// Client side ("Xem như khách"): heart photos up to the package limit, then submit.
export function ClientGallery({ project: p, go }: { project: Project; go: Go }) {
  const d = useData();
  const [mode, setMode] = useState<"manage" | "client">("manage");
  const [filter, setFilter] = useState<Filter>("all");
  const [viewing, setViewing] = useState<number | null>(null);
  const [copied, setCopied] = useState("");
  const [form, setForm] = useState({
    limit: p.gallery?.limit ?? p.pkgPhotos,
    password: p.gallery?.password ?? Math.random().toString(36).slice(2, 8),
    expires: p.gallery?.expires ?? addDays(today(), 14),
  });
  const [error, setError] = useState("");

  const client = clientOf(d, p.clientId);
  // Clients choose from the photos the studio kept; rejected ones never show.
  const pool = d.assets.filter((a) => a.projectId === p.id && a.mark !== "reject");
  const picked = pool.filter((a) => a.picked);
  const limit = p.gallery?.limit ?? form.limit;
  const shown = pool.filter((a) => filter === "all" || (filter === "picked" ? a.picked : !a.picked));
  const submitted = !!p.gallery?.submittedAt;

  const save = () => {
    if (!(form.limit > 0)) return setError("Số ảnh được chọn phải lớn hơn 0.");
    setError("");
    const first = !p.gallery;
    actions.updateProject(p.id, { gallery: { ...p.gallery, ...form, sentAt: p.gallery?.sentAt } });
    if (first) actions.logActivity(p.id, `Tạo bộ chọn ảnh (${form.limit} ảnh)`);
  };

  const inviteText = () =>
    `Chào ${client?.name ?? "anh/chị"}, ảnh "${p.name}" đã sẵn sàng để chọn. ` +
    `Anh/chị chọn tối đa ${limit} ảnh trước ngày ${fmtDate(p.gallery?.expires ?? form.expires)}. Mật khẩu: ${p.gallery?.password ?? form.password}`;

  const send = () => {
    if (!p.gallery) save();
    actions.updateProject(p.id, { gallery: { ...form, ...p.gallery, sentAt: today() } });
    if (p.stage !== "review" && p.stage !== "delivered") actions.setStage(p.id, "review");
    actions.sendMessage(p.clientId, inviteText());
    actions.logActivity(p.id, "Gửi lời mời chọn ảnh cho khách");
    go({ view: "inbox", clientId: p.clientId });
  };

  const copy = async (text: string, what: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(what); setTimeout(() => setCopied(""), 2000); }
    catch { setCopied("Không sao chép được"); }
  };

  const toggle = (id: string, on: boolean) => {
    if (submitted) return;
    if (on && picked.length >= limit) return;
    actions.updateAsset(id, { picked: on });
  };

  const submit = () => {
    actions.updateProject(p.id, { gallery: { ...form, ...p.gallery, submittedAt: today() } });
    actions.logActivity(p.id, `Khách gửi lựa chọn: ${picked.length} ảnh`);
  };

  const names = picked.map((a) => a.base);

  if (mode === "client") {
    const a = viewing !== null ? shown[viewing] : null;
    return (
      <div className="gallery-client">
        <div className="gc-top">
          <button className="icon-btn" aria-label="Thoát chế độ khách" onClick={() => setMode("manage")}><Icon name="x" /></button>
          <span className="gc-brand">{d.settings.studioName.toUpperCase()}</span>
          <span style={{ width: 40 }} />
        </div>
        <div className="gc-head">
          <h1>{p.name}</h1>
          <p>{pool.length} ảnh · chọn tối đa {limit} ảnh · hạn {fmtDate(p.gallery?.expires ?? form.expires)}</p>
        </div>
        <div className="segmented" role="tablist" aria-label="Lọc ảnh" style={{ alignSelf: "center" }}>
          {([["all", "Tất cả"], ["picked", `Đã chọn ${picked.length}`], ["unpicked", "Chưa chọn"]] as const).map(([id, label]) => (
            <button key={id} role="tab" aria-selected={filter === id} className={filter === id ? "on" : ""} onClick={() => setFilter(id)}>{label}</button>
          ))}
        </div>
        <div className="gc-grid">
          {shown.map((x, i) => {
            const src = fileUrl(x.thumbPath) ?? fileUrl(x.jpgPath);
            return (
              <div key={x.id} className={"gc-tile" + (x.picked ? " on" : "")} style={{ background: x.color }}>
                <button className="tile-open" onClick={() => setViewing(i)} aria-label={`Xem ${x.base}`}>
                  {src ? <img src={src} alt="" loading="lazy" /> : null}
                  <span className="watermark" aria-hidden="true">© {d.settings.studioName}</span>
                </button>
                <button className="heart" aria-pressed={x.picked} aria-label={x.picked ? `Bỏ chọn ${x.base}` : `Chọn ${x.base}`} onClick={() => toggle(x.id, !x.picked)} disabled={submitted || (!x.picked && picked.length >= limit)}>
                  <Icon name="heart" size={18} stroke={2.2} />
                </button>
              </div>
            );
          })}
        </div>
        {shown.length === 0 ? <p className="empty">Không có ảnh.</p> : null}
        <div className="gc-bar">
          <div className="gc-count">
            <strong>{picked.length} / {limit} ảnh</strong>
            <span className="meter"><span style={{ width: Math.min(100, (picked.length / limit) * 100) + "%", background: "var(--accent)" }} /></span>
          </div>
          {submitted ? <span className="badge tone-green">Đã gửi {fmtDate(p.gallery!.submittedAt!)}</span> : (
            <button className="btn primary sm" onClick={submit} disabled={picked.length === 0}>Gửi lựa chọn</button>
          )}
        </div>
        {a ? (
          <div className="viewer" role="dialog" aria-modal="true" aria-label={a.base} onKeyDown={(e) => {
            if (e.key === "Escape") setViewing(null);
            if (e.key === "ArrowRight") setViewing(Math.min(viewing! + 1, shown.length - 1));
            if (e.key === "ArrowLeft") setViewing(Math.max(viewing! - 1, 0));
          }} tabIndex={-1} ref={(el) => el?.focus()}>
            <div className="viewer-top">
              <button className="viewer-btn" onClick={() => setViewing(null)} aria-label="Đóng"><Icon name="x" size={20} /></button>
              <span>{viewing! + 1}/{shown.length}</span>
            </div>
            <div className="viewer-stage">
              <button className="viewer-nav" onClick={() => setViewing(Math.max(viewing! - 1, 0))} disabled={viewing === 0} aria-label="Ảnh trước"><Icon name="chevronLeft" size={28} /></button>
              <div className="wm-wrap">
                {fileUrl(a.jpgPath) ?? fileUrl(a.thumbPath) ? <img src={fileUrl(a.jpgPath) ?? fileUrl(a.thumbPath)} alt="" /> : <div className="viewer-ph" style={{ background: a.color }} />}
                <span className="watermark big" aria-hidden="true">© {d.settings.studioName}</span>
              </div>
              <button className="viewer-nav" onClick={() => setViewing(Math.min(viewing! + 1, shown.length - 1))} disabled={viewing === shown.length - 1} aria-label="Ảnh sau"><Icon name="chevronRight" size={28} /></button>
            </div>
            <div className="viewer-bar">
              <button className={"mark keep" + (a.picked ? " on" : "")} onClick={() => toggle(a.id, !a.picked)} disabled={submitted || (!a.picked && picked.length >= limit)}>
                <Icon name="heart" size={18} stroke={2.4} />{a.picked ? "Đã chọn" : "Chọn ảnh này"}
              </button>
              <small>{picked.length}/{limit} ảnh</small>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="page">
      <Header
        title="Khách chọn ảnh"
        eyebrow={p.name}
        back={{ label: p.name, onClick: () => go({ view: "projects", projectId: p.id }) }}
        actions={<button className="btn tinted sm" onClick={() => setMode("client")} disabled={pool.length === 0}><Icon name="eye" size={16} />Xem như khách</button>}
      />

      <div className="two-col">
        <div className="col">
          <section className="card pad" aria-label="Cài đặt">
            <h2 className="card-title">Cài đặt bộ chọn ảnh</h2>
            <div className="f-row">
              <Field label="Số ảnh khách được chọn" error={error}>
                <input className="input" type="number" min={1} value={form.limit} onChange={(e) => setForm({ ...form, limit: Number(e.target.value) })} />
              </Field>
              <Field label="Hạn chọn"><input className="input" type="date" value={form.expires} onChange={(e) => setForm({ ...form, expires: e.target.value })} /></Field>
            </div>
            <Field label="Mật khẩu" hint="Gửi kèm cho khách cùng link">
              <input className="input" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </Field>
            <div className="toolbar">
              <button className="btn primary sm" onClick={save}>{p.gallery ? "Lưu thay đổi" : "Tạo bộ chọn ảnh"}</button>
              <button className="btn tinted sm" onClick={send} disabled={pool.length === 0}><Icon name="send" size={18} />Gửi lời mời qua tin nhắn</button>
            </div>
            <p className="f-hint">
              Khách chọn từ {pool.length} ảnh đã được giữ lại (ảnh bị loại không hiện). Link xem trên điện thoại của khách cần máy chủ cloud,
              sẽ có ở bước sau. Hiện tại khách chọn trực tiếp tại studio bằng nút "Xem như khách".
            </p>
          </section>

          <section className="card list" aria-label="Trạng thái">
            <div className="kv"><span>Trạng thái</span><span>{submitted ? `Khách đã gửi ${fmtDate(p.gallery!.submittedAt!)}` : p.gallery?.sentAt ? `Đã mời ${fmtDate(p.gallery.sentAt)}` : p.gallery ? "Chưa gửi" : "Chưa tạo"}</span></div>
            <div className="kv"><span>Đã chọn</span><span>{picked.length} / {limit} ảnh</span></div>
            <div className="kv"><span>Khách hàng</span><span>{client?.name ?? "—"}</span></div>
            {submitted ? (
              <button className="kv" onClick={() => actions.updateProject(p.id, { gallery: { ...p.gallery!, submittedAt: undefined } })}>
                <span>Cho khách sửa lại</span><span className="kv-link">Mở lại <Icon name="chevronRight" size={16} /></span>
              </button>
            ) : null}
          </section>
        </div>

        <div className="col">
          <section className="card pad" aria-label="Danh sách đã chọn">
            <div className="section-head"><h2>Ảnh khách đã chọn</h2><small>{picked.length} ảnh</small></div>
            {picked.length ? (
              <>
                <div className="mini-grid">
                  {picked.slice(0, 7).map((a) => {
                    const src = fileUrl(a.thumbPath);
                    return <span key={a.id} style={{ background: a.color }}>{src ? <img src={src} alt="" /> : null}</span>;
                  })}
                  <span className="more">{picked.length > 7 ? "+" + (picked.length - 7) : ""}</span>
                </div>
                <div className="toolbar">
                  <button className="chip-btn" onClick={() => copy(names.join(", "), "Đã chép danh sách tên")}><Icon name="copy" size={16} />Chép tên file</button>
                  <button className="chip-btn" onClick={() => copy(names.join(" "), "Đã chép cho Lightroom")}><Icon name="copy" size={16} />Chép cho Lightroom</button>
                  <button className="chip-btn" onClick={() => {
                    const blob = new Blob([["Tên file", ...names].join("\n")], { type: "text/csv" });
                    const url = URL.createObjectURL(blob); const link = document.createElement("a");
                    link.href = url; link.download = `${p.name}-khach-chon.csv`; link.click(); URL.revokeObjectURL(url);
                  }}><Icon name="download" size={16} />Tải CSV</button>
                </div>
                {copied ? <small className="success" role="status">{copied}</small> : null}
                <p className="f-hint">Trong Lightroom: Library → Filter → Text → Filename → Contains, dán danh sách vừa chép để lọc đúng các ảnh khách chọn.</p>
              </>
            ) : <p className="f-hint">Khách chưa chọn ảnh nào.</p>}
          </section>
        </div>
      </div>
    </div>
  );
}
