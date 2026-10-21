import type { ReactNode } from "react";

// Page header: a draggable toolbar strip on desktop, a large title on phones.
export function Header({ title, eyebrow, actions }: { title: string; eyebrow?: string; actions?: ReactNode }) {
  return (
    <header className="page-header" data-tauri-drag-region>
      <div className="page-title" data-tauri-drag-region>
        {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
        <h1>{title}</h1>
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  );
}
