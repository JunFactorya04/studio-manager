import { Header } from "../components/Header";
import { Icon } from "../components/Icon";
import { NAV, OPS_NAV, type Go, type View } from "../nav";

// iOS "More" tab: everything that does not fit in the tab bar. On desktop the sidebar shows these directly.
export function More({ go, openSettings }: { go: Go; openSettings: () => void }) {
  const row = (view: View, icon: Parameters<typeof Icon>[0]["name"], label: string) => (
    <button key={view} className="row more-row" onClick={() => go({ view })}>
      <span className="chip-icon tone-blue"><Icon name={icon} /></span>
      <span className="row-main"><strong>{label}</strong></span>
      <Icon name="chevronRight" size={18} />
    </button>
  );
  return (
    <div className="page">
      <Header title="Thêm" />
      <h2 className="section-title">Quản lý</h2>
      <div className="card list">
        {NAV.filter((n) => !n.mobile).map((n) => row(n.view, n.icon, n.label))}
      </div>
      <h2 className="section-title">Vận hành</h2>
      <div className="card list">{OPS_NAV.map((n) => row(n.view, n.icon, n.label))}</div>
      <h2 className="section-title">Ứng dụng</h2>
      <div className="card list">
        <button className="row more-row" onClick={openSettings}>
          <span className="chip-icon tone-gray"><Icon name="settings" /></span>
          <span className="row-main"><strong>Cài đặt</strong></span>
          <Icon name="chevronRight" size={18} />
        </button>
      </div>
    </div>
  );
}
