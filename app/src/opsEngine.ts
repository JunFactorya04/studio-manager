// Background engine for the operations area. Runs only in the desktop app (it needs the file system):
//   1. watches each spot's capture folder and turns new, finished JPEGs into jobs;
//   2. resizes each job's photo into the spot's output folder (retrying on failure);
//   3. copies the result to the event's delivery folder with a checksum check.
// Every step is idempotent: a photo is identified by its full path, so rescans never create duplicates.

import { useSyncExternalStore } from "react";
import { deliverFile, isDesktop, machineInfo, processImage, scanCapture, type DirScan } from "./native";
import { getOps, logLine, opsActions, type Job } from "./opsStore";
import { uid } from "./store";

export interface DirState { dir: string; ok: boolean; error?: string; jpg: number; raw: number; lastScan: number }
export interface EngineView { running: boolean; lastTick: number; dirs: Record<string, DirState>; busy: number }

let view: EngineView = { running: false, lastTick: 0, dirs: {}, busy: 0 };
const listeners = new Set<() => void>();
const setView = (p: Partial<EngineView>) => { view = { ...view, ...p }; listeners.forEach((l) => l()); };
const subscribe = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };
export const useEngine = () => useSyncExternalStore(subscribe, () => view);

const CONCURRENCY = 2;
const stable = new Map<string, { size: number; mod: number }>(); // last poll's size/mtime per file; a file is "finished" when unchanged between polls
const busyJobs = new Set<string>();
const busyDeliveries = new Set<string>();
let timer: ReturnType<typeof setTimeout> | undefined;
let ticking = false;
let started = false;

export const longEdgeOf = (recipe: string) => {
  const m = recipe.match(/(\d{3,5})\s*px/i);
  return m ? Math.min(12000, Math.max(200, +m[1])) : 2400;
};
const backoffMs = (attempts: number) => Math.min(5 * 60_000, 10_000 * 2 ** Math.max(0, attempts - 1));
const errText = (e: unknown) => (typeof e === "string" ? e : e instanceof Error ? e.message : "Lỗi không rõ");

async function ingest() {
  const o = getOps();
  const spots = o.spots.filter((s) => s.captureDir.trim() && o.events.find((e) => e.id === s.eventId)?.status === "live");
  const dirs = [...new Set(spots.map((s) => s.captureDir.trim()))];
  if (!dirs.length) { setView({ dirs: {} }); return; }
  let scans: DirScan[];
  try { scans = await scanCapture(dirs); } catch (e) { setView({ dirs: Object.fromEntries(dirs.map((d) => [d, { dir: d, ok: false, error: errText(e), jpg: 0, raw: 0, lastScan: Date.now() }])) }); return; }
  const known = new Set(getOps().jobs.map((j) => j.source).filter(Boolean) as string[]);
  const next: Record<string, DirState> = {};
  const fresh: Job[] = [];
  const seen = new Set<string>();
  for (const sc of scans) {
    next[sc.dir] = { dir: sc.dir, ok: sc.ok, error: sc.error ?? undefined, jpg: sc.files.filter((f) => !f.raw).length, raw: sc.files.filter((f) => f.raw).length, lastScan: Date.now() };
    if (!sc.ok) continue;
    for (const f of sc.files) {
      if (f.raw) continue; // RAW is Capture One's job (module 03); the watcher only counts it
      seen.add(f.path);
      const prev = stable.get(f.path);
      stable.set(f.path, { size: f.size, mod: f.modifiedMs });
      if (known.has(f.path) || !prev || prev.size !== f.size || prev.mod !== f.modifiedMs || f.size === 0) continue;
      // the same folder may belong to several spots (unusual); the first one wins
      const spot = spots.find((s) => s.captureDir.trim() === sc.dir);
      if (!spot) continue;
      known.add(f.path);
      fresh.push({ id: uid(), eventId: spot.eventId, spotId: spot.id, file: f.name, status: "pending", createdAt: new Date().toISOString().slice(0, 19), durationSec: 0, attempts: 0, source: f.path, size: f.size });
    }
  }
  for (const k of [...stable.keys()]) if (!seen.has(k)) stable.delete(k);
  setView({ dirs: next });
  if (fresh.length) {
    const bySpot = new Map<string, number>();
    fresh.forEach((j) => bySpot.set(j.spotId, (bySpot.get(j.spotId) ?? 0) + 1));
    for (const [spotId, n] of bySpot) {
      const sp = o.spots.find((s) => s.id === spotId);
      opsActions.addJobs(fresh.filter((j) => j.spotId === spotId), logLine("ingest", `Nhận ${n} ảnh mới từ ${sp?.name ?? "điểm chụp"}`, sp?.eventId, spotId));
    }
  }
}

async function runJob(id: string) {
  const o = getOps();
  const job = o.jobs.find((j) => j.id === id);
  if (!job || !job.source) return;
  const spot = o.spots.find((s) => s.id === job.spotId);
  const max = o.engine?.maxAttempts ?? 3;
  const t0 = Date.now();
  opsActions.patchJob(id, { status: "running", error: undefined });
  try {
    if (!spot?.outputDir.trim()) throw new Error("Điểm chụp chưa đặt thư mục ảnh xuất");
    const r = await processImage(job.source, spot.outputDir.trim(), longEdgeOf(spot.recipe), 90);
    const secs = Math.max(1, Math.round((Date.now() - t0) / 1000));
    opsActions.patchJob(id, { status: "succeeded", output: r.output, durationSec: secs, attempts: job.attempts + 1, retryAt: undefined, error: undefined }, logLine("export", `Xuất ${job.file} (${r.width}×${r.height})`, job.eventId, job.spotId, id));
    const ev = getOps().events.find((e) => e.id === job.eventId);
    if (ev?.deliveryDir?.trim() && !getOps().deliveries.some((d) => d.jobId === id)) {
      opsActions.addDelivery({ id: uid(), jobId: id, eventId: job.eventId, spotId: job.spotId, file: job.file, status: "pending", attempts: 0, at: new Date().toISOString().slice(0, 19) });
    }
  } catch (e) {
    const attempts = job.attempts + 1;
    const msg = errText(e);
    const final = attempts >= max || /RAW|định dạng|chưa đặt thư mục/.test(msg); // retrying cannot fix these
    opsActions.patchJob(id, { status: final ? "failed" : "pending", attempts, error: msg, retryAt: final ? undefined : Date.now() + backoffMs(attempts), durationSec: Math.round((Date.now() - t0) / 1000) },
      logLine(final ? "error" : "retry", final ? `${job.file}: ${msg}` : `Thử lại ${job.file} (lần ${attempts}/${max}): ${msg}`, job.eventId, job.spotId, id));
  }
}

async function runDelivery(id: string) {
  const o = getOps();
  const d = o.deliveries.find((x) => x.id === id);
  if (!d) return;
  const job = o.jobs.find((j) => j.id === d.jobId);
  const ev = o.events.find((e) => e.id === d.eventId);
  const spot = o.spots.find((s) => s.id === d.spotId);
  const max = o.engine?.maxAttempts ?? 3;
  opsActions.patchDelivery(id, { status: "uploading", error: undefined });
  try {
    if (!job?.output) throw new Error("Chưa có ảnh đã xuất");
    if (!ev?.deliveryDir?.trim()) throw new Error("Sự kiện chưa đặt thư mục giao ảnh");
    const r = await deliverFile(job.output, ev.deliveryDir.trim(), spot?.name ?? "");
    opsActions.patchDelivery(id, { status: "done", attempts: d.attempts + 1, dest: r.dest, checksum: r.checksum, error: undefined, retryAt: undefined, at: new Date().toISOString().slice(0, 19) },
      logLine("upload", r.skipped ? `${d.file} đã có ở đích, bỏ qua` : `Giao ${d.file} (đã kiểm checksum)`, d.eventId, d.spotId, d.jobId));
  } catch (e) {
    const attempts = d.attempts + 1;
    const msg = errText(e);
    const final = attempts >= max || /chưa đặt thư mục|Chưa có ảnh/.test(msg);
    opsActions.patchDelivery(id, { status: final ? "failed" : "pending", attempts, error: msg, retryAt: final ? undefined : Date.now() + backoffMs(attempts) },
      logLine(final ? "error" : "retry", final ? `Giao ${d.file} thất bại: ${msg}` : `Thử lại giao ${d.file} (lần ${attempts}/${max}): ${msg}`, d.eventId, d.spotId, d.jobId));
  }
}

function pump() {
  const o = getOps();
  const now = Date.now();
  for (const j of o.jobs) {
    if (busyJobs.size >= CONCURRENCY) break;
    if (j.status !== "pending" || !j.source || busyJobs.has(j.id) || (j.retryAt ?? 0) > now) continue;
    busyJobs.add(j.id);
    void runJob(j.id).finally(() => { busyJobs.delete(j.id); setView({ busy: busyJobs.size + busyDeliveries.size }); });
  }
  for (const d of o.deliveries) {
    if (busyDeliveries.size >= CONCURRENCY) break;
    if (d.status !== "pending" || busyDeliveries.has(d.id) || (d.retryAt ?? 0) > now || d.demo) continue;
    busyDeliveries.add(d.id);
    void runDelivery(d.id).finally(() => { busyDeliveries.delete(d.id); setView({ busy: busyJobs.size + busyDeliveries.size }); });
  }
  setView({ busy: busyJobs.size + busyDeliveries.size });
}

let lastBeat = 0;
let lastHost: { host: string; os: string; c1: boolean } | undefined;
// Fill the "Studio Agent" card with this machine's real state (host, Capture One process, folder watcher, queue).
async function heartbeat() {
  const now = Date.now();
  if (now - lastBeat < 15_000) return;
  lastBeat = now;
  try { const m = await machineInfo(); lastHost = { host: m.host, os: m.os, c1: m.captureOneRunning }; } catch { /* keep the previous value */ }
  const o = getOps();
  const dirs = Object.values(view.dirs);
  const queue = o.jobs.filter((j) => j.source && (j.status === "pending" || j.status === "running")).length + o.deliveries.filter((d) => !d.demo && (d.status === "pending" || d.status === "uploading")).length;
  opsActions.setAgent({
    real: true, online: !o.engine?.paused, lastSeen: new Date().toISOString().slice(0, 19), host: lastHost?.host ?? o.agent.host, os: lastHost?.os, localQueue: queue,
    captureOne: lastHost?.c1 ? "ok" : "idle", ftp: dirs.some((d) => !d.ok) ? "error" : dirs.length ? "ok" : "idle",
  });
}

export async function tick() {
  if (ticking) return;
  ticking = true;
  try {
    if (!getOps().engine?.paused) { await ingest(); pump(); }
    setView({ lastTick: Date.now() });
    await heartbeat();
  } catch { /* a failed scan must never stop the loop */ } finally { ticking = false; }
}

// Called by the Retry button: send a failed or paused item back to the queue.
export const retryJob = (id: string) => { opsActions.patchJob(id, { status: "pending", attempts: 0, error: undefined, retryAt: undefined }, logLine("retry", "Thử lại thủ công", undefined, undefined, id)); void tick(); };
export const retryDelivery = (id: string) => { opsActions.patchDelivery(id, { status: "pending", attempts: 0, error: undefined, retryAt: undefined }); void tick(); };
export const pauseJob = (id: string) => opsActions.patchJob(id, { status: "paused" });
export const resumeJob = (id: string) => { opsActions.patchJob(id, { status: "pending", retryAt: undefined }); void tick(); };

export function startEngine() {
  if (!isDesktop || started) return;
  started = true;
  opsActions.recoverInterrupted();
  setView({ running: true });
  const loop = async () => {
    await tick();
    timer = setTimeout(loop, Math.max(2, getOps().engine?.pollSec ?? 5) * 1000);
  };
  void loop();
}
export function stopEngine() { if (timer) clearTimeout(timer); started = false; setView({ running: false }); }
