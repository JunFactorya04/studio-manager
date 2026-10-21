// Bridge to the Rust side. In a plain browser (npm run dev) these report that the
// desktop app is needed instead of failing.

import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";

export const isDesktop = "__TAURI_INTERNALS__" in window;

export interface ScanItem { base: string; raw?: string | null; jpg?: string | null; bytes: number }
export interface ScanResult { items: ScanItem[]; pairs: number; rawOnly: number; jpgOnly: number; bytes: number }
export interface ImportedItem { base: string; rawPath?: string | null; jpgPath?: string | null; thumbPath?: string | null; bytes: number; checksum: string; skipped: boolean }
export interface ImportResult { imported: ImportedItem[]; failures: { file: string; error: string }[]; copied: number; skipped: number; verified: boolean }
export interface Progress { done: number; total: number; file: string; bytesDone: number }

export async function pickFolder(title: string): Promise<string | null> {
  if (!isDesktop) return null;
  const r = await open({ directory: true, multiple: false, title });
  return typeof r === "string" ? r : null;
}

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
