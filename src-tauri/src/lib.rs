mod db;
mod commands;
mod file_commands;

use db::Database;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // Set up logging in debug mode
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Register plugins
            app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;
            app.handle().plugin(tauri_plugin_process::init())?;

            // Initialize SQLite database
            let app_dir = app.path().app_local_data_dir()
                .map_err(|e| Box::new(e) as Box<dyn std::error::Error>)?;
            let database = Database::new(app_dir)?;
            app.manage(database);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Database commands
            commands::db_get_all,
            commands::db_get_by_id,
            commands::db_insert,
            commands::db_update,
            commands::db_delete,
            commands::db_upsert,
            commands::db_query,
            commands::db_execute,
            // File system commands
            file_commands::file_save,
            file_commands::file_read,
            file_commands::file_delete,
            file_commands::file_metadata,
            file_commands::file_list,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
