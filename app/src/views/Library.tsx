import { useState } from "react";
import { Header } from "../components/Header";
import { Icon } from "../components/Icon";
import { libraryTiles, nas } from "../data";
import type { Go, Route } from "../nav";

type Mark = "keep" | "reject" | "none";
const START: Mark[] = ["keep", "keep", "reject", "none", "keep", "none", "reject", "keep", "none", "keep", "none", "none"];
const TABS: { id: Mark | "all"; label: string }[] = [
  { id: "all", label: "Tất cả" },
  { id: "keep", label: "Giữ" },
  { id: "reject", label: "Loại" },
  { id: "none", label: "Chưa xem" },
];

export function Library({ go }: { go: Go; route?: Route }) {
  const [marks, setMarks] = useState<Mark[]>(START);
  const [tab, setTab] = useState<Mark | "all">("all");
  const pct = Math.round((nas.usedTB / nas.totalTB) * 100);

  // One tap cycles a RAW + JPG pair: chưa xem → giữ → loại → chưa xem.
  const cycle = (i: number) =>
    setMarks((m) => m.map((v, j) => (j !== i ? v : v === "none" ? "keep" : v === "keep" ? "reject" : "none")));

  return (
    <div className="page">
      <Header
        title="Thư viện"
        actions={
          <button className="icon-btn primary" aria-label="Nhập ảnh từ thẻ nhớ">
            <Icon name="sd" />
          </button>
        }
      />

      <div className="card storage">
        <div className="storage-nas">
          <div className="storage-top"><strong>NAS studio</strong><small>{nas.usedTB.toLocaleString("vi-VN")} / {nas.totalTB} TB</small></div>
          <span className="meter green"><span style={{ width: pct + "%" }} /></span>
        </div>
        <div className="storage-cloud"><strong>Cloud preview</strong><small className="success">Đã đồng bộ</small></div>
      </div>

      <div className="segmented" role="tablist" aria-label="Trạng thái chọn lọc">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? "on" : ""} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      <button className="group-head" onClick={() => go({ view: "projects", projectId: "lan-minh" })}>
        <strong>Lan &amp; Minh · 18/10</strong>
        <small>624 cặp RAW + JPG</small>
      </button>
      <div className="photo-grid">
        {libraryTiles.map((bg, i) =>
          tab === "all" || marks[i] === tab ? (
            <button
              key={i}
              className={"tile" + (marks[i] === "reject" ? " rejected" : "")}
              style={{ background: bg }}
              aria-label={`Ảnh ${i + 1}: ${marks[i] === "keep" ? "giữ" : marks[i] === "reject" ? "loại" : "chưa xem"}`}
              onClick={() => cycle(i)}
            >
              <span className="tile-tag">RAW+JPG</span>
              {marks[i] === "keep" ? <span className="tile-mark keep"><Icon name="check" size={13} stroke={3} /></span> : null}
              {marks[i] === "reject" ? <span className="tile-mark reject"><Icon name="x" size={12} stroke={3} /></span> : null}
            </button>
          ) : null,
        )}
      </div>
    </div>
  );
}
