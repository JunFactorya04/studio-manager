import { useState } from "react";
import { Header } from "../components/Header";
import { Icon, type IconName } from "../components/Icon";
import { SettingsSheet } from "../components/SettingsSheet";
import { ProjectForm } from "../components/ProjectForm";
import {
  STAGES, addDays, clientOf, daysBetween, fmtDate, invoiceStatus, money, paidFor, today, useData,
} from "../store";
import { projectNote } from "../projectInfo";
import type { Go } from "../nav";

const STAGE_COLOR: Record<string, string> = { shoot: "#0060DF", quote: "#8E8E93", deposit: "#8E8E93" };

export function Dashboard({ go }: { go: Go }) {
  const d = useData();
  const [settings, setSettings] = useState(false);
  const [creating, setCreating] = useState(false);
  const t = today();

  const active = d.projects.filter((p) => p.stage !== "delivered");
  const dueSoon = active.filter((p) => p.stage !== "quote" && daysBetween(t, p.deadline) <= 3).length;
  const waiting = d.projects.filter((p) => p.stage === "review");
  const submitted = waiting.filter((p) => p.gallery?.submittedAt).length;
  const open = d.invoices.filter((i) => i.projectId && invoiceStatus(d, i) !== "paid");
  const outstanding = open.reduce((s, i) => s + i.amount - paidFor(d, i.id), 0);
  const overdue = open.filter((i) => invoiceStatus(d, i) === "overdue").length;
  const toCull = d.assets.filter((a) => a.mark === "none").length;
  const unread = d.messages.filter((m) => m.dir === "in" && !m.read);

  const upcoming = d.projects
    .filter((p) => p.date >= t && p.date <= addDays(t, 7) && ["quote", "deposit", "shoot"].includes(p.stage))
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const todays = upcoming.filter((p) => p.date === t);
  const later = upcoming.filter((p) => p.date !== t);

  // Things that need someone to act, most urgent first.
  type Todo = { key: string; icon: IconName; tone: string; title: string; text: string; danger?: boolean; onClick: () => void; rank: number };
  const todos: Todo[] = [];
  d.projects.forEach((p) => {
    const note = projectNote(d, p);
    if (note.danger) todos.push({ key: p.id + "danger", icon: "doc", tone: "red", title: p.name, text: note.text, danger: true, rank: 0, onClick: () => go({ view: "projects", projectId: p.id }) });
    else if (p.stage === "edit" && daysBetween(t, p.deadline) <= 3) todos.push({ key: p.id, icon: "clock", tone: "orange", title: p.name, text: note.text, rank: 1, onClick: () => go({ view: "projects", projectId: p.id }) });
    else if (p.stage === "review" && p.gallery?.submittedAt) todos.push({ key: p.id, icon: "heart", tone: "pink", title: p.name, text: "Khách đã gửi lựa chọn, bắt đầu chỉnh ảnh", rank: 1, onClick: () => go({ view: "projects", projectId: p.id, gallery: p.id }) });
    else if (p.stage === "review" && !p.gallery?.sentAt) todos.push({ key: p.id, icon: "send", tone: "pink", title: p.name, text: "Chưa gửi link chọn ảnh cho khách", rank: 2, onClick: () => go({ view: "projects", projectId: p.id, gallery: p.id }) });
    else if (p.stage === "cull" && d.assets.some((a) => a.projectId === p.id && a.mark === "none")) todos.push({ key: p.id, icon: "photo", tone: "purple", title: p.name, text: note.text, rank: 2, onClick: () => go({ view: "library", projectId: p.id }) });
    else if (p.stage === "shoot" && p.date < t) todos.push({ key: p.id, icon: "sd", tone: "blue", title: p.name, text: note.text, rank: 2, onClick: () => go({ view: "library", importFor: p.id }) });
  });
  const unreadBy = new Map<string, number>();
  unread.forEach((m) => unreadBy.set(m.clientId, (unreadBy.get(m.clientId) ?? 0) + 1));
  unreadBy.forEach((n, clientId) => {
    const c = clientOf(d, clientId);
    if (c) todos.push({ key: "msg" + clientId, icon: "message", tone: "blue", title: c.name, text: `${n} tin nhắn chưa đọc`, rank: 3, onClick: () => go({ view: "inbox", clientId }) });
  });
  todos.sort((a, b) => a.rank - b.rank);

  const dateLabel = new Date().toLocaleDateString("vi-VN", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="page">
      <Header
        title="Tổng quan"
        eyebrow={dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1)}
        actions={
          <>
            <button className="icon-btn" aria-label="Cài đặt" onClick={() => setSettings(true)}><Icon name="settings" /></button>
            <button className="icon-btn primary" aria-label="Tạo dự án" onClick={() => setCreating(true)}><Icon name="plus" /></button>
          </>
        }
      />

      <div className="stat-grid">
        <button className="card stat" onClick={() => go({ view: "projects" })}>
          <span className="stat-label"><Icon name="folder" size={16} />Đang thực hiện</span>
          <span className="stat-value">{active.length}</span>
          <span className={"stat-sub" + (dueSoon ? " danger" : "")}>{dueSoon ? `${dueSoon} dự án sắp đến hạn` : "Không có dự án sát hạn"}</span>
        </button>
        <button className="card stat" onClick={() => go({ view: "projects" })}>
          <span className="stat-label"><Icon name="heart" size={16} />Chờ khách chọn</span>
          <span className="stat-value">{waiting.length}</span>
          <span className="stat-sub">{submitted ? `${submitted} bộ đã chọn xong` : "Chưa có bộ nào gửi lại"}</span>
        </button>
        <button className="card stat" onClick={() => go({ view: "finance" })}>
          <span className="stat-label"><Icon name="doc" size={16} />Chờ thu</span>
          <span className="stat-value">{money(outstanding)}</span>
          <span className={"stat-sub" + (overdue ? " danger" : "")}>{overdue ? `${overdue} hóa đơn quá hạn` : `${open.length} hóa đơn`}</span>
        </button>
        <button className="card stat" onClick={() => go({ view: "library" })}>
          <span className="stat-label"><Icon name="photo" size={16} />Ảnh chờ lọc</span>
          <span className="stat-value">{toCull.toLocaleString("vi-VN")}</span>
          <span className="stat-sub">{d.assets.length.toLocaleString("vi-VN")} ảnh trong thư viện</span>
        </button>
      </div>

      <div className="two-col">
        <section>
          <h2 className="section-title">Lịch chụp hôm nay</h2>
          <div className="card list">
            {todays.map((p) => (
              <button key={p.id} className="row" onClick={() => go({ view: "projects", projectId: p.id })}>
                <span className="time"><strong>{p.time}</strong><small>{p.durationH} giờ</small></span>
                <span className="bar" style={{ background: STAGE_COLOR[p.stage] ?? "#8E5BD9" }} />
                <span className="row-main"><strong>{p.name}</strong><small>{p.type} · {p.location || "—"} · {p.photographers || "chưa phân công"}</small></span>
                <Icon name="chevronRight" size={16} />
              </button>
            ))}
            {todays.length === 0 ? <p className="empty">Hôm nay không có lịch chụp.</p> : null}
          </div>
          {later.length ? (
            <>
              <h2 className="section-title" style={{ marginTop: 16 }}>7 ngày tới</h2>
              <div className="card list">
                {later.map((p) => (
                  <button key={p.id} className="row" onClick={() => go({ view: "projects", projectId: p.id })}>
                    <span className="time"><strong>{fmtDate(p.date).slice(0, 5)}</strong><small>{p.time}</small></span>
                    <span className="bar" style={{ background: STAGE_COLOR[p.stage] ?? "#8E5BD9" }} />
                    <span className="row-main"><strong>{p.name}</strong><small>{STAGES.find((s) => s.id === p.stage)!.label} · {p.location || "—"}</small></span>
                    <Icon name="chevronRight" size={16} />
                  </button>
                ))}
              </div>
            </>
          ) : null}
        </section>

        <section>
          <h2 className="section-title">Cần xử lý</h2>
          <div className="card list">
            {todos.slice(0, 8).map((x) => (
              <button key={x.key} className="row" onClick={x.onClick}>
                <span className={"chip-icon tone-" + x.tone}><Icon name={x.icon} size={18} /></span>
                <span className="row-main"><strong>{x.title}</strong><small className={x.danger ? "danger" : ""}>{x.text}</small></span>
                <Icon name="chevronRight" size={16} />
              </button>
            ))}
            {todos.length === 0 ? <p className="empty">Không có việc gì cần xử lý.</p> : null}
          </div>
        </section>
      </div>

      {settings ? <SettingsSheet onClose={() => setSettings(false)} /> : null}
      {creating ? <ProjectForm onClose={() => setCreating(false)} onSaved={(id) => go({ view: "projects", projectId: id })} /> : null}
    </div>
  );
}
