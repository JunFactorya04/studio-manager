import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

const openSheets: object[] = [];

// Modal sheet: centered dialog on desktop, bottom sheet on phones.
export function Sheet({
  title, onClose, children, footer, wide,
}: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  // Only the topmost sheet reacts to Escape, so closing a preview does not also close the form under it.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const token = {};
    openSheets.push(token);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && openSheets[openSheets.length - 1] === token) closeRef.current(); };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); openSheets.splice(openSheets.indexOf(token), 1); };
  }, []);

  // Portal to <body> so a sheet opened from inside another sheet still covers the whole window.
  return createPortal(
    <div className="sheet-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={"sheet" + (wide ? " wide" : "")} role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-head">
          <button className="sheet-cancel" onClick={onClose}>Hủy</button>
          <h2>{title}</h2>
          <span className="sheet-spacer" />
        </div>
        <div className="sheet-body">{children}</div>
        {footer ? <div className="sheet-foot">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

export function Field({ label, children, hint, error }: { label: string; children: ReactNode; hint?: string; error?: string }) {
  return (
    <label className="f-field">
      <span className="f-label">{label}</span>
      {children}
      {error ? <span className="f-error" role="alert">{error}</span> : hint ? <span className="f-hint">{hint}</span> : null}
    </label>
  );
}

export function Confirm({ title, text, confirmLabel, onConfirm, onClose }: { title: string; text: string; confirmLabel: string; onConfirm: () => void; onClose: () => void }) {
  return (
    <Sheet title={title} onClose={onClose} footer={
      <>
        <button className="btn ghost" onClick={onClose}>Hủy</button>
        <button className="btn danger" onClick={() => { onConfirm(); onClose(); }}>{confirmLabel}</button>
      </>
    }>
      <p className="confirm-text">{text}</p>
    </Sheet>
  );
}
