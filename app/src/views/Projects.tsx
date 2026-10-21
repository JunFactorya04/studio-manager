import { useState, type DragEvent } from "react";
import { Header } from "../components/Header";
import { Icon } from "../components/Icon";
import { ProjectForm } from "../components/ProjectForm";
import { STAGES, STAGE_TONE, actions, clientOf, daysBetween, fmtDate, money, projectPaid, today, useData, type Project, type Stage } from "../store";
import { coverOf, projectNote, stageIndex } from "../projectInfo";
import type { Go } from "../nav";

type SortKey = "name" | "client" | "type" | "date" | "stage" | "deadline" | "total" | "paid";
type Mode = "list" | "board";

const loadMode = (): Mode => { try { return (localStorage.getItem("projects-mode") as Mode) || "list"; } catch { return "list"; } };

export function Projects({ go }: { go: Go }) {
  const d = useData();
  const [mode, setModeState] = useState<Mode>(loadMode);
  const [filter, setFilter] = useState<Stage | "all" | "active">("active");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "date", dir: -1 });
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [dragOver, setDragOver] = useState<Stage | null>(null);
  const t = today();

  const setMode = (m: Mode) => { setModeState(m); try { localStorage.setItem("projects-mode", m); } catch { /* ignore */ } };

  const query = q.trim().toLowerCase();
  const matches = (p: Project) => !query || [p.name, clientOf(d, p.clientId)?.name ?? "", p.type, p.location, fmtDate(p.date)].join(" ").toLowerCase().includes(query);
  const val = (p: Project, k: SortKey): string | number => {
    switch (k) {
      case "client": return clientOf(d, p.clientId)?.name ?? "";
      case "stage": return stageIndex(p);
      case "total": return p.total;
      case "paid": return p.total ? projectPaid(d, p.id) / p.total : 0;
      default: return p[k];
    }
  };
  const list = d.projects
    .filter((p) => filter === "all" || (filter === "active" ? p.stage !== "delivered" : p.stage === filter))
    .filter(matches)
    .sort((a, b) => { const x = val(a, sort.key), y = val(b, sort.key); return (typeof x === "number" ? x - (y as number) : String(x).localeCompare(String(y), "vi")) * sort.dir; });

  const count = (f: typeof filter) => d.projects.filter((p) => f === "all" || (f === "active" ? p.stage !== "delivered" : p.stage === f)).length;
  const sel = d.projects.find((p) => p.id === selected);

  const th = (key: SortKey, label: string, cls = "") => (
    <th className={cls} aria-sort={sort.key === key ? (sort.dir === 1 ? "ascending" : "descending") : undefined}>
      <button onClick={() => setSort({ key, dir: sort.key === key ? (sort.dir === 1 ? -1 : 1) : 1 })}>
        {label}{sort.key === key ? <span className="sort-ind">{sort.dir === 1 ? "▲" : "▼"}</span> : null}
      </button>
    </th>
  );

  const onDrop = (stage: Stage) => (e: DragEvent) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/project");
    setDragOver(null);
    const p = d.projects.find((x) => x.id === id);
    if (p && p.stage !== stage) actions.setStage(id, stage);
  };

  return (
    <div className={"page projects-page mode-" + mode}>
      <Header
        title="Dự án"
        eyebrow={`${list.length} dự án`}
        center={
          <div className="segmented" role="tablist" aria-label="Kiểu xem">
            <button role="tab" aria-selected={mode === "list"} className={mode === "list" ? "on" : ""} onClick={() => setMode("list")}><Icon name="menu" size={14} />Danh sách</button>
            <button role="tab" aria-selected={mode === "board"} className={mode === "board" ? "on" : ""} onClick={() => setMode("board")}><Icon name="board" size={14} />Bảng</button>
          </div>
        }
        search={{ value: q, onChange: setQ, placeholder: "Tìm dự án, khách, địa điểm" }}
        actions={<button className="icon-btn primary" aria-label="Tạo dự án" title="Tạo dự án" onClick={() => setCreating(true)}><Icon name="plus" /></button>}
      />

      {mode === "list" ? (
        <div className="pills" role="tablist" aria-label="Lọc theo bước">
          {([{ id: "active", label: "Đang làm" }, ...STAGES.map((s) => ({ id: s.id, label: s.label })), { id: "all", label: "Tất cả" }] as { id: typeof filter; label: string }[]).map((f) => (
            <button key={f.id} role="tab" aria-selected={filter === f.id} className={"pill" + (filter === f.id ? " on" : "")} onClick={() => setFilter(f.id)}>
              {f.label} <span>{count(f.id)}</span>
            </button>
          ))}
        </div>
      ) : null}

      {mode === "list" ? (
        <div className="split">
          <div className="card table-wrap">
            <table className="mtable">
              <thead>
                <tr>
                  {th("name", "Tên dự án", "c-name")}
                  {th("client", "Khách hàng")}
                  {th("type", "Loại", "c-type")}
                  {th("date", "Ngày chụp")}
                  {th("stage", "Trạng thái")}
                  {th("deadline", "Hạn giao")}
                  {th("total", "Giá trị", "num")}
                  {th("paid", "Đã thu", "num")}
                </tr>
              </thead>
              <tbody>
                {list.map((p) => {
                  const idx = stageIndex(p);
                  const left = daysBetween(t, p.deadline);
                  const paid = projectPaid(d, p.id);
                  const pct = p.total ? Math.round((paid / p.total) * 100) : 0;
                  return (
                    <tr key={p.id} className={selected === p.id ? "sel" : ""} onClick={() => setSelected(p.id)} onDoubleClick={() => go({ view: "projects", projectId: p.id })}
                      tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") go({ view: "projects", projectId: p.id }); }} aria-selected={selected === p.id}>
                      <td className="c-name"><span className="thumb-xs" style={{ background: coverOf(d, p) }} /><strong>{p.name}</strong></td>
                      <td>{clientOf(d, p.clientId)?.name ?? "—"}</td>
                      <td className="muted c-type">{p.type}</td>
                      <td>{fmtDate(p.date)}</td>
                      <td><span className={"badge tone-" + STAGE_TONE[p.stage]}>{STAGES[idx].label}</span></td>
                      <td className={p.stage !== "delivered" && left < 0 ? "danger" : p.stage !== "delivered" && left <= 3 ? "warn" : ""}>
                        {p.stage === "delivered" ? "—" : left < 0 ? `Trễ ${-left} ngày` : left === 0 ? "Hôm nay" : `${left} ngày`}
                      </td>
                      <td className="num">{money(p.total)}</td>
                      <td className="num"><span className="mini-meter"><span style={{ width: pct + "%" }} /></span>{pct}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {list.length === 0 ? <p className="empty">{d.projects.length ? "Không có dự án nào khớp bộ lọc." : "Chưa có dự án. Bấm + để tạo."}</p> : null}
          </div>

          <aside className={"inspector card" + (sel ? "" : " empty-insp")} aria-label="Thông tin dự án">
            {sel ? <Inspector p={sel} go={go} /> : <p className="empty">Chọn một dự án để xem nhanh.<br />Bấm đúp để mở.</p>}
          </aside>
        </div>
      ) : (
        <div className="board">
          {STAGES.map((s) => {
            const items = d.projects.filter((p) => p.stage === s.id && matches(p)).sort((a, b) => a.deadline.localeCompare(b.deadline));
            return (
              <section key={s.id} className={"board-col" + (dragOver === s.id ? " over" : "")}
                onDragOver={(e) => { e.preventDefault(); setDragOver(s.id); }} onDragLeave={() => setDragOver(null)} onDrop={onDrop(s.id)} aria-label={s.label}>
                <header className="board-head">
                  <i style={{ background: `var(--stage-${s.id})` }} /><strong>{s.label}</strong><span>{items.length}</span>
                </header>
                <div className="board-list">
                  {items.map((p) => {
                    const note = projectNote(d, p);
                    return (
                      <button key={p.id} className="board-card" draggable onDragStart={(e) => { e.dataTransfer.setData("text/project", p.id); e.dataTransfer.effectAllowed = "move"; }}
                        onClick={() => go({ view: "projects", projectId: p.id })}>
                        <span className="bc-cover" style={{ background: coverOf(d, p) }} />
                        <strong>{p.name}</strong>
                        <small>{clientOf(d, p.clientId)?.name ?? "—"} · {fmtDate(p.date).slice(0, 5)}</small>
                        <small className={note.danger ? "danger" : ""}>{note.text}</small>
                        <span className="bc-foot"><span>{money(p.total)}</span>{p.photographers ? <span className="bc-people">{p.photographers}</span> : null}</span>
                      </button>
                    );
                  })}
                  {items.length === 0 ? <span className="board-empty">Kéo dự án vào đây</span> : null}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* Phones: cards instead of the table */}
      <div className="project-grid phone-only">
        {list.map((p) => {
          const idx = stageIndex(p);
          const note = projectNote(d, p);
          return (
            <button key={p.id} className="card project-card" onClick={() => go({ view: "projects", projectId: p.id })}>
              <span className="thumb" style={{ background: coverOf(d, p) }} />
              <span className="project-main">
                <span className="project-top"><strong>{p.name}</strong><span className={"badge tone-" + STAGE_TONE[p.stage]}>{STAGES[idx].label}</span></span>
                <small>{clientOf(d, p.clientId)?.name ?? "—"} · {p.type} · {fmtDate(p.date)}</small>
                <small className={note.danger ? "danger" : ""}>{note.text}</small>
                <span className="steps">{STAGES.map((st, i) => <span key={st.id} className={p.stage === "delivered" ? "done-all" : i < idx ? "done" : i === idx ? "now" : ""} />)}</span>
              </span>
            </button>
          );
        })}
      </div>

      {creating ? <ProjectForm onClose={() => setCreating(false)} onSaved={(id) => go({ view: "projects", projectId: id })} /> : null}
    </div>
  );
}

function Inspector({ p, go }: { p: Project; go: Go }) {
  const d = useData();
  const idx = stageIndex(p);
  const next = STAGES[idx + 1];
  const client = clientOf(d, p.clientId);
  const paid = projectPaid(d, p.id);
  const photos = d.assets.filter((a) => a.projectId === p.id);
  const note = projectNote(d, p);
  return (
    <div className="insp">
      <span className="insp-cover" style={{ background: coverOf(d, p) }} />
      <div className="insp-title">
        <strong>{p.name}</strong>
        <span className={"badge tone-" + STAGE_TONE[p.stage]}>{STAGES[idx].label}</span>
      </div>
      <p className={"insp-note" + (note.danger ? " danger" : "")}>{note.text}</p>
      <ol className="insp-steps" aria-label="Tiến độ">
        {STAGES.map((s, i) => <li key={s.id} className={p.stage === "delivered" || i < idx ? "done" : i === idx ? "now" : ""} title={s.label} />)}
      </ol>
      <dl className="insp-kv">
        <dt>Khách hàng</dt><dd>{client?.name ?? "—"}</dd>
        <dt>Ngày chụp</dt><dd>{fmtDate(p.date)} · {p.time}</dd>
        <dt>Địa điểm</dt><dd>{p.location || "—"}</dd>
        <dt>Gói</dt><dd>{p.pkgName || "—"} · {p.pkgPhotos} ảnh</dd>
        <dt>Người chụp</dt><dd>{p.photographers || "—"}</dd>
        <dt>Hạn giao</dt><dd>{fmtDate(p.deadline)}</dd>
        <dt>Giá trị</dt><dd>{money(p.total)}</dd>
        <dt>Đã thu</dt><dd>{money(paid)}</dd>
        <dt>Ảnh</dt><dd>{photos.length} · giữ {photos.filter((a) => a.mark === "keep").length}</dd>
      </dl>
      <div className="insp-actions">
        <button className="btn primary" onClick={() => go({ view: "projects", projectId: p.id })}>Mở dự án</button>
        {next ? <button className="btn tinted" onClick={() => actions.setStage(p.id, next.id)}>Sang: {next.label}</button> : null}
        {client ? <button className="btn tinted" onClick={() => go({ view: "inbox", clientId: client.id })}><Icon name="message" size={15} />Nhắn khách</button> : null}
      </div>
    </div>
  );
}
