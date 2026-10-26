import { head, put } from "@vercel/blob";
import { ID, body, cors, isStudio } from "./_util.js";

// POST (client): save the picks for a gallery. GET (studio, needs key): read them back.
export default async function handler(req, res) {
  if (cors(req, res)) return;
  const key = (id) => `p/${id}.json`;
  if (req.method === "POST") {
    const b = await body(req);
    const names = Array.isArray(b.names) ? b.names.filter((n) => typeof n === "string" && n.length <= 80).slice(0, 2000) : null;
    if (!ID.test(b.id || "") || !names) return res.status(400).json({ error: "Dữ liệu không hợp lệ" });
    try { await head(`g/${b.id}.html`); } catch { return res.status(404).json({ error: "Không có trang này" }); }
    await put(key(b.id), JSON.stringify({ names, at: new Date().toISOString() }), { access: "public", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json" });
    return res.status(200).json({ ok: true, count: names.length });
  }
  if (req.method === "GET") {
    if (!isStudio(req)) return res.status(401).json({ error: "Sai khóa studio" });
    const id = String(req.query.id || "");
    if (!ID.test(id)) return res.status(400).json({ error: "Mã không hợp lệ" });
    try {
      const meta = await head(key(id));
      const r = await fetch(meta.url + "?t=" + Date.now());
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json(await r.json());
    } catch { return res.status(200).json({ names: [], at: null }); }
  }
  res.status(405).json({ error: "Method not allowed" });
}
