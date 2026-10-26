// Tauri commands for the operations area. The work itself lives in ops_core.rs.

use crate::ops_core::{self, Delivered, DirCheck, DirScan, Processed};
use std::path::PathBuf;

#[tauri::command]
pub async fn scan_capture(dirs: Vec<String>) -> Result<Vec<DirScan>, String> {
    tauri::async_runtime::spawn_blocking(move || Ok(ops_core::scan_capture_dirs(&dirs))).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn process_image(src: String, out_dir: String, long_edge: u32, quality: u8) -> Result<Processed, String> {
    tauri::async_runtime::spawn_blocking(move || ops_core::process_image(&PathBuf::from(src), &PathBuf::from(out_dir), long_edge, quality)).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn deliver_file(src: String, dest_dir: String, sub: String) -> Result<Delivered, String> {
    tauri::async_runtime::spawn_blocking(move || ops_core::deliver_file(&PathBuf::from(src), &PathBuf::from(dest_dir), &sub)).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn check_dir(path: String) -> Result<DirCheck, String> {
    tauri::async_runtime::spawn_blocking(move || Ok(ops_core::check_dir(&path))).await.map_err(|e| e.to_string())?
}
