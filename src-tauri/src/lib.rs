use std::fs;
use std::path::PathBuf;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, WindowEvent,
};
mod reminders;

// to store the memory in a file in the app data directory
const MEMORY_FILE: &str = "doo-memory.json";
const EMPTY_MEMORY: &str = r#"{"userName":null,"history":[],"facts":[]}"#;

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

// Show the main window, unminimized and focused, if it exists
fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
        tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .manage(reminders::ReminderLock(std::sync::Mutex::new(())))
        .setup(|app| {

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            //  System tray, let it keep running with its window hidden 
            let show_item = MenuItem::with_id(app, "show", "Show Doo", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit Doo", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &quit_item])?;

            let mut tray = TrayIconBuilder::new()
                .tooltip("Doo")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => show_main_window(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    // Left-click the tray icon to bring Doo back
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main_window(tray.app_handle());
                    }
                });

            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
                        tray.build(app)?;

            reminders::start_scheduler(app.handle().clone()); // start the background thread that checks for due reminders every 5 seconds

            Ok(())
        })
      
        //  Prevent closing the window, instead hide it to the tray 
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            load_memory,
            save_memory,
            clear_memory,
            reminders::add_reminder,
            reminders::list_reminders,
            reminders::delete_reminder
        ])
                .run(tauri::generate_context!())
        .expect("error while running tauri application");
}