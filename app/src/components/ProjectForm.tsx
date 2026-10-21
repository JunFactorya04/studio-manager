import { useState } from "react";
import { Field, Sheet } from "./Sheet";
import { PROJECT_TYPES, STAGES, actions, addDays, today, useData, type Channel, type Project, type Stage } from "../store";

type Draft = Omit<Project, "id" | "createdAt">;

// Create or edit a project. Lets the user pick an existing client or add a new one inline.
export function ProjectForm({ project, onClose, onSaved }: { project?: Project; onClose: () => void; onSaved?: (id: string) => void }) {
  const d = useData();
  const [draft, setDraft] = useState<Draft>(
    project ?? {
      name: "", clientId: d.clients[0]?.id ?? "", type: PROJECT_TYPES[0], date: addDays(today(), 7), time: "09:00", durationH: 2,
      location: "", stage: "quote", deadline: addDays(today(), 21), pkgName: "", pkgPhotos: 30, photographers: "", nasPath: "", total: 0, note: "",
    },
  );
  const [newClient, setNewClient] = useState(d.clients.length === 0);
  const [client, setClient] = useState({ name: "", phone: "", email: "", channel: "line" as Channel });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => { setDraft((x) => ({ ...x, [k]: v })); setErrors((e) => ({ ...e, [k]: "" })); };

  const save = () => {
    const e: Record<string, string> = {};
    if (!draft.name.trim()) e.name = "Nhập tên dự án.";
    if (newClient && !client.name.trim()) e.client = "Nhập tên khách hàng.";
    if (!newClient && !draft.clientId) e.client = "Chọn khách hàng.";
    if (!draft.date) e.date = "Chọn ngày chụp.";
    if (draft.total < 0) e.total = "Giá không hợp lệ.";
    if (Object.values(e).some(Boolean)) return setErrors(e);

    let clientId = draft.clientId;
    if (newClient) clientId = actions.addClient({ ...client, note: "" }).id;
    const data = { ...draft, name: draft.name.trim(), clientId };
    if (project) { actions.updateProject(project.id, data); onSaved?.(project.id); }
    else { const p = actions.addProject(data); onSaved?.(p.id); }
    onClose();
  };

  return (
    <Sheet title={project ? "Sửa dự án" : "Dự án mới"} onClose={onClose} wide footer={
      <>
        <button className="btn ghost" onClick={onClose}>Hủy</button>
        <button className="btn primary sm" onClick={save}>{project ? "Lưu" : "Tạo dự án"}</button>
      </>
    }>
      <Field label="Tên dự án" error={errors.name}>
        <input className="input" value={draft.name} onChange={(e) => set("name", e.target.value)} placeholder="Lan & Minh" autoFocus />
      </Field>

      <div className="f-row">
        <Field label="Khách hàng" error={errors.client}>
          {newClient ? (
            <input className="input" value={client.name} onChange={(e) => { setClient({ ...client, name: e.target.value }); setErrors({ ...errors, client: "" }); }} placeholder="Tên khách hàng" />
          ) : (
            <select className="select" value={draft.clientId} onChange={(e) => set("clientId", e.target.value)}>
              {d.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
        </Field>
        <Field label="Loại chụp">
          <select className="select" value={draft.type} onChange={(e) => set("type", e.target.value)}>
            {PROJECT_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </Field>
      </div>
      {d.clients.length > 0 ? (
        <button type="button" className="link" style={{ alignSelf: "flex-start" }} onClick={() => setNewClient(!newClient)}>
          {newClient ? "Chọn khách có sẵn" : "+ Khách hàng mới"}
        </button>
      ) : null}
      {newClient ? (
        <div className="f-row">
          <Field label="Điện thoại"><input className="input" value={client.phone} onChange={(e) => setClient({ ...client, phone: e.target.value })} placeholder="0912 345 678" /></Field>
          <Field label="Kênh liên hệ">
            <select className="select" value={client.channel} onChange={(e) => setClient({ ...client, channel: e.target.value as Channel })}>
              <option value="line">LINE</option><option value="messenger">Messenger</option><option value="zalo">Zalo</option><option value="email">Email</option>
            </select>
          </Field>
        </div>
      ) : null}

      <div className="f-row">
        <Field label="Ngày chụp" error={errors.date}><input className="input" type="date" value={draft.date} onChange={(e) => set("date", e.target.value)} /></Field>
        <Field label="Giờ bắt đầu"><input className="input" type="time" value={draft.time} onChange={(e) => set("time", e.target.value)} /></Field>
      </div>
      <div className="f-row">
        <Field label="Thời lượng (giờ)"><input className="input" type="number" min={0.5} step={0.5} value={draft.durationH} onChange={(e) => set("durationH", Number(e.target.value))} /></Field>
        <Field label="Địa điểm"><input className="input" value={draft.location} onChange={(e) => set("location", e.target.value)} placeholder="Studio A" /></Field>
      </div>
      <div className="f-row">
        <Field label="Gói dịch vụ"><input className="input" value={draft.pkgName} onChange={(e) => set("pkgName", e.target.value)} placeholder="Gói Vàng" /></Field>
        <Field label="Số ảnh chỉnh trong gói"><input className="input" type="number" min={0} value={draft.pkgPhotos} onChange={(e) => set("pkgPhotos", Number(e.target.value))} /></Field>
      </div>
      <div className="f-row">
        <Field label="Tổng giá (NT$)" error={errors.total}><input className="input" type="number" min={0} step={500} value={draft.total} onChange={(e) => set("total", Number(e.target.value))} /></Field>
        <Field label="Hạn giao ảnh"><input className="input" type="date" value={draft.deadline} onChange={(e) => set("deadline", e.target.value)} /></Field>
      </div>
      <div className="f-row">
        <Field label="Người chụp"><input className="input" value={draft.photographers} onChange={(e) => set("photographers", e.target.value)} placeholder="Huy, Ngọc" /></Field>
        <Field label="Trạng thái">
          <select className="select" value={draft.stage} onChange={(e) => set("stage", e.target.value as Stage)}>
            {STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Ghi chú"><textarea className="textarea" value={draft.note} onChange={(e) => set("note", e.target.value)} placeholder="Yêu cầu riêng của khách, trang phục, concept…" /></Field>
    </Sheet>
  );
}
