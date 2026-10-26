import { head } from "@vercel/blob";
import { ID } from "./_util.js";

// Serves a published gallery page from our own address.
export default async function handler(req, res) {
  const id = String(req.query.id || "");
  if (!ID.test(id)) return res.status(404).send("Không tìm thấy");
  try {
    const meta = await head(`g/${id}.html`);
    const r = await fetch(meta.url);
    const html = await r.text();
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    res.status(200).send(html);
  } catch {
    res.status(404).send("Không tìm thấy trang chọn ảnh này (có thể đã bị gỡ).");
  }
}
