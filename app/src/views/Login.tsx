import { useRef, useState, type FormEvent, type PointerEvent } from "react";
import { Icon } from "../components/Icon";

// Glass login card. The card tilts toward the pointer and a light glare follows it.
// Tilt values are written straight to CSS variables (no React re-render per mouse move).
export function Login({ onLogin }: { onLogin: () => void }) {
  const card = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [showPw, setShowPw] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const reduceMotion = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const move = (e: PointerEvent<HTMLDivElement>) => {
    const el = card.current;
    if (!el || reduceMotion) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width; // 0..1
    const y = (e.clientY - r.top) / r.height;
    el.style.setProperty("--rx", ((0.5 - y) * 10).toFixed(2) + "deg");
    el.style.setProperty("--ry", ((x - 0.5) * 14).toFixed(2) + "deg");
    el.style.setProperty("--gx", (x * 100).toFixed(1) + "%");
    el.style.setProperty("--gy", (y * 100).toFixed(1) + "%");
    el.classList.add("lit");
  };

  const leave = () => {
    const el = card.current;
    if (!el) return;
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
    el.classList.remove("lit");
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError("Nhập email hợp lệ.");
    if (password.length < 6) return setError("Mật khẩu cần ít nhất 6 ký tự.");
    setError("");
    onLogin(); // TODO: replace with the real auth call once the backend exists.
  };

  return (
    <div className="login-scene" onPointerMove={move} onPointerLeave={leave}>
      <div className="login-bg" aria-hidden="true">
        <span className="ribbon r1" />
        <span className="ribbon r2" />
        <span className="ribbon r3" />
      </div>
      <div className="login-drag" data-tauri-drag-region />

      <div className="login-card" ref={card}>
        <span className="glare" aria-hidden="true" />
        <span className="corner tl" aria-hidden="true" />
        <span className="corner br" aria-hidden="true" />

        <div className="login-brand">
          <span className="login-logo" aria-hidden="true"><span /></span>
          <span>Studio Manager</span>
        </div>
        <h1>{mode === "signin" ? "Chào mừng trở lại" : "Tạo tài khoản"}</h1>
        <p className="login-sub">
          {mode === "signin" ? "Đăng nhập để quản lý dự án, ảnh và khách hàng." : "Bắt đầu quản lý studio của bạn ở một nơi."}
        </p>

        <form onSubmit={submit} noValidate>
          {mode === "signup" ? (
            <label className="field">
              <span>Tên studio</span>
              <span className="input-wrap">
                <Icon name="users" size={17} />
                <input type="text" placeholder="Studio Ánh Sáng" autoComplete="organization" />
              </span>
            </label>
          ) : null}

          <label className="field">
            <span>Email</span>
            <span className="input-wrap">
              <Icon name="message" size={17} />
              <input
                type="email"
                placeholder="ban@studio.com"
                autoComplete="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(""); }}
              />
            </span>
          </label>

          <label className="field">
            <span>Mật khẩu</span>
            <span className="input-wrap">
              <Icon name="shield" size={17} />
              <input
                type={showPw ? "text" : "password"}
                placeholder="Ít nhất 6 ký tự"
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(""); }}
              />
              <button type="button" className="eye" aria-label={showPw ? "Ẩn mật khẩu" : "Hiện mật khẩu"} onClick={() => setShowPw((v) => !v)}>
                {showPw ? "Ẩn" : "Hiện"}
              </button>
            </span>
          </label>

          {mode === "signin" ? (
            <div className="login-row">
              <label className="check"><input type="checkbox" defaultChecked /> Ghi nhớ trên máy này</label>
              <button type="button" className="text-btn">Quên mật khẩu?</button>
            </div>
          ) : null}

          {error ? <p className="login-error" role="alert">{error}</p> : null}

          <button type="submit" className="login-submit">
            {mode === "signin" ? "Đăng nhập" : "Tạo tài khoản"}
            <Icon name="chevronRight" size={18} stroke={2.4} />
          </button>
        </form>

        <div className="login-divider"><span>hoặc tiếp tục với</span></div>
        <div className="login-social">
          <button type="button" className="social">Google</button>
          <button type="button" className="social">Apple</button>
          <button type="button" className="social">LINE</button>
        </div>

        <p className="login-switch">
          {mode === "signin" ? "Chưa có tài khoản?" : "Đã có tài khoản?"}{" "}
          <button type="button" className="text-btn" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(""); }}>
            {mode === "signin" ? "Tạo tài khoản" : "Đăng nhập"}
          </button>
        </p>
      </div>
    </div>
  );
}
