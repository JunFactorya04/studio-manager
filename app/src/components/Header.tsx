import type { ReactNode } from "react";
import { Icon } from "./Icon";

// Unified window toolbar on desktop (title + controls in the title bar, like Finder or Mail);
// on phones the same markup renders as an iOS large-title header.
export function Header({
  title, eyebrow, actions, back, center, search,
}: {
  title: string;
  eyebrow?: string;
  actions?: ReactNode;
  back?: { label: string; onClick: () => void };
  center?: ReactNode;
  search?: { value: string; onChange: (v: string) => void; placeholder: string };
}) {
  return (
    <header className="page-header tb" data-tauri-drag-region>
      {back ? (
        <button className="tb-back" onClick={back.onClick} aria-label={`Quay lại ${back.label}`}>
          <Icon name="chevronLeft" size={16} stroke={2.4} />
          <span>{back.label}</span>
        </button>
      ) : null}
      <div className="page-title" data-tauri-drag-region>
        {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
        <h1>{title}</h1>
      </div>
      {center ? <div className="tb-center">{center}</div> : <span className="tb-flex" data-tauri-drag-region />}
      {search ? (
        <label className="tb-search">
          <Icon name="search" size={14} stroke={2.2} />
          <span className="sr-only">{search.placeholder}</span>
          <input type="search" placeholder={search.placeholder} value={search.value} onChange={(e) => search.onChange(e.target.value)} />
        </label>
      ) : null}
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  );
}
