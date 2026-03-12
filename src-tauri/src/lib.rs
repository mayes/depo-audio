mod commands;
mod conversion;
mod ffmpeg;
mod helpers;
mod persistence;
mod preview;
pub mod types;

use types::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            commands::get_formats_list,
            commands::detect_format,
            commands::infer_case_name_cmd,
            commands::convert,
            commands::show_in_folder,
            commands::library_get,
            commands::library_rename_case,
            commands::library_archive_case,
            commands::library_delete_case,
            commands::library_delete_session,
            commands::library_import_file,
            commands::prefs_get,
            commands::prefs_set,
            commands::generate_preview,
            commands::cleanup_previews,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
