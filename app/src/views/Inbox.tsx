import { useState } from "react";
import { Header } from "../components/Header";
import { Icon } from "../components/Icon";
import { channelInfo, projects, threads, type Channel } from "../data";
import type { Go, Route } from "../nav";

export function Inbox({ go }: { go: Go; route?: Route }) {
  const [ch, setCh] = useState<Channel | "all">("all");
  const list = threads.filter((t) => ch === "all" || t.channel === ch);

  return (
    <div className="page">
      <Header
        title="Tin nhắn"
        actions={
          <button className="icon-btn primary" aria-label="Soạn tin mới">
            <Icon name="plus" />
          </button>
        }
      />

      <div className="pills" role="tablist" aria-label="Lọc theo kênh">
        <button role="tab" aria-selected={ch === "all"} className={"pill" + (ch === "all" ? " on" : "")} onClick={() => setCh("all")}>
          Tất cả
        </button>
        {(Object.keys(channelInfo) as Channel[]).map((c) => (
          <button key={c} role="tab" aria-selected={ch === c} className={"pill" + (ch === c ? " on" : "")} onClick={() => setCh(c)}>
            <span className="dot-sm" style={{ background: channelInfo[c].color }} />
            {channelInfo[c].label}
          </button>
        ))}
      </div>

      <div className="card list">
        {list.map((t) => {
          const p = projects.find((x) => x.name === t.project);
          return (
            <button key={t.name} className="row thread" onClick={() => p && go({ view: "projects", projectId: p.id })}>
              <span className="avatar">
                {t.initials}
                <span className="avatar-ch" style={{ background: channelInfo[t.channel].color }} />
              </span>
              <span className="row-main">
                <span className="thread-top">
                  <strong className={t.unread ? "" : "read"}>{t.name}</strong>
                  <small>{t.time}</small>
                </span>
                <span className={"thread-msg" + (t.unread ? " unread" : "")}>{t.message}</span>
                <span className="tag">{t.project}</span>
              </span>
              {t.unread ? <span className="unread-dot" aria-label="Chưa đọc" /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
