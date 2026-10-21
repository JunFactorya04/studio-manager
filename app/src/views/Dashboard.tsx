import { Header } from "../components/Header";
import { Icon } from "../components/Icon";
import { invoices, money, nas, projects, todayShoots } from "../data";
import type { Go } from "../nav";

export function Dashboard({ go }: { go: Go }) {
  const active = projects.filter((p) => p.stage !== "delivered").length;
  const waiting = projects.filter((p) => p.stage === "review").length;
  const due = invoices.filter((i) => i.status !== "paid").reduce((s, i) => s + i.amount, 0);
  const overdue = invoices.filter((i) => i.status === "overdue").length;
  const nasPct = Math.round((nas.usedTB / nas.totalTB) * 100);

  return (
    <div className="page">
      <Header
        title="Tổng quan"
        eyebrow="Thứ Tư, 21 tháng 10"
        actions={
          <>
            <button className="icon-btn" aria-label="Thông báo">
              <Icon name="bell" />
            </button>
            <button className="icon-btn primary" aria-label="Nhập ảnh mới" onClick={() => go({ view: "library" })}>
              <Icon name="plus" />
            </button>
          </>
        }
      />

      <div className="stat-grid">
        <button className="card stat" onClick={() => go({ view: "projects" })}>
          <span className="stat-label"><Icon name="folder" size={16} />Đang thực hiện</span>
          <span className="stat-value">{active}</span>
          <span className="stat-sub">3 dự án sắp đến hạn</span>
        </button>
        <button className="card stat" onClick={() => go({ view: "projects" })}>
          <span className="stat-label"><Icon name="heart" size={16} />Chờ khách chọn</span>
          <span className="stat-value">{waiting}</span>
          <span className="stat-sub">1 bộ đã chọn xong</span>
        </button>
        <button className="card stat" onClick={() => go({ view: "finance" })}>
          <span className="stat-label"><Icon name="doc" size={16} />Chờ thu</span>
          <span className="stat-value">{money(due)}</span>
          <span className="stat-sub danger">{overdue} hóa đơn quá hạn</span>
        </button>
        <button className="card stat" onClick={() => go({ view: "library" })}>
          <span className="stat-label"><Icon name="server" size={16} />NAS</span>
          <span className="stat-value">{nasPct}%</span>
          <span className="meter"><span style={{ width: nasPct + "%" }} /></span>
        </button>
      </div>

      <div className="two-col">
        <section>
          <h2 className="section-title">Lịch chụp hôm nay</h2>
          <div className="card list">
            {todayShoots.map((s) => (
              <button key={s.time} className="row" onClick={() => go({ view: "projects", projectId: s.projectId })}>
                <span className="time"><strong>{s.time}</strong><small>{s.hours}</small></span>
                <span className="bar" style={{ background: s.color }} />
                <span className="row-main"><strong>{s.title}</strong><small>{s.meta}</small></span>
                <Icon name="chevronRight" size={16} />
              </button>
            ))}
          </div>
        </section>

        <section>
          <h2 className="section-title">Cần xử lý</h2>
          <div className="card list">
            {projects
              .filter((p) => p.stage === "edit" || p.stage === "review" || p.noteTone === "danger")
              .map((p) => (
                <button key={p.id} className="row" onClick={() => go({ view: "projects", projectId: p.id })}>
                  <span className={"chip-icon tone-" + p.tone}>
                    <Icon name={p.noteTone === "danger" ? "doc" : p.stage === "review" ? "heart" : "clock"} size={18} />
                  </span>
                  <span className="row-main">
                    <strong>{p.name}</strong>
                    <small className={p.noteTone === "danger" ? "danger" : ""}>{p.note}</small>
                  </span>
                  <Icon name="chevronRight" size={16} />
                </button>
              ))}
          </div>
        </section>
      </div>
    </div>
  );
}
