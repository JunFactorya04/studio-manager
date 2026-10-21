import { useState } from "react";
import { Icon } from "../components/Icon";
import { Confirm } from "../components/Sheet";
import { ProjectForm } from "../components/ProjectForm";
import { InvoiceForm, PaymentForm } from "../components/MoneyForms";
import {
  STAGES, STAGE_TONE, actions, clientOf, daysBetween, fmtDate, invoiceStatus, money, paidFor, projectPaid, today, useData,
  type Invoice, type Project,
} from "../store";
import { coverOf, projectNote, stageIndex } from "../projectInfo";
import type { Go } from "../nav";

const CHANNEL_LABEL = { line: "LINE", messenger: "Messenger", zalo: "Zalo", email: "Email" } as const;
const STATUS = { paid: ["Đã thu", "green"], overdue: ["Quá hạn", "red"], pending: ["Chờ thanh toán", "orange"] } as const;

export function ProjectDetail({ project: p, go }: { project: Project; go: Go }) {
  const d = useData();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [newInvoice, setNewInvoice] = useState(false);
  const [paying, setPaying] = useState<Invoice | null>(null);

  const client = clientOf(d, p.clientId);
  const idx = stageIndex(p);
  const next = STAGES[idx + 1];
  const note = projectNote(d, p);
  const assets = d.assets.filter((a) => a.projectId === p.id);
  const kept = assets.filter((a) => a.mark === "keep").length;
  const picked = assets.filter((a) => a.picked).length;
  const invoices = d.invoices.filter((i) => i.projectId === p.id);
  const paid = projectPaid(d, p.id);
  const paidPct = p.total > 0 ? Math.min(100, Math.round((paid / p.total) * 100)) : 0;
  const activity = d.activity.filter((a) => a.projectId === p.id).slice(0, 8);
  const daysLeft = daysBetween(today(), p.deadline);

  return (
    <div className="page">
      <header className="page-header" data-tauri-drag-region>
        <button className="icon-btn" aria-label="Quay lại Dự án" onClick={() => go({ view: "projects" })}>
          <Icon name="chevronLeft" stroke={2.2} />
        </button>
        <div className="page-actions">
          <button className="icon-btn" aria-label="Nhắn tin cho khách" onClick={() => go({ view: "inbox", clientId: p.clientId })}>
            <Icon name="message" />
          </button>
          <button className="icon-btn" aria-label="Sửa dự án" onClick={() => setEditing(true)}>
            <Icon name="edit" />
          </button>
          <button className="icon-btn" aria-label="Xóa dự án" onClick={() => setDeleting(true)}>
            <Icon name="trash" />
          </button>
        </div>
      </header>

      <div className="detail-hero">
        <div className="hero-photos">
          <span style={{ background: coverOf(d, p) }} />
          <span style={{ background: assets[1]?.color ?? "#CBC3B8" }} />
          <span style={{ background: assets[2]?.color ?? "#E2DBD1" }} />
        </div>
        <div className="hero-text">
          <div className="hero-title">
            <h1>{p.name}</h1>
            <span className={"badge tone-" + STAGE_TONE[p.stage]}>{STAGES[idx].label}</span>
          </div>
          <p>{p.type} · {fmtDate(p.date)} {p.time} · {p.location || "Chưa có địa điểm"}</p>
        </div>
      </div>

      <div className="two-col">
        <div className="col">
          <section className="card pad" aria-label="Tiến độ">
            <ol className="stepper">
              {STAGES.map((s, i) => {
                const state = p.stage === "delivered" || i < idx ? "done" : i === idx ? "now" : "todo";
                return (
                  <li key={s.id} className={state}>
                    <button className="step-btn" onClick={() => actions.setStage(p.id, s.id)} aria-label={`Chuyển sang ${s.label}`} aria-current={i === idx ? "step" : undefined}>
                      <span className="dot">{state === "done" ? <Icon name="check" size={13} stroke={3} /> : null}</span>
                      <span>{s.short}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
            <div className={"callout" + (note.danger ? " danger" : "")}>{note.text}</div>
            {next ? (
              <button className="btn primary" onClick={() => actions.setStage(p.id, next.id)}>
                Chuyển sang: {next.label} <Icon name="chevronRight" size={18} stroke={2.2} />
              </button>
            ) : null}
          </section>

          <section className="card list" aria-label="Thông tin">
            <div className="kv"><span>Khách hàng</span><span>{client?.name ?? "—"}</span></div>
            {client?.phone ? <div className="kv"><span>Điện thoại</span><span>{client.phone}</span></div> : null}
            <div className="kv"><span>Gói dịch vụ</span><span>{p.pkgName || "—"} · {p.pkgPhotos} ảnh chỉnh</span></div>
            <div className="kv"><span>Người chụp</span><span>{p.photographers || "—"}</span></div>
            <div className="kv"><span>Thời lượng</span><span>{p.durationH} giờ</span></div>
            <div className="kv">
              <span>Hạn giao ảnh</span>
              <span className={p.stage !== "delivered" && daysLeft < 0 ? "danger" : ""}>
                {fmtDate(p.deadline)}{p.stage !== "delivered" ? ` · ${daysLeft >= 0 ? `còn ${daysLeft} ngày` : `trễ ${-daysLeft} ngày`}` : ""}
              </span>
            </div>
            {client ? (
              <button className="kv" onClick={() => go({ view: "inbox", clientId: client.id })}>
                <span>Liên hệ</span>
                <span className="kv-link">
                  <span className="mini-badge">{CHANNEL_LABEL[client.channel]}</span>
                  Nhắn tin <Icon name="chevronRight" size={16} />
                </span>
              </button>
            ) : null}
            {p.note ? <div className="kv note"><span>Ghi chú</span><span>{p.note}</span></div> : null}
          </section>

          <section className="card pad" aria-label="Thanh toán">
            <div className="section-head">
              <h2>Thanh toán</h2>
              <button className="link" onClick={() => setNewInvoice(true)}>+ Hóa đơn</button>
            </div>
            <span className="meter green"><span style={{ width: paidPct + "%" }} /></span>
            <div className="money-row">
              <div><small>Tổng</small><strong>{money(p.total)}</strong></div>
              <div><small>Đã thu</small><strong className="success">{money(paid)}</strong></div>
              <div><small>Còn lại</small><strong>{money(Math.max(p.total - paid, 0))}</strong></div>
            </div>
            {invoices.length ? (
              <div className="inv-list">
                {invoices.map((inv) => {
                  const st = invoiceStatus(d, inv);
                  return (
                    <div key={inv.id} className="inv-row">
                      <span className="row-main"><strong>{inv.no} · {inv.note}</strong><small>Hạn {fmtDate(inv.due)} · đã thu {money(paidFor(d, inv.id))}</small></span>
                      <span className="row-end">
                        <strong>{money(inv.amount)}</strong>
                        {st === "paid" ? <span className="badge tone-green">Đã thu</span> : (
                          <button className={"badge tone-" + STATUS[st][1] + " badge-btn"} onClick={() => setPaying(inv)}>{STATUS[st][0]} · Ghi thu</button>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : <p className="f-hint">Chưa có hóa đơn.</p>}
          </section>
        </div>

        <div className="col">
          <section className="card pad" aria-label="Tệp ảnh">
            <div className="section-head"><h2>Tệp ảnh</h2><button className="link" onClick={() => go({ view: "library", projectId: p.id })}>Mở thư viện</button></div>
            {assets.length ? (
              <>
                <div className="mini-grid">
                  {assets.slice(0, 7).map((a) => <span key={a.id} style={{ background: a.color }} />)}
                  <span className="more">{assets.length > 7 ? "+" + (assets.length - 7) : ""}</span>
                </div>
                <ul className="facts">
                  <li><Icon name="photo" size={18} /><span>{assets.length} cặp RAW + JPG · giữ {kept}</span></li>
                  {p.nasPath ? <li><Icon name="server" size={18} /><code>{p.nasPath}</code></li> : null}
                </ul>
              </>
            ) : <p className="f-hint">Chưa có ảnh. Nhập ảnh từ thẻ nhớ sau buổi chụp.</p>}
            <button className="btn tinted" onClick={() => go({ view: "library", importFor: p.id })}><Icon name="sd" size={18} />Nhập ảnh từ thẻ</button>
          </section>

          <section className="card pad" aria-label="Khách chọn ảnh">
            <div className="section-head">
              <h2>Khách chọn ảnh</h2>
              <small>{p.gallery?.sentAt ? `Đã chọn ${picked}/${p.gallery.limit}` : "Chưa gửi link"}</small>
            </div>
            <p className="hint"><Icon name="link" size={18} />Giới hạn {p.gallery?.limit ?? p.pkgPhotos} ảnh{p.gallery?.expires ? ` · hết hạn ${fmtDate(p.gallery.expires)}` : ""}</p>
            <button className="btn primary" onClick={() => go({ view: "projects", projectId: p.id, gallery: p.id })}>
              <Icon name="heart" size={18} />{p.gallery ? "Quản lý chọn ảnh" : "Tạo link chọn ảnh"}
            </button>
          </section>

          <section className="card pad" aria-label="Hoạt động">
            <h2 className="card-title">Hoạt động</h2>
            {activity.length ? (
              <ul className="timeline">
                {activity.map((a) => <li key={a.id}><span>{a.text}</span><small>{fmtDate(a.at)}</small></li>)}
              </ul>
            ) : <p className="f-hint">Chưa có hoạt động.</p>}
          </section>
        </div>
      </div>

      {editing ? <ProjectForm project={p} onClose={() => setEditing(false)} /> : null}
      {newInvoice ? <InvoiceForm projectId={p.id} onClose={() => setNewInvoice(false)} /> : null}
      {paying ? <PaymentForm invoice={paying} onClose={() => setPaying(null)} /> : null}
      {deleting ? (
        <Confirm
          title="Xóa dự án"
          text={`Xóa "${p.name}" cùng hóa đơn, thanh toán và danh sách ảnh trong app? Ảnh gốc trên NAS không bị xóa.`}
          confirmLabel="Xóa dự án"
          onConfirm={() => { actions.deleteProject(p.id); go({ view: "projects" }); }}
          onClose={() => setDeleting(false)}
        />
      ) : null}
    </div>
  );
}
