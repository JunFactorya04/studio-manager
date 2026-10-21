import { Icon } from "../components/Icon";
import { STAGES, channelInfo, libraryTiles, money, type Project } from "../data";
import type { Go } from "../nav";

export function ProjectDetail({ project: p, go }: { project: Project; go: Go }) {
  const idx = STAGES.findIndex((s) => s.id === p.stage);
  const paidPct = Math.round((p.paid / p.total) * 100);
  const ch = channelInfo[p.channel];

  return (
    <div className="page">
      <header className="page-header" data-tauri-drag-region>
        <button className="icon-btn" aria-label="Quay lại Dự án" onClick={() => go({ view: "projects" })}>
          <Icon name="chevronLeft" stroke={2.2} />
        </button>
        <div className="page-actions">
          <button className="icon-btn" aria-label="Gửi tin cho khách" onClick={() => go({ view: "inbox" })}>
            <Icon name="message" />
          </button>
        </div>
      </header>

      <div className="detail-hero">
        <div className="hero-photos">
          <span style={{ background: p.cover }} />
          <span style={{ background: "#CBC3B8" }} />
          <span style={{ background: "#E2DBD1" }} />
        </div>
        <div className="hero-text">
          <div className="hero-title">
            <h1>{p.name}</h1>
            <span className={"badge tone-" + p.tone}>{p.statusLabel}</span>
          </div>
          <p>{p.type} · {p.date} · {p.location}</p>
        </div>
      </div>

      <div className="two-col">
        <div className="col">
          <section className="card pad" aria-label="Tiến độ">
            <ol className="stepper">
              {STAGES.map((s, i) => {
                const state = p.stage === "delivered" || i < idx ? "done" : i === idx ? "now" : "todo";
                return (
                  <li key={s.id} className={state}>
                    <span className="dot">{state === "done" ? <Icon name="check" size={13} stroke={3} /> : null}</span>
                    <span>{s.label}</span>
                  </li>
                );
              })}
            </ol>
            <div className="callout">
              <span>{p.note}</span>
            </div>
          </section>

          <section className="card list" aria-label="Thông tin">
            <div className="kv"><span>Khách hàng</span><span>{p.client}</span></div>
            <div className="kv"><span>Gói dịch vụ</span><span>{p.pkg}</span></div>
            <div className="kv"><span>Người chụp</span><span>{p.photographers}</span></div>
            <button className="kv" onClick={() => go({ view: "inbox" })}>
              <span>Liên hệ</span>
              <span className="kv-link">
                <span className="mini-badge" style={{ color: ch.color, borderColor: ch.color }}>{ch.label}</span>
                Nhắn tin <Icon name="chevronRight" size={16} />
              </span>
            </button>
          </section>

          <section className="card pad" aria-label="Thanh toán">
            <div className="section-head"><h2>Thanh toán</h2><button className="link" onClick={() => go({ view: "finance" })}>Hóa đơn</button></div>
            <span className="meter green"><span style={{ width: paidPct + "%" }} /></span>
            <div className="money-row">
              <div><small>Tổng</small><strong>{money(p.total)}</strong></div>
              <div><small>Đã thu</small><strong className="success">{money(p.paid)}</strong></div>
              <div><small>Còn lại</small><strong>{money(p.total - p.paid)}</strong></div>
            </div>
          </section>
        </div>

        <div className="col">
          <section className="card pad" aria-label="Tệp ảnh">
            <div className="section-head"><h2>Tệp ảnh</h2><button className="link" onClick={() => go({ view: "library" })}>Xem tất cả</button></div>
            <div className="mini-grid">
              {libraryTiles.slice(0, 7).map((c, i) => <span key={i} style={{ background: c }} />)}
              <span className="more">+{Math.max(p.pairs - 7, 0).toLocaleString("vi-VN")}</span>
            </div>
            <ul className="facts">
              <li><Icon name="photo" size={18} /><span>{p.pairs.toLocaleString("vi-VN")} cặp RAW + JPG</span><small>{p.sizeGB} GB</small></li>
              <li><Icon name="server" size={18} /><code>{p.nasPath}</code></li>
              <li className="success"><Icon name="cloud" size={18} /><span>Preview đã đồng bộ lên cloud</span></li>
              <li className="success"><Icon name="shield" size={18} /><span>Sao lưu 3-2-1 hoàn tất</span></li>
            </ul>
          </section>

          <section className="card pad" aria-label="Khách chọn ảnh">
            <div className="section-head"><h2>Khách chọn ảnh</h2><small>{p.selected > 0 ? `Đã chọn ${p.selected}/${p.selectLimit}` : "Chưa gửi link"}</small></div>
            <p className="hint"><Icon name="link" size={18} />Giới hạn {p.selectLimit} ảnh · có mật khẩu · hết hạn sau 14 ngày</p>
            <button className="btn primary"><Icon name="send" size={18} />Gửi link chọn ảnh</button>
            <button className="btn tinted">Xem như khách</button>
          </section>
        </div>
      </div>
    </div>
  );
}
