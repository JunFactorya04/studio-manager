import { STAGES, daysBetween, fmtShort, invoiceStatus, money, paidFor, today, type Data, type Project } from "./store";

const COVERS = ["#D8CFC4", "#C7CED6", "#CFC8D8", "#C6CEC2", "#DCD3C6", "#E2DBD1"];
export const coverOf = (d: Data, p: Project) =>
  d.assets.find((a) => a.projectId === p.id)?.color ?? COVERS[p.name.length % COVERS.length];

export const stageIndex = (p: Project) => STAGES.findIndex((s) => s.id === p.stage);

// One-line status shown under a project: what needs attention right now.
export function projectNote(d: Data, p: Project): { text: string; danger?: boolean } {
  const overdue = d.invoices.filter((i) => i.projectId === p.id && invoiceStatus(d, i) === "overdue");
  if (overdue.length) {
    const due = overdue.reduce((s, i) => s + i.amount - paidFor(d, i.id), 0);
    return { text: `Quá hạn thu ${money(due)}`, danger: true };
  }
  const t = today();
  switch (p.stage) {
    case "quote": return { text: `Báo giá ${money(p.total)} · chụp ${fmtShort(p.date)}` };
    case "deposit": return { text: "Chờ khách đặt cọc" };
    case "shoot": {
      const n = daysBetween(t, p.date);
      return { text: n === 0 ? `Hôm nay ${p.time}` : n > 0 ? `Chụp sau ${n} ngày · ${fmtShort(p.date)}` : `Đã chụp ${fmtShort(p.date)}, chưa nhập ảnh` };
    }
    case "cull": {
      const n = d.assets.filter((a) => a.projectId === p.id).length;
      return { text: n ? `${n} ảnh chờ lọc` : "Chưa nhập ảnh" };
    }
    case "edit": {
      const n = daysBetween(t, p.deadline);
      return { text: n >= 0 ? `Hạn chỉnh sửa còn ${n} ngày` : `Trễ hạn ${-n} ngày`, danger: n < 0 };
    }
    case "review": {
      const picked = d.assets.filter((a) => a.projectId === p.id && a.picked).length;
      return { text: p.gallery?.submittedAt ? `Khách đã gửi ${picked} ảnh` : p.gallery?.sentAt ? `Khách đã chọn ${picked}/${p.gallery.limit} ảnh` : "Chưa gửi link chọn ảnh" };
    }
    case "delivered": {
      const remain = p.total - d.invoices.filter((i) => i.projectId === p.id).reduce((s, i) => s + paidFor(d, i.id), 0);
      return { text: remain > 0 ? `Đã giao · còn thu ${money(remain)}` : "Đã giao · đã thu đủ" };
    }
  }
}
