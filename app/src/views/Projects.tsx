import { useState } from "react";
import { Header } from "../components/Header";
import { Icon } from "../components/Icon";
import { ProjectForm } from "../components/ProjectForm";
import { STAGES, STAGE_TONE, clientOf, fmtDate, useData, type Stage } from "../store";
import { coverOf, projectNote, stageIndex } from "../projectInfo";
import type { Go } from "../nav";

type Sort = "date" | "deadline" | "name";

export function Projects({ go }: { go: Go }) {
  const d = useData();
  const [filter, setFilter] = useState<Stage | "all" | "active">("active");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("date");
  const [creating, setCreating] = useState(false);

  const query = q.trim().toLowerCase();
  const list = d.projects
    .filter((p) => filter === "all" || (filter === "active" ? p.stage !== "delivered" : p.stage === filter))
    .filter((p) => !query || [p.name, clientOf(d, p.clientId)?.name ?? "", p.type, p.location, fmtDate(p.date)].join(" ").toLowerCase().includes(query))
    .sort((a, b) => (sort === "name" ? a.name.localeCompare(b.name, "vi") : sort === "deadline" ? a.deadline.localeCompare(b.deadline) : b.date.localeCompare(a.date)));

  const count = (f: typeof filter) => d.projects.filter((p) => f === "all" || (f === "active" ? p.stage !== "delivered" : p.stage === f)).length;
  const filters: { id: typeof filter; label: string }[] = [
    { id: "active", label: "Đang làm" },
    ...STAGES.map((s) => ({ id: s.id as typeof filter, label: s.label })),
    { id: "all", label: "Tất cả" },
  ];

  return (
    <div className="page">
      <Header
        title="Dự án"
        actions={
          <button className="icon-btn primary" aria-label="Tạo dự án" onClick={() => setCreating(true)}>
            <Icon name="plus" />
          </button>
        }
      />

      <div className="toolbar">
        <label className="search" style={{ flex: 1 }}>
          <Icon name="search" size={18} stroke={2} />
          <span className="sr-only">Tìm dự án</span>
          <input type="search" placeholder="Khách hàng, dự án, địa điểm, ngày" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <label className="sr-only" htmlFor="sort">Sắp xếp</label>
        <select id="sort" className="select" style={{ width: "auto", height: 38, borderRadius: 19 }} value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
          <option value="date">Mới chụp trước</option>
          <option value="deadline">Hạn gần nhất</option>
          <option value="name">Tên A–Z</option>
        </select>
      </div>

      <div className="pills" role="tablist" aria-label="Lọc theo trạng thái">
        {filters.map((f) => (
          <button key={f.id} role="tab" aria-selected={filter === f.id} className={"pill" + (filter === f.id ? " on" : "")} onClick={() => setFilter(f.id)}>
            {f.label} <span>{count(f.id)}</span>
          </button>
        ))}
      </div>

      <div className="project-grid">
        {list.map((p) => {
          const idx = stageIndex(p);
          const note = projectNote(d, p);
          return (
            <button key={p.id} className="card project-card" onClick={() => go({ view: "projects", projectId: p.id })}>
              <span className="thumb" style={{ background: coverOf(d, p) }} />
              <span className="project-main">
                <span className="project-top">
                  <strong>{p.name}</strong>
                  <span className={"badge tone-" + STAGE_TONE[p.stage]}>{STAGES[idx].label}</span>
                </span>
                <small>{clientOf(d, p.clientId)?.name ?? "—"} · {p.type} · {fmtDate(p.date)}</small>
                <small className={note.danger ? "danger" : ""}>{note.text}</small>
                <span className="steps" aria-label={`Bước ${idx + 1} trên ${STAGES.length}`}>
                  {STAGES.map((s, i) => (
                    <span key={s.id} className={p.stage === "delivered" ? "done-all" : i < idx ? "done" : i === idx ? "now" : ""} />
                  ))}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      {list.length === 0 ? (
        <div className="empty-state">
          <p>{d.projects.length === 0 ? "Chưa có dự án nào." : "Không có dự án nào khớp bộ lọc."}</p>
          <button className="btn primary sm" onClick={() => setCreating(true)}><Icon name="plus" size={18} />Tạo dự án</button>
        </div>
      ) : null}

      {creating ? <ProjectForm onClose={() => setCreating(false)} onSaved={(id) => go({ view: "projects", projectId: id })} /> : null}
    </div>
  );
}
