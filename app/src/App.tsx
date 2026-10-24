import { useState } from "react";
import { Icon } from "./components/Icon";
import { NAV, OPS_NAV, type Route } from "./nav";
import { STAGES, initials, useData } from "./store";
import { Dashboard } from "./views/Dashboard";
import { Projects } from "./views/Projects";
import { ProjectDetail } from "./views/ProjectDetail";
import { ClientGallery } from "./views/ClientGallery";
import { Library } from "./views/Library";
import { Inbox } from "./views/Inbox";
import { Finance } from "./views/Finance";
import { Calendar } from "./views/Calendar";
import { Login } from "./views/Login";
import { More } from "./views/More";
import { OpsOverview } from "./views/OpsOverview";
import { Events } from "./views/Events";
import { WindowControls } from "./components/WindowControls";
import { SettingsSheet } from "./components/SettingsSheet";

const STAGE_DOT: Record<string, string> = {
  quote: "var(--stage-quote)", deposit: "var(--stage-deposit)", shoot: "var(--stage-shoot)", cull: "var(--stage-cull)",
  edit: "var(--stage-edit)", review: "var(--stage-review)", delivered: "var(--stage-delivered)",
};

export default function App() {
  const d = useData();
  const [signedIn, setSignedIn] = useState(false);
  const [route, setRoute] = useState<Route>({ view: "dashboard" });
  const [settings, setSettings] = useState(false);
  if (!signedIn) return <Login onLogin={() => setSignedIn(true)} />;

  const go = (r: Route) => {
    setRoute(r);
    document.querySelector(".content")?.scrollTo(0, 0);
  };

  const unread = d.messages.filter((m) => m.dir === "in" && !m.read).length;
  const toCull = d.assets.filter((a) => a.mark === "none").length;
  const kept = d.assets.filter((a) => a.mark === "keep").length;
  const picked = d.assets.filter((a) => a.picked).length;
  const active = d.projects.filter((p) => p.stage !== "delivered").sort((a, b) => a.deadline.localeCompare(b.deadline));
  const count = (view: Route["view"]) =>
    view === "inbox" ? unread : view === "projects" ? active.length : 0;

  const project = route.view === "projects" && route.projectId ? d.projects.find((p) => p.id === route.projectId) : undefined;

  let screen;
  if (project && route.gallery) screen = <ClientGallery key={project.id} project={project} go={go} />;
  else if (project) screen = <ProjectDetail key={project.id} project={project} go={go} />;
  else if (route.view === "projects") screen = <Projects go={go} />;
  else if (route.view === "calendar") screen = <Calendar go={go} />;
  else if (route.view === "library") screen = <Library key={(route.photos ?? "") + (route.projectId ?? "")} go={go} route={route} />;
  else if (route.view === "inbox") screen = <Inbox go={go} route={route} />;
  else if (route.view === "finance") screen = <Finance go={go} />;
  else if (route.view === "more") screen = <More go={go} openSettings={() => setSettings(true)} />;
  else if (route.view === "ops") screen = <OpsOverview go={go} />;
  else if (route.view === "events") screen = <Events key={route.eventId ?? ""} go={go} route={route} />;
  else screen = <Dashboard go={go} />;

  const isActive = (view: Route["view"]) => route.view === view && !route.projectId && !route.photos;

  return (
    <div className="app">
      <aside className="sidebar" aria-label="Thanh bên">
        <div className="sidebar-drag" data-tauri-drag-region>
          <WindowControls />
        </div>

        <nav aria-label="Điều hướng chính" className="sidebar-nav">
          {NAV.map((item) => {
            const n = count(item.view);
            return (
              <button
                key={item.view}
                className={"side-item" + (isActive(item.view) ? " active" : "")}
                aria-current={isActive(item.view) ? "page" : undefined}
                onClick={() => go({ view: item.view })}
              >
                <Icon name={item.icon} size={16} />
                <span>{item.label}</span>
                {n ? <span className={"side-count" + (item.view === "inbox" ? " strong" : "")}>{n}</span> : null}
              </button>
            );
          })}
        </nav>

        <div className="side-section">
          <span className="side-head">Vận hành</span>
          {OPS_NAV.map((item) => (
            <button key={item.view} className={"side-item" + (isActive(item.view) ? " active" : "")} aria-current={isActive(item.view) ? "page" : undefined} onClick={() => go({ view: item.view })}>
              <Icon name={item.icon} size={16} />
              <span className="side-label">{item.label}</span>
            </button>
          ))}
        </div>

        <div className="side-section">
          <span className="side-head">Đang thực hiện</span>
          {active.slice(0, 7).map((p) => {
            const on = route.projectId === p.id && route.view === "projects";
            return (
              <button key={p.id} className={"side-item small" + (on ? " active" : "")} onClick={() => go({ view: "projects", projectId: p.id })} title={STAGES.find((s) => s.id === p.stage)?.label}>
                <span className="side-dot" style={{ background: STAGE_DOT[p.stage] }} />
                <span className="side-label">{p.name}</span>
              </button>
            );
          })}
          {active.length === 0 ? <span className="side-empty">Chưa có dự án</span> : null}
        </div>

        <div className="side-section">
          <span className="side-head">Ảnh</span>
          {([
            ["none", "Chờ lọc", toCull, "eye"],
            ["keep", "Đã giữ", kept, "check"],
            ["picked", "Khách đã chọn", picked, "heart"],
          ] as const).map(([key, label, n, icon]) => (
            <button key={key} className={"side-item small" + (route.view === "library" && route.photos === key ? " active" : "")} onClick={() => go({ view: "library", photos: key })}>
              <Icon name={icon} size={15} />
              <span className="side-label">{label}</span>
              {n ? <span className="side-count">{n}</span> : null}
            </button>
          ))}
        </div>

        <div className="sidebar-foot">
          <span className="side-avatar" aria-hidden="true">{initials(d.settings.studioName || "Studio")}</span>
          <span className="side-studio">
            <strong>{d.settings.studioName || "Studio"}</strong>
            <small>{d.settings.nasRoot ? "NAS đã cấu hình" : "Dữ liệu trên máy này"}</small>
          </span>
          <button className="side-gear" aria-label="Cài đặt" onClick={() => setSettings(true)}><Icon name="settings" size={16} /></button>
        </div>
      </aside>

      <main className="content">{screen}</main>

      <nav aria-label="Điều hướng chính" className="tabbar">
        {NAV.filter((n) => n.mobile).map((item) => {
          const active = route.view === item.view;
          const b = item.view === "inbox" ? unread : 0;
          return (
            <button key={item.view} className={"tab" + (active ? " active" : "")} aria-current={active ? "page" : undefined} onClick={() => go({ view: item.view })}>
              <Icon name={item.icon} size={22} />
              <span>{item.short}</span>
              {b ? <span className="tab-badge">{b}</span> : null}
            </button>
          );
        })}
        {(() => {
          const onMore = !NAV.some((n) => n.mobile && n.view === route.view) && !project;
          return (
            <button className={"tab" + (onMore ? " active" : "")} aria-current={onMore ? "page" : undefined} onClick={() => go({ view: "more" })}>
              <Icon name="more" size={22} />
              <span>Thêm</span>
            </button>
          );
        })()}
      </nav>

      {settings ? <SettingsSheet onClose={() => setSettings(false)} /> : null}
    </div>
  );
}
