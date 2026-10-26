export const ID = /^[A-Za-z0-9_-]{6,80}$/;
export function cors(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type,x-studio-key");
  if (req.method === "OPTIONS") { res.status(204).end(); return true; }
  return false;
}
export const isStudio = (req) => !!process.env.STUDIO_KEY && req.headers["x-studio-key"] === process.env.STUDIO_KEY;
export async function body(req) {
  if (req.body && typeof req.body === "object") return req.body;
  try { return JSON.parse(req.body || "{}"); } catch { return {}; }
}
