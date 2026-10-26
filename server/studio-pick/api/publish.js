import { put } from "@vercel/blob";
import { ID, body, cors, isStudio } from "./_util.js";

// Studio uploads the gallery page. Needs the studio key. Body limit on Vercel functions is about 4.5 MB.
export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  if (!isStudio(req)) return res.status(401).json({ error: "Sai khóa studio" });
  const { id, html } = await body(req);
  if (!ID.test(id || "") || typeof html !== "string" || html.length < 200) return res.status(400).json({ error: "Dữ liệu không hợp lệ" });
  await put(`g/${id}.html`, html, { access: "public", addRandomSuffix: false, allowOverwrite: true, contentType: "text/html; charset=utf-8" });
  res.status(200).json({ ok: true, path: `/g/${id}` });
}
