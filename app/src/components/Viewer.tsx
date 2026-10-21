import { useEffect } from "react";
import { Icon } from "./Icon";
import { actions, type Asset, type Mark } from "../store";
import { fileUrl } from "../native";

// Full-screen culling viewer. Keys: ←/→ move, P keep, X reject, U clear, 0–5 stars, Esc close.
export function Viewer({ assets, index, onIndex, onClose }: { assets: Asset[]; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const a = assets[index];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!a) return;
      const k = e.key.toLowerCase();
      if (k === "escape") onClose();
      else if (k === "arrowright") onIndex(Math.min(index + 1, assets.length - 1));
      else if (k === "arrowleft") onIndex(Math.max(index - 1, 0));
      else if (k === "p" || k === "x" || k === "u") {
        actions.updateAsset(a.id, { mark: ({ p: "keep", x: "reject", u: "none" } as Record<string, Mark>)[k] });
        if (k !== "u") onIndex(Math.min(index + 1, assets.length - 1));
      } else if (/^[0-5]$/.test(k)) actions.updateAsset(a.id, { rating: Number(k) });
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [a, index, assets.length, onIndex, onClose]);

  if (!a) return null;
  const src = fileUrl(a.jpgPath) ?? fileUrl(a.thumbPath);

  return (
    <div className="viewer" role="dialog" aria-modal="true" aria-label={`Xem ảnh ${a.base}`}>
      <div className="viewer-top">
        <button className="viewer-btn" onClick={onClose} aria-label="Đóng"><Icon name="x" size={20} /></button>
        <span>{a.base} · {index + 1}/{assets.length}</span>
        <span className="viewer-keys">← → chuyển · P giữ · X loại · U bỏ đánh dấu · 1–5 sao</span>
      </div>
      <div className="viewer-stage">
        <button className="viewer-nav" onClick={() => onIndex(Math.max(index - 1, 0))} disabled={index === 0} aria-label="Ảnh trước"><Icon name="chevronLeft" size={28} /></button>
        {src ? <img src={src} alt={a.base} /> : <div className="viewer-ph" style={{ background: a.color }}><span>{a.base}</span></div>}
        <button className="viewer-nav" onClick={() => onIndex(Math.min(index + 1, assets.length - 1))} disabled={index === assets.length - 1} aria-label="Ảnh sau"><Icon name="chevronRight" size={28} /></button>
      </div>
      <div className="viewer-bar">
        <div className="stars" role="group" aria-label="Đánh giá sao">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} className={n <= a.rating ? "on" : ""} onClick={() => actions.updateAsset(a.id, { rating: a.rating === n ? 0 : n })} aria-label={`${n} sao`}>
              <Icon name="star" size={20} />
            </button>
          ))}
        </div>
        <div className="mark-btns">
          <button className={"mark keep" + (a.mark === "keep" ? " on" : "")} onClick={() => actions.updateAsset(a.id, { mark: a.mark === "keep" ? "none" : "keep" })}><Icon name="check" size={18} stroke={2.6} />Giữ</button>
          <button className={"mark reject" + (a.mark === "reject" ? " on" : "")} onClick={() => actions.updateAsset(a.id, { mark: a.mark === "reject" ? "none" : "reject" })}><Icon name="x" size={18} stroke={2.6} />Loại</button>
        </div>
        <small>{a.rawPath ? "RAW + JPG" : "JPG"}{a.picked ? " · Khách đã chọn" : ""}</small>
      </div>
    </div>
  );
}
