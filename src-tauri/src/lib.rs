use std::fs;
use std::path::PathBuf;
use tauri::Manager;

// Doo's memory is stored as a single JSON blob on disk, in the OS-standard
// per-app data directory (e.g. ~/.local/share/<app> on Linux,
// ~/Library/Application Support/<app> on macOS, %APPDATA%\<app> on Windows).
// Tauri resolves that path for us; the file itself is just opaque JSON as
// far as Rust is concerned, so the frontend owns the actual shape.

const MEMORY_FILE: &str = "doo-memory.json";
const EMPTY_MEMORY: &str = r#"{"userName":null,"history":[]}"#;

fn memory_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("could not resolve app data dir: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("could not create app data dir: {e}"))?;
    Ok(dir.join(MEMORY_FILE))
}

#[tauri::command]
fn load_memory(app: tauri::AppHandle) -> Result<String, String> {
    let path = memory_path(&app)?;
    if !path.exists() {
        return Ok(EMPTY_MEMORY.to_string());
    }
    fs::read_to_string(&path).map_err(|e| format!("could not read memory file: {e}"))
}

#[tauri::command]
fn save_memory(app: tauri::AppHandle, data: String) -> Result<(), String> {
    let path = memory_path(&app)?;
    fs::write(&path, data).map_err(|e| format!("could not write memory file: {e}"))
}

#[tauri::command]
fn clear_memory(app: tauri::AppHandle) -> Result<(), String> {
    let path = memory_path(&app)?;
    if path.exists() {
        fs::remove_file(&path).map_err(|e| format!("could not delete memory file: {e}"))?;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![load_memory, save_memory, clear_memory])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
