// Bridge to the Rust side. In a plain browser (npm run dev) these report that the
// desktop app is needed instead of failing.

import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";

export const isDesktop = "__TAURI_INTERNALS__" in window;

export interface ScanItem { base: string; raw?: string | null; jpg?: string | null; bytes: number }
export interface ScanResult { items: ScanItem[]; pairs: number; rawOnly: number; jpgOnly: number; bytes: number }
export interface ImportedItem { base: string; rawPath?: string | null; jpgPath?: string | null; thumbPath?: string | null; bytes: number; checksum: string; skipped: boolean }
export interface ImportResult { imported: ImportedItem[]; failures: { file: string; error: string }[]; copied: number; skipped: number; verified: boolean; cancelled: boolean }
export interface Progress { done: number; total: number; file: string; bytesDone: number; bytesTotal: number }
export interface CardInfo { name: string; path: string }

export async function pickFolder(title: string): Promise<string | null> {
  if (!isDesktop) return null;
  const r = await open({ directory: true, multiple: false, title });
  return typeof r === "string" ? r : null;
}

export const findCards = () => invoke<CardInfo[]>("find_cards");
export const cancelImport = () => invoke<void>("cancel_import");
export const scanSource = (dir: string) => invoke<ScanResult>("scan_source", { dir });

export async function importItems(
  req: { items: { raw?: string | null; jpg?: string | null; newBase: string }[]; dest: string; makeThumbs: boolean },
  onProgress: (p: Progress) => void,
): Promise<ImportResult> {
  const unlisten = await listen<Progress>("import-progress", (e) => onProgress(e.payload));
  try {
    return await invoke<ImportResult>("import_items", { req });
  } finally {
    unlisten();
  }
}

export const fileUrl = (path?: string | null) => (path && isDesktop ? convertFileSrc(path) : undefined);

export const sep = (root: string) => (root.includes("\\") ? "\\" : "/");
export const joinPath = (root: string, ...parts: string[]) => {
  const s = sep(root);
  return [root.replace(/[\\/]+$/, ""), ...parts].join(s);
};

export const slug = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");

export const fmtBytes = (n: number) =>
  n >= 1e12 ? (n / 1e12).toFixed(2) + " TB" : n >= 1e9 ? (n / 1e9).toFixed(1) + " GB" : n >= 1e6 ? (n / 1e6).toFixed(0) + " MB" : Math.round(n / 1e3) + " KB";

// ---------- operations (folder watcher, resize, delivery) ----------
export interface CaptureFile { path: string; name: string; size: number; modifiedMs: number; raw: boolean }
export interface DirScan { dir: string; ok: boolean; error?: string | null; files: CaptureFile[] }
export interface Processed { output: string; width: number; height: number; bytes: number }
export interface Delivered { dest: string; bytes: number; checksum: string; skipped: boolean }
export interface DirCheck { exists: boolean; writable: boolean }

export const scanCapture = (dirs: string[]) => invoke<DirScan[]>("scan_capture", { dirs });
export const processImage = (src: string, outDir: string, longEdge: number, quality = 90) => invoke<Processed>("process_image", { src, outDir, longEdge, quality });
export const deliverFile = (src: string, destDir: string, sub: string) => invoke<Delivered>("deliver_file", { src, destDir, sub });
export const checkDir = (path: string) => invoke<DirCheck>("check_dir", { path });
export interface DirStats { exists: boolean; count: number; bytes: number; latestMs: number }
export interface FileInfo { exists: boolean; size: number; modifiedMs: number }
export interface MachineInfo { host: string; os: string; captureOneRunning: boolean }
export const dirStats = (path: string) => invoke<DirStats>("dir_stats", { path });
export const fileInfo = (path: string) => invoke<FileInfo>("file_info", { path });
export const machineInfo = () => invoke<MachineInfo>("machine_info");

// Capture One control (macOS only; other systems get a clear error from Rust)
export interface C1Info { supported: boolean; appPath?: string | null; running: boolean }
export const c1Info = () => invoke<C1Info>("c1_info");
export const c1Status = () => invoke<string>("c1_status");
export const c1Open = (path: string) => invoke<string>("c1_open", { path });
export const c1Process = (recipe: string) => invoke<string>("c1_process", { recipe });
export const c1Dictionary = () => invoke<string>("c1_dictionary");

// Pick several files with the system dialog, optionally starting in Google Drive for desktop.
export async function pickFiles(title: string, extensions: string[], defaultPath?: string): Promise<string[]> {
  if (!isDesktop) return [];
  const r = await open({ multiple: true, directory: false, title, defaultPath, filters: [{ name: extensions.join(", "), extensions }] });
  return Array.isArray(r) ? r : typeof r === "string" ? [r] : [];
}
export const driveFolder = () => invoke<string | null>("drive_folder");
export const readTextFile = (path: string) => invoke<string>("read_text_file", { path });
