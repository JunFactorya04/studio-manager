import { Header } from "../components/Header";
import { Icon } from "../components/Icon";
import { invoices, money, revenue } from "../data";
import type { Go } from "../nav";

const STATUS = {
  overdue: { label: "Quá hạn", tone: "red" },
  pending: { label: "Chờ thanh toán", tone: "orange" },
  paid: { label: "Đã thu", tone: "green" },
} as const;

export function Finance({ go }: { go: Go }) {
  const max = Math.max(...revenue.map((r) => r.value));
  const current = revenue[revenue.length - 1];
  const prev = revenue[revenue.length - 2];
  const change = Math.round(((current.value - prev.value) / prev.value) * 100);
  const due = invoices.filter((i) => i.status !== "paid");

  return (
    <div className="page">
      <Header
        title="Tài chính"
        actions={
          <button className="icon-btn primary" aria-label="Tạo hóa đơn">
            <Icon name="plus" />
          </button>
        }
      />

      <div className="two-col">
        <section className="card pad" aria-label="Doanh thu">
          <small className="muted">Doanh thu tháng 10</small>
          <div className="big-number">
            {money(current.value)} <span className={change >= 0 ? "success" : "danger"}>{change >= 0 ? "+" : ""}{change}%</span>
          </div>
          <div className="bars" role="img" aria-label="Doanh thu 6 tháng gần nhất">
            {revenue.map((r, i) => (
              <div key={r.month} className="bar-col">
                <span className={"bar-fill" + (i === revenue.length - 1 ? " now" : "")} style={{ height: Math.round((r.value / max) * 100) + "%" }} />
                <small>{r.month}</small>
              </div>
            ))}
          </div>
        </section>

        <div className="stat-grid two">
          <div className="card stat">
            <span className="stat-label">Chờ thu</span>
            <span className="stat-value">{money(due.reduce((s, i) => s + i.amount, 0))}</span>
            <span className="stat-sub">{due.length} hóa đơn</span>
          </div>
          <div className="card stat">
            <span className="stat-label">Chi phí</span>
            <span className="stat-value">{money(32500)}</span>
            <span className="stat-sub">Thiết bị, đi lại, cloud</span>
          </div>
        </div>
      </div>

      <h2 className="section-title">Hóa đơn</h2>
      <div className="card list">
        {invoices.map((inv) => {
          const s = STATUS[inv.status];
          return (
            <button key={inv.no} className="row" onClick={() => go({ view: "projects", projectId: inv.projectId })}>
              <span className="row-main"><strong>{inv.project}</strong><small>{inv.no} · {inv.due}</small></span>
              <span className="row-end">
                <strong>{money(inv.amount)}</strong>
                <span className={"badge tone-" + s.tone}>{s.label}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
