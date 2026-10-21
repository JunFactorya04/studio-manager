import { useState } from "react";
import { Icon } from "./components/Icon";
import { NAV, type Route } from "./nav";
import { useData } from "./store";
import { Dashboard } from "./views/Dashboard";
import { Projects } from "./views/Projects";
import { ProjectDetail } from "./views/ProjectDetail";
import { ClientGallery } from "./views/ClientGallery";
import { Library } from "./views/Library";
import { Inbox } from "./views/Inbox";
import { Finance } from "./views/Finance";
import { Login } from "./views/Login";
import { WindowControls } from "./components/WindowControls";

export default function App() {
  const d = useData();
  const [signedIn, setSignedIn] = useState(false);
  const [route, setRoute] = useState<Route>({ view: "dashboard" });
  if (!signedIn) return <Login onLogin={() => setSignedIn(true)} />;

  const go = (r: Route) => {
    setRoute(r);
    document.querySelector(".content")?.scrollTo(0, 0);
  };

  const unread = d.messages.filter((m) => m.dir === "in" && !m.read).length;
  const badge = (view: Route["view"]) => (view === "inbox" && unread ? unread : 0);
  const project = route.view === "projects" && route.projectId ? d.projects.find((p) => p.id === route.projectId) : undefined;

  let screen;
  if (project && route.gallery) screen = <ClientGallery key={project.id} project={project} go={go} />;
  else if (project) screen = <ProjectDetail key={project.id} project={project} go={go} />;
  else if (route.view === "projects") screen = <Projects go={go} />;
  else if (route.view === "library") screen = <Library go={go} route={route} />;
  else if (route.view === "inbox") screen = <Inbox go={go} route={route} />;
  else if (route.view === "finance") screen = <Finance go={go} />;
  else screen = <Dashboard go={go} />;

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-drag" data-tauri-drag-region>
          <WindowControls />
        </div>
        <div className="sidebar-brand">Studio Manager</div>
        <nav aria-label="Điều hướng chính" className="sidebar-nav">
          {NAV.map((item) => {
            const active = route.view === item.view;
            const b = badge(item.view);
            return (
              <button
                key={item.view}
                className={"side-item" + (active ? " active" : "")}
                aria-current={active ? "page" : undefined}
                onClick={() => go({ view: item.view })}
              >
                <Icon name={item.icon} size={18} />
                <span>{item.label}</span>
                {b ? <span className="side-badge">{b}</span> : null}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-foot">
          <Icon name="server" size={16} />
          <span>Dữ liệu lưu trên máy này</span>
        </div>
      </aside>

      <main className="content">{screen}</main>

      <nav aria-label="Điều hướng chính" className="tabbar">
        {NAV.map((item) => {
          const active = route.view === item.view;
          const b = badge(item.view);
          return (
            <button
              key={item.view}
              className={"tab" + (active ? " active" : "")}
              aria-current={active ? "page" : undefined}
              onClick={() => go({ view: item.view })}
            >
              <Icon name={item.icon} size={22} />
              <span>{item.label}</span>
              {b ? <span className="tab-badge">{b}</span> : null}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
