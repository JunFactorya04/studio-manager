import { useState } from "react";
import { Header } from "../components/Header";
import { Icon } from "../components/Icon";
import { Confirm, Field, Sheet } from "../components/Sheet";
import { InvoiceForm, PaymentForm } from "../components/MoneyForms";
import {
  EXPENSE_CATEGORIES, actions, fmtDate, invoiceStatus, isoDate, money, paidFor, today, useData,
  type Invoice, type InvoiceStatus,
} from "../store";
import type { Go } from "../nav";

type Period = "month" | "quarter" | "year";
const STATUS: Record<InvoiceStatus, [string, string]> = { paid: ["Đã thu", "green"], overdue: ["Quá hạn", "red"], pending: ["Chờ thanh toán", "orange"] };

function periodRange(period: Period, offset = 0): [string, string, string] {
  const now = new Date();
  let start: Date, end: Date, label: string;
  if (period === "month") {
    start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
    label = `tháng ${start.getMonth() + 1}`;
  } else if (period === "quarter") {
    const q = Math.floor(now.getMonth() / 3) + offset;
    start = new Date(now.getFullYear(), q * 3, 1);
    end = new Date(start.getFullYear(), start.getMonth() + 3, 0);
    label = `quý ${Math.floor(start.getMonth() / 3) + 1}`;
  } else {
    start = new Date(now.getFullYear() + offset, 0, 1);
    end = new Date(start.getFullYear(), 11, 31);
    label = `năm ${start.getFullYear()}`;
  }
  return [isoDate(start), isoDate(end), label];
}

export function Finance({ go }: { go: Go }) {
  const d = useData();
  const [period, setPeriod] = useState<Period>("month");
  const [invFilter, setInvFilter] = useState<InvoiceStatus | "open" | "all">("open");
  const [newInvoice, setNewInvoice] = useState(false);
  const [paying, setPaying] = useState<Invoice | null>(null);
  const [deletingInv, setDeletingInv] = useState<Invoice | null>(null);
  const [newExpense, setNewExpense] = useState(false);

  const [from, to, label] = periodRange(period);
  const [pFrom, pTo] = periodRange(period, -1);
  const inRange = (date: string, a: string, b: string) => date >= a && date <= b;
  const revenue = d.payments.filter((p) => inRange(p.date, from, to)).reduce((s, p) => s + p.amount, 0);
  const prevRevenue = d.payments.filter((p) => inRange(p.date, pFrom, pTo)).reduce((s, p) => s + p.amount, 0);
  const change = prevRevenue ? Math.round(((revenue - prevRevenue) / prevRevenue) * 100) : null;
  const expenses = d.expenses.filter((e) => inRange(e.date, from, to));
  const spent = expenses.reduce((s, e) => s + e.amount, 0);

  const projectInvoices = d.invoices.filter((i) => i.projectId);
  const open = projectInvoices.filter((i) => invoiceStatus(d, i) !== "paid");
  const outstanding = open.reduce((s, i) => s + i.amount - paidFor(d, i.id), 0);
  const overdue = open.filter((i) => invoiceStatus(d, i) === "overdue");

  // Last six months of money received.
  const months = Array.from({ length: 6 }, (_, k) => {
    const [a, b] = periodRange("month", k - 5);
    return { label: "T" + Number(a.slice(5, 7)), value: d.payments.filter((p) => inRange(p.date, a, b)).reduce((s, p) => s + p.amount, 0) };
  });
  const max = Math.max(1, ...months.map((m) => m.value));

  const invoices = projectInvoices
    .filter((i) => invFilter === "all" || (invFilter === "open" ? invoiceStatus(d, i) !== "paid" : invoiceStatus(d, i) === invFilter))
    .sort((a, b) => a.due.localeCompare(b.due));
  const projectName = (id: string) => d.projects.find((p) => p.id === id)?.name ?? "—";

  const byCategory = EXPENSE_CATEGORIES.map((c) => ({ c, v: expenses.filter((e) => e.category === c).reduce((s, e) => s + e.amount, 0) })).filter((x) => x.v > 0);

  const exportCsv = () => {
    const rows = [["Ngày", "Loại", "Nội dung", "Số tiền"]];
    d.payments.filter((p) => inRange(p.date, from, to)).forEach((p) => {
      const inv = d.invoices.find((i) => i.id === p.invoiceId);
      rows.push([p.date, "Thu", `${inv?.no ?? ""} ${inv ? projectName(inv.projectId) : ""} (${p.method})`.trim(), String(p.amount)]);
    });
    expenses.forEach((e) => rows.push([e.date, "Chi", `${e.category}: ${e.note}`, String(-e.amount)]));
    const csv = "﻿" + rows.map((r) => r.map((x) => `"${x.replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `thu-chi-${from}-${to}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="page">
      <Header
        title="Tài chính"
        actions={
          <>
            <button className="icon-btn" aria-label="Xuất thu chi ra CSV" onClick={exportCsv}><Icon name="download" /></button>
            <button className="icon-btn primary" aria-label="Tạo hóa đơn" onClick={() => setNewInvoice(true)}><Icon name="plus" /></button>
          </>
        }
      />

      <div className="segmented" role="tablist" aria-label="Khoảng thời gian">
        {([["month", "Tháng"], ["quarter", "Quý"], ["year", "Năm"]] as const).map(([id, l]) => (
          <button key={id} role="tab" aria-selected={period === id} className={period === id ? "on" : ""} onClick={() => setPeriod(id)}>{l}</button>
        ))}
      </div>

      <div className="two-col">
        <section className="card pad" aria-label="Doanh thu">
          <small className="muted">Đã thu {label}</small>
          <div className="big-number">
            {money(revenue)}
            {change !== null ? <span className={change >= 0 ? "success" : "danger"}>{change >= 0 ? "+" : ""}{change}% so với kỳ trước</span> : null}
          </div>
          <div className="bars" role="img" aria-label={"Tiền thu 6 tháng gần nhất: " + months.map((m) => `${m.label} ${money(m.value)}`).join(", ")}>
            {months.map((m, i) => (
              <div key={m.label} className="bar-col" title={money(m.value)}>
                <span className="bar-val">{m.value ? Math.round(m.value / 1000) + "k" : ""}</span>
                <span className={"bar-fill" + (i === 5 ? " now" : "")} style={{ height: Math.max(2, Math.round((m.value / max) * 100)) + "%" }} />
                <small>{m.label}</small>
              </div>
            ))}
          </div>
        </section>

        <div className="stat-grid two">
          <div className="card stat">
            <span className="stat-label">Chờ thu</span>
            <span className="stat-value">{money(outstanding)}</span>
            <span className={"stat-sub" + (overdue.length ? " danger" : "")}>{open.length} hóa đơn{overdue.length ? ` · ${overdue.length} quá hạn` : ""}</span>
          </div>
          <div className="card stat">
            <span className="stat-label">Chi phí {label}</span>
            <span className="stat-value">{money(spent)}</span>
            <span className="stat-sub">{expenses.length} khoản</span>
          </div>
          <div className="card stat">
            <span className="stat-label">Lợi nhuận {label}</span>
            <span className={"stat-value" + (revenue - spent < 0 ? " danger" : "")}>{money(revenue - spent)}</span>
            <span className="stat-sub">Đã thu trừ chi phí</span>
          </div>
          <div className="card stat">
            <span className="stat-label">Giá trị dự án đang làm</span>
            <span className="stat-value">{money(d.projects.filter((p) => p.stage !== "delivered").reduce((s, p) => s + p.total, 0))}</span>
            <span className="stat-sub">{d.projects.filter((p) => p.stage !== "delivered").length} dự án</span>
          </div>
        </div>
      </div>

      <div className="section-head">
        <h2 className="section-title">Hóa đơn</h2>
        <button className="link" onClick={() => setNewInvoice(true)}>+ Hóa đơn</button>
      </div>
      <div className="pills" role="tablist" aria-label="Lọc hóa đơn">
        {([["open", "Chưa thu"], ["overdue", "Quá hạn"], ["paid", "Đã thu"], ["all", "Tất cả"]] as const).map(([id, l]) => (
          <button key={id} role="tab" aria-selected={invFilter === id} className={"pill" + (invFilter === id ? " on" : "")} onClick={() => setInvFilter(id)}>{l}</button>
        ))}
      </div>
      <div className="card list">
        {invoices.map((inv) => {
          const st = invoiceStatus(d, inv);
          const paid = paidFor(d, inv.id);
          return (
            <div key={inv.id} className="row">
              <button className="row-main as-link" onClick={() => go({ view: "projects", projectId: inv.projectId })}>
                <strong>{projectName(inv.projectId)}</strong>
                <small>{inv.no} · {inv.note} · hạn {fmtDate(inv.due)}{paid > 0 && st !== "paid" ? ` · đã thu ${money(paid)}` : ""}</small>
              </button>
              <span className="row-end">
                <strong>{money(inv.amount)}</strong>
                {st === "paid" ? <span className="badge tone-green">Đã thu</span> : (
                  <button className={"badge badge-btn tone-" + STATUS[st][1]} onClick={() => setPaying(inv)}>{STATUS[st][0]} · Ghi thu</button>
                )}
              </span>
              <button className="icon-mini" aria-label={`Xóa hóa đơn ${inv.no}`} onClick={() => setDeletingInv(inv)}><Icon name="trash" size={16} /></button>
            </div>
          );
        })}
        {invoices.length === 0 ? <p className="empty">Không có hóa đơn nào.</p> : null}
      </div>

      <div className="section-head">
        <h2 className="section-title">Chi phí {label}</h2>
        <button className="link" onClick={() => setNewExpense(true)}>+ Chi phí</button>
      </div>
      {byCategory.length ? (
        <div className="cat-bars" aria-label="Chi phí theo nhóm">
          {byCategory.map(({ c, v }) => (
            <div key={c} className="cat-row">
              <span>{c}</span>
              <span className="meter"><span style={{ width: Math.round((v / spent) * 100) + "%", background: "var(--accent)" }} /></span>
              <strong>{money(v)}</strong>
            </div>
          ))}
        </div>
      ) : null}
      <div className="card list">
        {expenses.map((e) => (
          <div key={e.id} className="row">
            <span className="row-main"><strong>{e.note || e.category}</strong><small>{e.category} · {fmtDate(e.date)}</small></span>
            <strong>{money(e.amount)}</strong>
            <button className="icon-mini" aria-label="Xóa chi phí" onClick={() => actions.deleteExpense(e.id)}><Icon name="trash" size={16} /></button>
          </div>
        ))}
        {expenses.length === 0 ? <p className="empty">Chưa có chi phí trong kỳ này.</p> : null}
      </div>

      {newInvoice ? <InvoiceForm onClose={() => setNewInvoice(false)} /> : null}
      {paying ? <PaymentForm invoice={paying} onClose={() => setPaying(null)} /> : null}
      {deletingInv ? (
        <Confirm title="Xóa hóa đơn" text={`Xóa hóa đơn ${deletingInv.no} và các khoản đã ghi thu của nó?`} confirmLabel="Xóa" onConfirm={() => actions.deleteInvoice(deletingInv.id)} onClose={() => setDeletingInv(null)} />
      ) : null}
      {newExpense ? <ExpenseForm onClose={() => setNewExpense(false)} /> : null}
    </div>
  );
}

function ExpenseForm({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState({ date: today(), category: EXPENSE_CATEGORIES[0], amount: 0, note: "" });
  const [error, setError] = useState("");
  const save = () => {
    if (!(form.amount > 0)) return setError("Nhập số tiền lớn hơn 0.");
    actions.addExpense(form);
    onClose();
  };
  return (
    <Sheet title="Chi phí mới" onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>Hủy</button><button className="btn primary sm" onClick={save}>Lưu</button></>}>
      <div className="f-row">
        <Field label="Số tiền (NT$)" error={error}><input className="input" type="number" min={0} step={100} value={form.amount} onChange={(e) => { setForm({ ...form, amount: Number(e.target.value) }); setError(""); }} autoFocus /></Field>
        <Field label="Ngày"><input className="input" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
      </div>
      <Field label="Nhóm">
        <select className="select" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
          {EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
      </Field>
      <Field label="Nội dung"><input className="input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Taxi đi chụp, thuê đèn…" /></Field>
    </Sheet>
  );
}
