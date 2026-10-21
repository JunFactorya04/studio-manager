import { useState } from "react";
import { Header } from "../components/Header";
import { Icon } from "../components/Icon";
import { ProjectForm } from "../components/ProjectForm";
import { STAGES, addDays, fmtDate, isoDate, today, useData } from "../store";
import type { Go } from "../nav";

const WEEK = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

// Month calendar of shoots and delivery deadlines, Monday first.
export function Calendar({ go }: { go: Go }) {
  const d = useData();
  const [cursor, setCursor] = useState(() => { const x = new Date(); return new Date(x.getFullYear(), x.getMonth(), 1); });
  const [creatingOn, setCreatingOn] = useState<string | null>(null);
  const t = today();

  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const lead = (first.getDay() + 6) % 7; // days before the 1st, Monday-based
  const start = addDays(isoDate(first), -lead);
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const month = cursor.getMonth();
  const title = cursor.toLocaleDateString("vi-VN", { month: "long", year: "numeric" });

  const shift = (n: number) => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + n, 1));
  const inMonth = d.projects.filter((p) => p.date.slice(0, 7) === isoDate(first).slice(0, 7));

  return (
    <div className="page cal-page">
      <Header
        title={title.charAt(0).toUpperCase() + title.slice(1)}
        eyebrow={`${inMonth.length} buổi chụp trong tháng`}
        center={
          <div className="segmented" role="group" aria-label="Chuyển tháng">
            <button onClick={() => shift(-1)} aria-label="Tháng trước"><Icon name="chevronLeft" size={14} stroke={2.4} /></button>
            <button className="on" onClick={() => { const x = new Date(); setCursor(new Date(x.getFullYear(), x.getMonth(), 1)); }}>Hôm nay</button>
            <button onClick={() => shift(1)} aria-label="Tháng sau"><Icon name="chevronRight" size={14} stroke={2.4} /></button>
          </div>
        }
        actions={<button className="icon-btn primary" aria-label="Thêm lịch chụp" title="Thêm lịch chụp" onClick={() => setCreatingOn(t)}><Icon name="plus" /></button>}
      />

      <div className="cal">
        {WEEK.map((w) => <div key={w} className="cal-head">{w}</div>)}
        {days.map((date) => {
          const shoots = d.projects.filter((p) => p.date === date).sort((a, b) => a.time.localeCompare(b.time));
          const dues = d.projects.filter((p) => p.deadline === date && p.stage !== "delivered");
          const other = new Date(date + "T00:00:00").getMonth() !== month;
          return (
            <div key={date} className={"cal-day" + (other ? " other" : "") + (date === t ? " today" : "")} onDoubleClick={() => setCreatingOn(date)}>
              <span className="cal-num">{Number(date.slice(8))}</span>
              <div className="cal-events">
                {shoots.map((p) => (
                  <button key={p.id} className="ev shoot" style={{ borderLeftColor: `var(--stage-${p.stage})` }} onClick={() => go({ view: "projects", projectId: p.id })} title={`${p.time} · ${p.name} · ${STAGES.find((s) => s.id === p.stage)!.label}`}>
                    <b>{p.time}</b>{p.name}
                  </button>
                ))}
                {dues.map((p) => (
                  <button key={p.id + "d"} className="ev due" onClick={() => go({ view: "projects", projectId: p.id })} title={`Hạn giao ${p.name}`}>
                    <b>Hạn</b>{p.name}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <p className="f-hint">Bấm đúp vào một ngày để thêm lịch chụp. Vạch màu theo bước của dự án; ô cam là hạn giao ảnh.</p>

      <div className="cal-list card list" aria-label="Danh sách lịch trong tháng">
        {inMonth.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)).map((p) => (
          <button key={p.id} className="row" onClick={() => go({ view: "projects", projectId: p.id })}>
            <span className="time"><strong>{fmtDate(p.date).slice(0, 5)}</strong><small>{p.time}</small></span>
            <span className="bar" style={{ background: `var(--stage-${p.stage})` }} />
            <span className="row-main"><strong>{p.name}</strong><small>{p.location || "—"} · {p.photographers || "chưa phân công"}</small></span>
          </button>
        ))}
        {inMonth.length === 0 ? <p className="empty">Không có lịch chụp trong tháng này.</p> : null}
      </div>

      {creatingOn ? <ProjectFormOn date={creatingOn} onClose={() => setCreatingOn(null)} go={go} /> : null}
    </div>
  );
}

function ProjectFormOn({ date, onClose, go }: { date: string; onClose: () => void; go: Go }) {
  return <ProjectForm initialDate={date} onClose={onClose} onSaved={(id) => go({ view: "projects", projectId: id })} />;
}
