import { useRef, useState } from "react";
import { Confirm, Field, Sheet } from "./Sheet";
import { actions, getState, today, useData, type Data } from "../store";
import { isDesktop, pickFolder } from "../native";
import { getPickServer, setPickServer, DEFAULT_PICK_URL } from "../pickServer";
import { getOps, opsActions, type OpsData } from "../opsStore";

// Studio settings and data backup. All data lives on this device, so a backup file matters.
export function SettingsSheet({ onClose }: { onClose: () => void }) {
  const d = useData();
  const [form, setForm] = useState(d.settings);
  const [confirm, setConfirm] = useState<"demo" | "empty" | null>(null);
  const [status, setStatus] = useState("");
  const [ps, setPs] = useState(getPickServer());
  const fileRef = useRef<HTMLInputElement>(null);

  const save = () => { actions.updateSettings(form); setPickServer(ps); onClose(); };

  const backup = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ ...getState(), ops: getOps() }, null, 2)], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = `studio-manager-backup-${today()}.json`; a.click(); URL.revokeObjectURL(url);
    setStatus("Đã tải file sao lưu.");
  };

  const restore = async (file: File) => {
    try {
      const data = JSON.parse(await file.text()) as Data & { ops?: OpsData };
      if (data.version !== 1 || !Array.isArray(data.projects)) throw new Error("bad");
      const { ops, ...main } = data;
      actions.replaceAll(main as Data);
      if (ops?.version === 1) opsActions.replaceAll(ops);
      setForm(main.settings);
      setStatus(`Đã khôi phục ${data.projects.length} dự án.`);
    } catch {
      setStatus("File không đúng định dạng sao lưu của Studio Manager.");
    }
  };

  return (
    <Sheet title="Cài đặt" onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>Hủy</button><button className="btn primary sm" onClick={save}>Lưu</button></>}>
      <Field label="Tên studio" hint="Hiện trên watermark ảnh khách xem">
        <input className="input" value={form.studioName} onChange={(e) => setForm({ ...form, studioName: e.target.value })} />
      </Field>
      <Field label="Thư mục gốc trên NAS" hint="Ảnh nhập sẽ vào <gốc>/<năm>/<tháng-ngày>_<dự án>">
        <div className="path-pick">
          <input className="input" value={form.nasRoot} onChange={(e) => setForm({ ...form, nasRoot: e.target.value })} placeholder={"\\\\NAS\\Studio hoặc /Volumes/Studio"} />
          {isDesktop ? <button className="chip-btn" onClick={async () => { const p = await pickFolder("Chọn thư mục gốc trên NAS"); if (p) setForm({ ...form, nasRoot: p }); }}>Chọn</button> : null}
        </div>
      </Field>
      <Field label="Mẫu tên file khi nhập" hint="{date} ngày chụp · {project} tên dự án · {n} số thứ tự · {orig} tên gốc">
        <input className="input" value={form.renamePattern} onChange={(e) => setForm({ ...form, renamePattern: e.target.value })} />
      </Field>

      <Field label="Máy chủ chọn ảnh" hint="Địa chỉ máy chủ nhận ảnh khách chọn. Khóa chỉ lưu trên máy này, không nằm trong file sao lưu.">
        <input className="input" value={ps.url} onChange={(e) => setPs({ ...ps, url: e.target.value })} placeholder={DEFAULT_PICK_URL} />
      </Field>
      <Field label="Khóa studio"><input className="input" type="password" autoComplete="off" value={ps.key} onChange={(e) => setPs({ ...ps, key: e.target.value })} /></Field>

      <div className="card list">
        <div className="toggle-row">
          <span><strong>Sao lưu dữ liệu</strong><small>Dự án, khách, hóa đơn, tin nhắn, sự kiện và hàng đợi vận hành. Ảnh gốc nằm trên NAS, không nằm trong file này.</small></span>
          <button className="chip-btn" onClick={backup}>Tải về</button>
        </div>
        <div className="toggle-row">
          <span><strong>Khôi phục từ file</strong><small>Thay toàn bộ dữ liệu hiện tại</small></span>
          <button className="chip-btn" onClick={() => fileRef.current?.click()}>Chọn file</button>
          <input ref={fileRef} type="file" accept="application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) restore(f); e.target.value = ""; }} />
        </div>
        <div className="toggle-row">
          <span><strong>Bắt đầu dùng thật</strong><small>Xóa dữ liệu mẫu, giữ cài đặt</small></span>
          <button className="chip-btn danger" onClick={() => setConfirm("empty")}>Xóa dữ liệu mẫu</button>
        </div>
        <div className="toggle-row">
          <span><strong>Nạp lại dữ liệu mẫu</strong><small>Để thử các chức năng</small></span>
          <button className="chip-btn" onClick={() => setConfirm("demo")}>Nạp</button>
        </div>
      </div>
      {status ? <small className="success" role="status">{status}</small> : null}

      {confirm ? (
        <Confirm
          title={confirm === "empty" ? "Xóa dữ liệu mẫu" : "Nạp dữ liệu mẫu"}
          text={confirm === "empty" ? "Xóa mọi dự án, khách, hóa đơn và tin nhắn trong app để bắt đầu dùng thật? Nên tải bản sao lưu trước." : "Thay dữ liệu hiện tại bằng dữ liệu mẫu? Nên tải bản sao lưu trước."}
          confirmLabel={confirm === "empty" ? "Xóa" : "Nạp"}
          onConfirm={() => { if (confirm === "empty") { actions.clearAll(); opsActions.clearDemo(); } else actions.reset(); setStatus(confirm === "empty" ? "Đã xóa dữ liệu mẫu." : "Đã nạp dữ liệu mẫu."); }}
          onClose={() => setConfirm(null)}
        />
      ) : null}
    </Sheet>
  );
}
