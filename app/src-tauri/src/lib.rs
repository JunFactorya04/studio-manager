// Entry point shared by desktop (main.rs) and mobile builds.

mod media;
mod ops;
mod ops_core;

#[tauri::command]
fn app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            app_version,
            media::scan_source,
            media::import_items,
            media::folder_size,
            ops::scan_capture,
            ops::process_image,
            ops::deliver_file,
            ops::check_dir,
            ops::dir_stats,
            ops::file_info,
            ops::machine_info,
            ops::c1_info,
            ops::c1_status,
            ops::c1_open,
            ops::c1_process,
            ops::c1_dictionary,
            ops::drive_folder,
            ops::read_text_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running Studio Manager");
}
