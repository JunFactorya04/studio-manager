import { useState } from "react";
import { Field, Sheet } from "./Sheet";
import { actions, addDays, money, nextInvoiceNo, paidFor, today, useData, type Invoice } from "../store";

// New invoice, optionally pre-linked to a project.
export function InvoiceForm({ projectId, onClose }: { projectId?: string; onClose: () => void }) {
  const d = useData();
  const project = d.projects.find((p) => p.id === projectId);
  const billed = project ? d.invoices.filter((i) => i.projectId === project.id).reduce((s, i) => s + i.amount, 0) : 0;
  const [form, setForm] = useState({
    projectId: projectId ?? d.projects[0]?.id ?? "",
    no: nextInvoiceNo(d),
    amount: project ? Math.max(project.total - billed, 0) : 0,
    due: addDays(today(), 7),
    note: billed === 0 ? "Đặt cọc" : "Thanh toán",
  });
  const [error, setError] = useState("");

  const save = () => {
    if (!form.projectId) return setError("Chọn dự án.");
    if (!(form.amount > 0)) return setError("Nhập số tiền lớn hơn 0.");
    actions.addInvoice({ ...form, issued: today() });
    onClose();
  };

  return (
    <Sheet title="Hóa đơn mới" onClose={onClose} footer={
      <>
        <button className="btn ghost" onClick={onClose}>Hủy</button>
        <button className="btn primary sm" onClick={save}>Tạo hóa đơn</button>
      </>
    }>
      <Field label="Dự án">
        <select className="select" value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })} disabled={!!projectId}>
          {d.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </Field>
      {project ? <p className="f-hint">Tổng giá {money(project.total)} · đã lập hóa đơn {money(billed)}</p> : null}
      <div className="f-row">
        <Field label="Số hóa đơn"><input className="input" value={form.no} onChange={(e) => setForm({ ...form, no: e.target.value })} /></Field>
        <Field label="Số tiền (NT$)" error={error}>
          <input className="input" type="number" min={0} step={500} value={form.amount} onChange={(e) => { setForm({ ...form, amount: Number(e.target.value) }); setError(""); }} />
        </Field>
      </div>
      <div className="f-row">
        <Field label="Hạn thanh toán"><input className="input" type="date" value={form.due} onChange={(e) => setForm({ ...form, due: e.target.value })} /></Field>
        <Field label="Nội dung"><input className="input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Đặt cọc, Đợt 2…" /></Field>
      </div>
    </Sheet>
  );
}

// Record money received against an invoice.
export function PaymentForm({ invoice, onClose }: { invoice: Invoice; onClose: () => void }) {
  const d = useData();
  const remain = invoice.amount - paidFor(d, invoice.id);
  const [form, setForm] = useState({ amount: remain, date: today(), method: "Chuyển khoản" });
  const [error, setError] = useState("");

  const save = () => {
    if (!(form.amount > 0)) return setError("Nhập số tiền lớn hơn 0.");
    actions.addPayment({ invoiceId: invoice.id, ...form });
    onClose();
  };

  return (
    <Sheet title={`Ghi thu ${invoice.no}`} onClose={onClose} footer={
      <>
        <button className="btn ghost" onClick={onClose}>Hủy</button>
        <button className="btn primary sm" onClick={save}>Ghi nhận</button>
      </>
    }>
      <p className="f-hint">Hóa đơn {money(invoice.amount)} · còn lại {money(remain)}</p>
      <div className="f-row">
        <Field label="Số tiền nhận (NT$)" error={error}>
          <input className="input" type="number" min={0} step={500} value={form.amount} onChange={(e) => { setForm({ ...form, amount: Number(e.target.value) }); setError(""); }} autoFocus />
        </Field>
        <Field label="Ngày nhận"><input className="input" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
      </div>
      <Field label="Hình thức">
        <select className="select" value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
          <option>Chuyển khoản</option><option>Tiền mặt</option><option>LINE Pay</option><option>Thẻ tín dụng</option><option>ECPay</option>
        </select>
      </Field>
    </Sheet>
  );
}
