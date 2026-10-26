// Tauri commands for the operations area. The work itself lives in ops_core.rs.

use crate::ops_core::{self, C1Info, Delivered, DirCheck, DirScan, DirStats, FileInfo, MachineInfo, Processed};
use crate::grade::{self, Grade, PhotoEntry};
use std::path::PathBuf;

#[tauri::command]
pub async fn scan_capture(dirs: Vec<String>) -> Result<Vec<DirScan>, String> {
    tauri::async_runtime::spawn_blocking(move || Ok(ops_core::scan_capture_dirs(&dirs))).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn process_image(src: String, out_dir: String, long_edge: u32, quality: u8, grade: Option<Grade>) -> Result<Processed, String> {
    tauri::async_runtime::spawn_blocking(move || ops_core::process_image(&PathBuf::from(src), &PathBuf::from(out_dir), long_edge, quality, grade.as_ref())).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn deliver_file(src: String, dest_dir: String, sub: String) -> Result<Delivered, String> {
    tauri::async_runtime::spawn_blocking(move || ops_core::deliver_file(&PathBuf::from(src), &PathBuf::from(dest_dir), &sub)).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn check_dir(path: String) -> Result<DirCheck, String> {
    tauri::async_runtime::spawn_blocking(move || Ok(ops_core::check_dir(&path))).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn dir_stats(path: String) -> Result<DirStats, String> {
    tauri::async_runtime::spawn_blocking(move || Ok(ops_core::dir_stats(&path))).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn file_info(path: String) -> Result<FileInfo, String> {
    tauri::async_runtime::spawn_blocking(move || Ok(ops_core::file_info(&path))).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn machine_info() -> Result<MachineInfo, String> {
    tauri::async_runtime::spawn_blocking(|| Ok(ops_core::machine_info())).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn c1_info() -> Result<C1Info, String> {
    tauri::async_runtime::spawn_blocking(|| Ok(ops_core::c1_info())).await.map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn c1_status() -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(ops_core::c1_status).await.map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn c1_open(path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || ops_core::c1_open(&path)).await.map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn c1_process(recipe: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || ops_core::c1_process(&recipe)).await.map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn c1_dictionary() -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(ops_core::c1_dictionary).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn drive_folder() -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(|| Ok(ops_core::drive_folder())).await.map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn read_text_file(path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || ops_core::read_text_file(&path)).await.map_err(|e| e.to_string())?
}

// ---------- photo editor ----------

#[tauri::command]
pub async fn list_photos(dir: String) -> Result<Vec<PhotoEntry>, String> {
    tauri::async_runtime::spawn_blocking(move || grade::list_photos(&dir)).await.map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn grade_preview(path: String, edge: u32, grade: Grade) -> Result<tauri::ipc::Response, String> {
    let bytes = tauri::async_runtime::spawn_blocking(move || grade::render_preview(&PathBuf::from(path), edge, &grade)).await.map_err(|e| e.to_string())??;
    Ok(tauri::ipc::Response::new(bytes))
}
#[tauri::command]
pub async fn photo_thumb(path: String, edge: u32) -> Result<tauri::ipc::Response, String> {
    let bytes = tauri::async_runtime::spawn_blocking(move || grade::render_thumb(&PathBuf::from(path), edge)).await.map_err(|e| e.to_string())??;
    Ok(tauri::ipc::Response::new(bytes))
}
#[tauri::command]
pub async fn read_grade(path: String) -> Result<Option<Grade>, String> {
    tauri::async_runtime::spawn_blocking(move || Ok(grade::read_sidecar(&PathBuf::from(path)))).await.map_err(|e| e.to_string())?
}
/// Save one grade to many photos. A neutral grade removes the sidecars.
#[tauri::command]
pub async fn write_grades(paths: Vec<String>, grade: Grade) -> Result<u32, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut n = 0;
        for p in &paths {
            grade::write_sidecar(&PathBuf::from(p), &grade)?;
            n += 1;
        }
        Ok(n)
    })
    .await
    .map_err(|e| e.to_string())?
}
/// Check that a .cube file can be read before it is used.
#[tauri::command]
pub async fn check_lut(path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || grade::load_lut(&path).map(|_| "ok".to_string())).await.map_err(|e| e.to_string())?
}
