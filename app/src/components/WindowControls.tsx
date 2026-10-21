import { getCurrentWindow } from "@tauri-apps/api/window";

// macOS-style traffic lights. Shown only on Windows/Linux desktop builds,
// where the native title bar is turned off (see tauri.windows.conf.json).
// On a real Mac the system draws its own buttons.
export const needsCustomControls =
  "__TAURI_INTERNALS__" in window && !navigator.userAgent.includes("Mac");

export function WindowControls() {
  if (!needsCustomControls) return null;
  const win = getCurrentWindow();
  return (
    <div className="traffic" role="group" aria-label="Điều khiển cửa sổ">
      <button className="tl close" aria-label="Đóng" onClick={() => win.close()} />
      <button className="tl min" aria-label="Thu nhỏ" onClick={() => win.minimize()} />
      <button className="tl max" aria-label="Phóng to" onClick={() => win.toggleMaximize()} />
    </div>
  );
}
