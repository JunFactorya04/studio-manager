import { useState } from "react";
import { Header } from "../components/Header";
import { Icon, type IconName } from "../components/Icon";
import { AreaChart, Donut, Sparkline } from "../components/Charts";
import { ProjectForm } from "../components/ProjectForm";
import {
  STAGES, addDays, clientOf, daysBetween, fmtDate, invoiceStatus, isoDate, money, paidFor, today, useData,
} from "../store";
import { projectNote } from "../projectInfo";
import type { Go } from "../nav";

const WEEKDAY = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const kMoney = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));

export function Dashboard({ go }: { go: Go }) {
  const d = useData();
  const [creating, setCreating] = useState(false);
  const t = today();

  // ---- money ----
  const monthStart = (offset: number) => { const x = new Date(); x.setDate(1); x.setMonth(x.getMonth() + offset); return isoDate(x); };
  const months = Array.from({ length: 6 }, (_, k) => {
    const a = monthStart(k - 5), b = monthStart(k - 4);
    return { label: "T" + Number(a.slice(5, 7)), value: d.payments.filter((p) => p.date >= a && p.date < b).reduce((s, p) => s + p.amount, 0) };
  });
  // Compare month-to-date with the same days of last month, so early in the month isn't a false drop.
  const thisMonth = months[5].value;
  const dayOfMonth = Number(t.slice(8));
  const lmStart = monthStart(-1);
  const lastMonth = d.payments.filter((p) => p.date >= lmStart && p.date < monthStart(0) && Number(p.date.slice(8)) <= dayOfMonth).reduce((s, p) => s + p.amount, 0);
  const change = lastMonth ? Math.round(((thisMonth - lastMonth) / lastMonth) * 100) : null;
  const open = d.invoices.filter((i) => i.projectId && invoiceStatus(d, i) !== "paid");
  const outstanding = open.reduce((s, i) => s + i.amount - paidFor(d, i.id), 0);
  const overdue = open.filter((i) => invoiceStatus(d, i) === "overdue");
  const upcomingPay = [...open].sort((a, b) => a.due.localeCompare(b.due)).slice(0, 4);

  // ---- projects ----
  const active = d.projects.filter((p) => p.stage !== "delivered");
  const dueSoon = active.filter((p) => p.stage !== "quote" && daysBetween(t, p.deadline) <= 3).length;
  const byStage = STAGES.map((s) => {
    const ps = d.projects.filter((p) => p.stage === s.id);
    return { ...s, n: ps.length, value: ps.reduce((sum, p) => sum + p.total, 0) };
  });
  const maxStage = Math.max(1, ...byStage.map((s) => s.n));

  // ---- photos ----
  const keep = d.assets.filter((a) => a.mark === "keep").length;
  const reject = d.assets.filter((a) => a.mark === "reject").length;
  const none = d.assets.filter((a) => a.mark === "none").length;
  const reviewed = d.assets.length ? Math.round(((keep + reject) / d.assets.length) * 100) : 0;

  // ---- week ----
  const week = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(t, i);
    return {
      date,
      day: WEEKDAY[new Date(date + "T00:00:00").getDay()],
      num: Number(date.slice(8)),
      shoots: d.projects.filter((p) => p.date === date && ["quote", "deposit", "shoot"].includes(p.stage)).sort((a, b) => a.time.localeCompare(b.time)),
      deadlines: d.projects.filter((p) => p.deadline === date && p.stage !== "delivered"),
    };
  });

  // ---- to do ----
  type Todo = { key: string; icon: IconName; tone: string; title: string; text: string; danger?: boolean; onClick: () => void; rank: number };
  const todos: Todo[] = [];
  d.projects.forEach((p) => {
    const note = projectNote(d, p);
    if (note.danger) todos.push({ key: p.id + "d", icon: "doc", tone: "red", title: p.name, text: note.text, danger: true, rank: 0, onClick: () => go({ view: "projects", projectId: p.id }) });
    else if (p.stage === "edit" && daysBetween(t, p.deadline) <= 3) todos.push({ key: p.id, icon: "clock", tone: "orange", title: p.name, text: note.text, rank: 1, onClick: () => go({ view: "projects", projectId: p.id }) });
    else if (p.stage === "review" && p.gallery?.submittedAt) todos.push({ key: p.id, icon: "heart", tone: "pink", title: p.name, text: "Khách đã gửi lựa chọn", rank: 1, onClick: () => go({ view: "projects", projectId: p.id, gallery: p.id }) });
    else if (p.stage === "review" && !p.gallery?.sentAt) todos.push({ key: p.id, icon: "send", tone: "pink", title: p.name, text: "Chưa gửi link chọn ảnh", rank: 2, onClick: () => go({ view: "projects", projectId: p.id, gallery: p.id }) });
    else if (p.stage === "cull" && d.assets.some((a) => a.projectId === p.id && a.mark === "none")) todos.push({ key: p.id, icon: "photo", tone: "purple", title: p.name, text: note.text, rank: 2, onClick: () => go({ view: "library", projectId: p.id }) });
    else if (p.stage === "shoot" && p.date < t) todos.push({ key: p.id, icon: "sd", tone: "blue", title: p.name, text: note.text, rank: 2, onClick: () => go({ view: "library", importFor: p.id }) });
  });
  const unreadBy = new Map<string, number>();
  d.messages.filter((m) => m.dir === "in" && !m.read).forEach((m) => unreadBy.set(m.clientId, (unreadBy.get(m.clientId) ?? 0) + 1));
  unreadBy.forEach((n, clientId) => {
    const c = clientOf(d, clientId);
    if (c) todos.push({ key: "m" + clientId, icon: "message", tone: "blue", title: c.name, text: `${n} tin nhắn chưa đọc`, rank: 3, onClick: () => go({ view: "inbox", clientId }) });
  });
  todos.sort((a, b) => a.rank - b.rank);

  const activity = [...d.activity].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6);
  const dateLabel = new Date().toLocaleDateString("vi-VN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="page dash">
      <Header
        title="Tổng quan"
        eyebrow={dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1)}
        actions={<button className="icon-btn primary" aria-label="Tạo dự án" title="Tạo dự án" onClick={() => setCreating(true)}><Icon name="plus" /></button>}
      />

      <div className="dash-grid">
        {/* KPI row */}
        <button className="card kpi w3" onClick={() => go({ view: "finance" })}>
          <span className="kpi-top"><span className="kpi-label">Doanh thu tháng này</span><Sparkline values={months.map((m) => m.value)} /></span>
          <span className="kpi-value">{money(thisMonth)}</span>
          <span className={"kpi-sub " + (change === null ? "" : change >= 0 ? "up" : "down")}>{change === null ? "Chưa có kỳ trước" : `${change >= 0 ? "▲" : "▼"} ${Math.abs(change)}% so với cùng kỳ tháng trước`}</span>
        </button>
        <button className="card kpi w3" onClick={() => go({ view: "projects" })}>
          <span className="kpi-top"><span className="kpi-label">Dự án đang làm</span><span className="kpi-ico" style={{ color: "var(--sys-blue)" }}><Icon name="folder" size={16} /></span></span>
          <span className="kpi-value">{active.length}</span>
          <span className={"kpi-sub" + (dueSoon ? " down" : "")}>{dueSoon ? `${dueSoon} dự án sát hạn giao` : "Không có dự án sát hạn"}</span>
        </button>
        <button className="card kpi w3" onClick={() => go({ view: "finance" })}>
          <span className="kpi-top"><span className="kpi-label">Chờ thu</span><span className="kpi-ico" style={{ color: "var(--sys-orange)" }}><Icon name="doc" size={16} /></span></span>
          <span className="kpi-value">{money(outstanding)}</span>
          <span className={"kpi-sub" + (overdue.length ? " down" : "")}>{overdue.length ? `${overdue.length} hóa đơn quá hạn` : `${open.length} hóa đơn đang mở`}</span>
        </button>
        <button className="card kpi w3" onClick={() => go({ view: "library", photos: "none" })}>
          <span className="kpi-top"><span className="kpi-label">Ảnh chờ lọc</span><span className="kpi-ico" style={{ color: "var(--sys-purple)" }}><Icon name="photo" size={16} /></span></span>
          <span className="kpi-value">{none.toLocaleString("vi-VN")}</span>
          <span className="kpi-meter"><span style={{ width: reviewed + "%" }} /></span>
        </button>

        {/* Revenue chart */}
        <section className="card widget w8" aria-label="Doanh thu 6 tháng">
          <div className="w-head"><h2>Doanh thu</h2><span className="w-sub">6 tháng gần nhất · đã thu</span><button className="w-link" onClick={() => go({ view: "finance" })}>Tài chính</button></div>
          <AreaChart values={months.map((m) => m.value)} labels={months.map((m) => m.label)} format={money} height={130} />
          <div className="w-legend">
            {months.map((m) => <span key={m.label}><small>{m.label}</small><strong>{kMoney(m.value)}</strong></span>)}
          </div>
        </section>

        {/* Culling progress */}
        <section className="card widget w4" aria-label="Tiến độ lọc ảnh">
          <div className="w-head"><h2>Lọc ảnh</h2><button className="w-link" onClick={() => go({ view: "library" })}>Thư viện</button></div>
          <div className="donut-row">
            <Donut
              segments={[
                { value: keep, color: "var(--sys-green)", label: "Giữ" },
                { value: reject, color: "var(--sys-red)", label: "Loại" },
                { value: none, color: "var(--sys-gray)", label: "Chưa xem" },
              ]}
              center={<><strong>{reviewed}%</strong><small>đã xem</small></>}
            />
            <ul className="legend">
              <li><i style={{ background: "var(--sys-green)" }} />Giữ<b>{keep}</b></li>
              <li><i style={{ background: "var(--sys-red)" }} />Loại<b>{reject}</b></li>
              <li><i style={{ background: "var(--sys-gray)" }} />Chưa xem<b>{none}</b></li>
            </ul>
          </div>
        </section>

        {/* Pipeline */}
        <section className="card widget w6" aria-label="Phễu dự án">
          <div className="w-head"><h2>Phễu dự án</h2><span className="w-sub">{d.projects.length} dự án</span><button className="w-link" onClick={() => go({ view: "projects" })}>Bảng dự án</button></div>
          <div className="funnel">
            {byStage.map((s) => (
              <button key={s.id} className="funnel-row" onClick={() => go({ view: "projects" })}>
                <span className="funnel-name"><i style={{ background: `var(--stage-${s.id})` }} />{s.label}</span>
                <span className="funnel-track"><span style={{ width: `${(s.n / maxStage) * 100}%`, background: `var(--stage-${s.id})` }} /></span>
                <span className="funnel-n">{s.n}</span>
                <span className="funnel-v">{s.value ? kMoney(s.value) : "—"}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Week */}
        <section className="card widget w6" aria-label="7 ngày tới">
          <div className="w-head"><h2>7 ngày tới</h2><button className="w-link" onClick={() => go({ view: "calendar" })}>Lịch chụp</button></div>
          <div className="week">
            {week.map((day) => (
              <div key={day.date} className={"week-day" + (day.date === t ? " today" : "")}>
                <span className="wd-name">{day.day}</span>
                <span className="wd-num">{day.num}</span>
                <div className="wd-events">
                  {day.shoots.map((p) => (
                    <button key={p.id} className="ev shoot" onClick={() => go({ view: "projects", projectId: p.id })} title={`${p.time} ${p.name}`}>
                      <b>{p.time}</b>{p.name}
                    </button>
                  ))}
                  {day.deadlines.map((p) => (
                    <button key={p.id + "dl"} className="ev due" onClick={() => go({ view: "projects", projectId: p.id })} title={`Hạn giao ${p.name}`}>
                      <b>Hạn</b>{p.name}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* To do */}
        <section className="card widget w6 list-widget" aria-label="Cần xử lý">
          <div className="w-head"><h2>Cần xử lý</h2><span className="w-sub">{todos.length} việc</span></div>
          <div className="w-list">
            {todos.slice(0, 7).map((x) => (
              <button key={x.key} className="row" onClick={x.onClick}>
                <span className={"chip-icon tone-" + x.tone}><Icon name={x.icon} size={16} /></span>
                <span className="row-main"><strong>{x.title}</strong><small className={x.danger ? "danger" : ""}>{x.text}</small></span>
                <Icon name="chevronRight" size={14} />
              </button>
            ))}
            {todos.length === 0 ? <p className="empty">Không có việc gì cần xử lý.</p> : null}
          </div>
        </section>

        {/* Upcoming payments */}
        <section className="card widget w3 list-widget" aria-label="Sắp thu">
          <div className="w-head"><h2>Sắp thu</h2></div>
          <div className="w-list">
            {upcomingPay.map((inv) => {
              const p = d.projects.find((x) => x.id === inv.projectId);
              const st = invoiceStatus(d, inv);
              return (
                <button key={inv.id} className="row compact" onClick={() => go({ view: "projects", projectId: inv.projectId })}>
                  <span className="row-main"><strong>{p?.name ?? inv.no}</strong><small className={st === "overdue" ? "danger" : ""}>{st === "overdue" ? "Quá hạn " : "Hạn "}{fmtDate(inv.due).slice(0, 5)}</small></span>
                  <strong className="num">{kMoney(inv.amount - paidFor(d, inv.id))}</strong>
                </button>
              );
            })}
            {upcomingPay.length === 0 ? <p className="empty">Đã thu đủ.</p> : null}
          </div>
        </section>

        {/* Activity */}
        <section className="card widget w3 list-widget" aria-label="Hoạt động gần đây">
          <div className="w-head"><h2>Hoạt động</h2></div>
          <ul className="feed">
            {activity.map((a) => {
              const p = d.projects.find((x) => x.id === a.projectId);
              return (
                <li key={a.id}>
                  <button onClick={() => p && go({ view: "projects", projectId: p.id })}>
                    <span>{a.text}</span>
                    <small>{p?.name ?? ""} · {fmtDate(a.at).slice(0, 5)}</small>
                  </button>
                </li>
              );
            })}
            {activity.length === 0 ? <li className="empty">Chưa có hoạt động.</li> : null}
          </ul>
        </section>
      </div>

      {creating ? <ProjectForm onClose={() => setCreating(false)} onSaved={(id) => go({ view: "projects", projectId: id })} /> : null}
    </div>
  );
}
