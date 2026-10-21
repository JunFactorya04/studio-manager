import { useState } from "react";
import { Header } from "../components/Header";
import { Icon } from "../components/Icon";
import { STAGES, projects, type Stage } from "../data";
import type { Go } from "../nav";

const FILTERS: { id: Stage | "all"; label: string }[] = [
  { id: "all", label: "Tất cả" },
  { id: "cull", label: "Chọn lọc" },
  { id: "edit", label: "Chỉnh sửa" },
  { id: "review", label: "Chờ khách" },
  { id: "shoot", label: "Lịch chụp" },
  { id: "delivered", label: "Đã giao" },
];

export function Projects({ go }: { go: Go }) {
  const [filter, setFilter] = useState<Stage | "all">("all");
  const [q, setQ] = useState("");

  const list = projects.filter(
    (p) =>
      (filter === "all" || p.stage === filter) &&
      (q === "" || (p.name + " " + p.client).toLowerCase().includes(q.toLowerCase())),
  );

  return (
    <div className="page">
      <Header
        title="Dự án"
        actions={
          <button className="icon-btn primary" aria-label="Tạo dự án">
            <Icon name="plus" />
          </button>
        }
      />

      <label className="search">
        <Icon name="search" size={18} stroke={2} />
        <span className="sr-only">Tìm dự án</span>
        <input type="search" placeholder="Khách hàng, dự án, ngày chụp" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>

      <div className="pills" role="tablist" aria-label="Lọc theo trạng thái">
        {FILTERS.map((f) => {
          const count = f.id === "all" ? projects.length : projects.filter((p) => p.stage === f.id).length;
          return (
            <button
              key={f.id}
              role="tab"
              aria-selected={filter === f.id}
              className={"pill" + (filter === f.id ? " on" : "")}
              onClick={() => setFilter(f.id)}
            >
              {f.label} <span>{count}</span>
            </button>
          );
        })}
      </div>

      <div className="project-grid">
        {list.map((p) => {
          const idx = STAGES.findIndex((s) => s.id === p.stage);
          return (
            <button key={p.id} className="card project-card" onClick={() => go({ view: "projects", projectId: p.id })}>
              <span className="thumb" style={{ background: p.cover }} />
              <span className="project-main">
                <span className="project-top">
                  <strong>{p.name}</strong>
                  <span className={"badge tone-" + p.tone}>{p.statusLabel}</span>
                </span>
                <small className={p.noteTone === "danger" ? "danger" : ""}>
                  {p.type} · {p.date} · {p.note}
                </small>
                <span className="steps" aria-label={`Bước ${idx + 1} trên ${STAGES.length}`}>
                  {STAGES.map((s, i) => (
                    <span
                      key={s.id}
                      className={p.stage === "delivered" ? "done-all" : i < idx ? "done" : i === idx ? "now" : ""}
                    />
                  ))}
                </span>
              </span>
            </button>
          );
        })}
        {list.length === 0 ? <p className="empty">Không có dự án nào khớp bộ lọc.</p> : null}
      </div>
    </div>
  );
}
