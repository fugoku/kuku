mod plugin_fs;
mod plugin_settings;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            // Plugin FS (sandboxed)
            plugin_fs::plugin_fs_read_text,
            plugin_fs::plugin_fs_write_text,
            plugin_fs::plugin_fs_read_binary,
            plugin_fs::plugin_fs_write_binary,
            plugin_fs::plugin_fs_exists,
            plugin_fs::plugin_fs_mkdir,
            plugin_fs::plugin_fs_read_dir,
            plugin_fs::plugin_fs_remove,
            // Plugin Settings
            plugin_settings::plugin_ensure_root_dirs,
            plugin_settings::plugin_get_settings,
            plugin_settings::plugin_save_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
