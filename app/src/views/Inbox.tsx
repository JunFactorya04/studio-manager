import { useEffect, useMemo, useRef, useState } from "react";
import { Header } from "../components/Header";
import { Icon } from "../components/Icon";
import { Field, Sheet } from "../components/Sheet";
import {
  STAGES, STAGE_TONE, actions, fmtDate, initials, invoiceStatus, money, paidFor, projectPaid, today, useData,
  type Channel, type Client, type Data, type Project,
} from "../store";
import type { Go, Route } from "../nav";

const CH: Record<Channel, { label: string; color: string }> = {
  line: { label: "LINE", color: "#06A045" },
  messenger: { label: "Messenger", color: "#8E44D9" },
  zalo: { label: "Zalo", color: "#0068FF" },
  email: { label: "Email", color: "#8E8E93" },
};

const timeLabel = (iso: string) => {
  const dt = new Date(iso);
  const day = iso.slice(0, 10);
  const t = today();
  if (day === t) return dt.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  const diff = (new Date(t).getTime() - new Date(day).getTime()) / 86400000;
  if (diff < 2) return "Hôm qua";
  if (diff < 7) return ["CN", "T2", "T3", "T4", "T5", "T6", "T7"][dt.getDay()];
  return fmtDate(day);
};

// Quick replies filled in from the client's most recent project.
function templates(d: Data, c: Client, p?: Project) {
  const name = c.name;
  // Payment reminder uses whichever of the client's projects still has money owed.
  const owedBy = (id: string) => d.invoices.filter((i) => i.projectId === id && invoiceStatus(d, i) !== "paid").reduce((s, i) => s + i.amount - paidFor(d, i.id), 0);
  const payProject = d.projects.filter((x) => x.clientId === c.id).find((x) => owedBy(x.id) > 0);
  const owed = payProject ? owedBy(payProject.id) : 0;
  return [
    { label: "Xác nhận lịch chụp", text: p ? `Chào ${name}, studio xác nhận lịch chụp "${p.name}" lúc ${p.time} ngày ${fmtDate(p.date)} tại ${p.location || "studio"}. Hẹn gặp ạ!` : `Chào ${name}, studio xin xác nhận lịch chụp ạ.` },
    { label: "Ảnh đã sẵn sàng", text: p ? `Chào ${name}, ảnh "${p.name}" đã sẵn sàng. Studio sẽ gửi link để anh/chị chọn ${p.gallery?.limit ?? p.pkgPhotos} ảnh ạ.` : `Chào ${name}, ảnh đã sẵn sàng ạ.` },
    { label: "Nhắc thanh toán", text: payProject ? `Chào ${name}, studio xin nhắc khoản thanh toán ${money(owed)} cho "${payProject.name}". Cảm ơn anh/chị!` : `Chào ${name}, studio xin nhắc khoản thanh toán còn lại ạ.` },
    { label: "Cảm ơn", text: `Cảm ơn ${name} đã tin tưởng studio. Nếu hài lòng, anh/chị cho studio xin một đánh giá nhé!` },
  ];
}

export function Inbox({ go, route }: { go: Go; route?: Route }) {
  const d = useData();
  const [ch, setCh] = useState<Channel | "all">("all");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(route?.clientId ?? null);
  const [draft, setDraft] = useState("");
  const [incoming, setIncoming] = useState(false);
  const [status, setStatus] = useState("");
  const [newChat, setNewChat] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  // One conversation per client, newest first.
  const threads = useMemo(() => {
    const byClient = new Map<string, typeof d.messages>();
    d.messages.forEach((m) => byClient.set(m.clientId, [...(byClient.get(m.clientId) ?? []), m]));
    if (openId && !byClient.has(openId)) byClient.set(openId, []);
    return [...byClient.entries()]
      .map(([clientId, msgs]) => ({ client: d.clients.find((c) => c.id === clientId)!, msgs, last: msgs[msgs.length - 1] }))
      .filter((t) => t.client)
      .sort((a, b) => (b.last?.at ?? "9").localeCompare(a.last?.at ?? "9"));
  }, [d.messages, d.clients, openId]);

  const query = q.trim().toLowerCase();
  const list = threads.filter((t) => (ch === "all" || t.client.channel === ch) && (!query || (t.client.name + " " + t.msgs.map((m) => m.text).join(" ")).toLowerCase().includes(query)));
  const open = threads.find((t) => t.client.id === openId);
  const projects = open ? d.projects.filter((p) => p.clientId === open.client.id) : [];
  const latest = [...projects].sort((a, b) => b.date.localeCompare(a.date))[0];

  // On desktop show the newest conversation right away so the three columns are never empty.
  useEffect(() => { if (!openId && threads[0] && window.matchMedia("(min-width: 761px)").matches) setOpenId(threads[0].client.id); }, [openId, threads]);
  useEffect(() => { if (openId) actions.markRead(openId); }, [openId, open?.msgs.length]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [openId, open?.msgs.length]);

  const send = async () => {
    const text = draft.trim();
    if (!text || !open) return;
    if (incoming) {
      // Record a message the client sent on their own app.
      actions.receiveMessage(open.client.id, text);
      setStatus("Đã ghi tin của khách.");
    } else {
      actions.sendMessage(open.client.id, text);
      try { await navigator.clipboard.writeText(text); setStatus(`Đã lưu và chép. Dán vào ${CH[open.client.channel].label} để gửi.`); }
      catch { setStatus("Đã lưu tin nhắn."); }
    }
    setDraft("");
    setTimeout(() => setStatus(""), 4000);
  };

  return (
    <div className="page inbox-page">
      <Header
        title="Tin nhắn"
        actions={
          <button className="icon-btn primary" aria-label="Cuộc trò chuyện mới" onClick={() => setNewChat(true)}>
            <Icon name="edit" />
          </button>
        }
      />

      <div className={"inbox" + (open ? " has-open" : "")}>
        <aside className="inbox-list">
          <label className="search">
            <Icon name="search" size={18} stroke={2} />
            <span className="sr-only">Tìm tin nhắn</span>
            <input type="search" placeholder="Tên khách, nội dung" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <div className="pills" role="tablist" aria-label="Lọc theo kênh">
            <button role="tab" aria-selected={ch === "all"} className={"pill" + (ch === "all" ? " on" : "")} onClick={() => setCh("all")}>Tất cả</button>
            {(Object.keys(CH) as Channel[]).map((c) => (
              <button key={c} role="tab" aria-selected={ch === c} className={"pill" + (ch === c ? " on" : "")} onClick={() => setCh(c)}>
                <span className="dot-sm" style={{ background: CH[c].color }} />{CH[c].label}
              </button>
            ))}
          </div>
          <div className="card list">
            {list.map((t) => {
              const unread = t.msgs.filter((m) => m.dir === "in" && !m.read).length;
              return (
                <button key={t.client.id} className={"row thread" + (t.client.id === openId ? " selected" : "")} onClick={() => setOpenId(t.client.id)}>
                  <span className="avatar">{initials(t.client.name)}<span className="avatar-ch" style={{ background: CH[t.client.channel].color }} /></span>
                  <span className="row-main">
                    <span className="thread-top"><strong className={unread ? "" : "read"}>{t.client.name}</strong><small>{t.last ? timeLabel(t.last.at) : ""}</small></span>
                    <span className={"thread-msg" + (unread ? " unread" : "")}>{t.last ? (t.last.dir === "out" ? "Bạn: " : "") + t.last.text : "Chưa có tin nhắn"}</span>
                  </span>
                  {unread ? <span className="unread-count" aria-label={`${unread} tin chưa đọc`}>{unread}</span> : null}
                </button>
              );
            })}
            {list.length === 0 ? <p className="empty">Không có cuộc trò chuyện nào.</p> : null}
          </div>
        </aside>

        <section className="chat card" aria-label="Cuộc trò chuyện">
          {open ? (
            <>
              <div className="chat-head">
                <button className="icon-btn chat-back" aria-label="Quay lại danh sách" onClick={() => setOpenId(null)}><Icon name="chevronLeft" stroke={2.2} /></button>
                <span className="avatar">{initials(open.client.name)}<span className="avatar-ch" style={{ background: CH[open.client.channel].color }} /></span>
                <span className="row-main">
                  <strong>{open.client.name}</strong>
                  <small>{CH[open.client.channel].label}{open.client.phone ? ` · ${open.client.phone}` : ""}{open.client.email ? ` · ${open.client.email}` : ""}</small>
                </span>
              </div>
              {projects.length ? (
                <div className="chat-projects">
                  {projects.map((p) => (
                    <button key={p.id} className="chip-btn" onClick={() => go({ view: "projects", projectId: p.id })}>
                      <Icon name="folder" size={14} />{p.name} · {STAGES.find((s) => s.id === p.stage)!.label}
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="chat-body">
                {open.msgs.map((m, i) => {
                  const day = m.at.slice(0, 10);
                  const showDay = i === 0 || open.msgs[i - 1].at.slice(0, 10) !== day;
                  return (
                    <div key={m.id} className="msg-wrap">
                      {showDay ? <div className="day-sep">{day === today() ? "Hôm nay" : fmtDate(day)}</div> : null}
                      <div className={"bubble " + m.dir}>
                        <span>{m.text}</span>
                        <small>{new Date(m.at).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}</small>
                      </div>
                    </div>
                  );
                })}
                <div ref={endRef} />
              </div>
              <div className="quick">
                {templates(d, open.client, latest).map((t) => (
                  <button key={t.label} className="chip-btn" onClick={() => { setDraft(t.text); setIncoming(false); }}>{t.label}</button>
                ))}
              </div>
              <div className="composer">
                <label className="who">
                  <select className="select" value={incoming ? "in" : "out"} onChange={(e) => setIncoming(e.target.value === "in")} aria-label="Người gửi">
                    <option value="out">Studio gửi</option>
                    <option value="in">Ghi tin khách gửi</option>
                  </select>
                </label>
                <textarea
                  className="textarea"
                  rows={2}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                  placeholder={incoming ? "Nội dung khách đã gửi" : "Nhập tin nhắn, Enter để gửi"}
                  aria-label="Nội dung tin nhắn"
                />
                <button className="icon-btn primary" aria-label="Gửi" onClick={send} disabled={!draft.trim()}><Icon name="send" /></button>
              </div>
              {status ? <small className="chat-status" role="status">{status}</small> : null}
            </>
          ) : (
            <div className="chat-empty"><Icon name="message" size={32} /><p>Chọn một cuộc trò chuyện</p></div>
          )}
        </section>

        <aside className="inbox-insp card" aria-label="Thông tin khách">
          {open ? (
            <div className="insp">
              <div className="insp-who">
                <span className="avatar lg">{initials(open.client.name)}<span className="avatar-ch" style={{ background: CH[open.client.channel].color }} /></span>
                <strong>{open.client.name}</strong>
                <small>{CH[open.client.channel].label}</small>
              </div>
              <dl className="insp-kv">
                <dt>Điện thoại</dt><dd>{open.client.phone || "—"}</dd>
                <dt>Email</dt><dd>{open.client.email || "—"}</dd>
                <dt>Số dự án</dt><dd>{projects.length}</dd>
                <dt>Tin nhắn</dt><dd>{open.msgs.length}</dd>
              </dl>
              <h3 className="insp-h">Dự án</h3>
              {projects.length ? projects.map((p) => {
                const owed = Math.max(p.total - projectPaid(d, p.id), 0);
                return (
                  <button key={p.id} className="insp-proj" onClick={() => go({ view: "projects", projectId: p.id })}>
                    <span className="row-main"><strong>{p.name}</strong><small>{fmtDate(p.date)}</small></span>
                    <span className={"badge tone-" + STAGE_TONE[p.stage]}>{STAGES.find((s) => s.id === p.stage)!.short}</span>
                    {owed > 0 ? <small className="warn">Còn nợ {money(owed)}</small> : <small>Đã thu đủ</small>}
                  </button>
                );
              }) : <p className="insp-note">Chưa có dự án.</p>}
              {open.client.note ? <><h3 className="insp-h">Ghi chú</h3><p className="insp-note">{open.client.note}</p></> : null}
            </div>
          ) : <div className="empty-insp"><p className="insp-note">Chọn một cuộc trò chuyện</p></div>}
        </aside>
      </div>

      <p className="f-hint">
        Tin nhắn đang lưu trong app. Khi bấm gửi, nội dung được chép sẵn để dán vào LINE, Messenger, Zalo hoặc email.
        Kết nối thẳng với các ứng dụng này sẽ có khi dựng phần máy chủ.
      </p>

      {newChat ? <NewChat onClose={() => setNewChat(false)} onOpen={(id) => { setOpenId(id); setNewChat(false); }} /> : null}
    </div>
  );
}

function NewChat({ onClose, onOpen }: { onClose: () => void; onOpen: (clientId: string) => void }) {
  const d = useData();
  const [mode, setMode] = useState<"pick" | "new">(d.clients.length ? "pick" : "new");
  const [clientId, setClientId] = useState(d.clients[0]?.id ?? "");
  const [form, setForm] = useState({ name: "", phone: "", email: "", channel: "line" as Channel });
  const [error, setError] = useState("");
  const go = () => {
    if (mode === "pick") return clientId ? onOpen(clientId) : setError("Chọn khách hàng.");
    if (!form.name.trim()) return setError("Nhập tên khách hàng.");
    onOpen(actions.addClient({ ...form, name: form.name.trim(), note: "" }).id);
  };
  return (
    <Sheet title="Cuộc trò chuyện mới" onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>Hủy</button><button className="btn primary sm" onClick={go}>Mở</button></>}>
      <div className="segmented" role="tablist">
        <button role="tab" aria-selected={mode === "pick"} className={mode === "pick" ? "on" : ""} onClick={() => setMode("pick")}>Khách có sẵn</button>
        <button role="tab" aria-selected={mode === "new"} className={mode === "new" ? "on" : ""} onClick={() => setMode("new")}>Khách mới</button>
      </div>
      {mode === "pick" ? (
        <Field label="Khách hàng" error={error}>
          <select className="select" value={clientId} onChange={(e) => setClientId(e.target.value)}>
            {d.clients.map((c) => <option key={c.id} value={c.id}>{c.name} · {CH[c.channel].label}</option>)}
          </select>
        </Field>
      ) : (
        <>
          <Field label="Tên khách hàng" error={error}><input className="input" value={form.name} onChange={(e) => { setForm({ ...form, name: e.target.value }); setError(""); }} autoFocus /></Field>
          <div className="f-row">
            <Field label="Kênh">
              <select className="select" value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value as Channel })}>
                {(Object.keys(CH) as Channel[]).map((c) => <option key={c} value={c}>{CH[c].label}</option>)}
              </select>
            </Field>
            <Field label="Điện thoại"><input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
          </div>
          <Field label="Email"><input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
        </>
      )}
    </Sheet>
  );
}
