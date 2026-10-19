use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_notification::NotificationExt;

const REMINDERS_FILE: &str = "doo-reminders.json";

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Reminder {
    pub id: String,
    pub text: String,
    pub due_ms: i64, // milliseconds since epoch
}

// to ensure that only one thread is reading/writing the reminders file at a time
pub struct ReminderLock(pub Mutex<()>);

fn reminders_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("could not resolve app data dir: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("could not create app data dir: {e}"))?;
    Ok(dir.join(REMINDERS_FILE))
}

fn read_reminders(app: &AppHandle) -> Result<Vec<Reminder>, String> {
    let path = reminders_path(app)?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let raw = fs::read_to_string(&path).map_err(|e| format!("could not read reminders: {e}"))?;

    Ok(serde_json::from_str::<Vec<Reminder>>(&raw).unwrap_or_default())
}

fn write_reminders(app: &AppHandle, reminders: &[Reminder]) -> Result<(), String> {
    let path = reminders_path(app)?;
    let json = serde_json::to_string(reminders).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| format!("could not write reminders: {e}"))
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

#[tauri::command]
pub fn add_reminder(
    app: AppHandle,
    lock: State<ReminderLock>,
    id: String,
    text: String,
    due_ms: i64,
) -> Result<(), String> {
    let _guard = lock.0.lock().map_err(|_| "reminder lock poisoned".to_string())?;
    let mut reminders = read_reminders(&app)?;
    reminders.push(Reminder { id, text, due_ms });
    write_reminders(&app, &reminders)
}

#[tauri::command]
pub fn list_reminders(app: AppHandle, lock: State<ReminderLock>) -> Result<Vec<Reminder>, String> {
    let _guard = lock.0.lock().map_err(|_| "reminder lock poisoned".to_string())?;
    let mut reminders = read_reminders(&app)?;
    reminders.sort_by_key(|r| r.due_ms);
    Ok(reminders)
}

#[tauri::command]
pub fn delete_reminder(app: AppHandle, lock: State<ReminderLock>, id: String) -> Result<(), String> {
    let _guard = lock.0.lock().map_err(|_| "reminder lock poisoned".to_string())?;
    let mut reminders = read_reminders(&app)?;
    reminders.retain(|r| r.id != id);
    write_reminders(&app, &reminders)
}

// to be called from the scheduler thread runs every 5 seconds to fire any reminders that are due
fn fire_due_reminders(app: &AppHandle) {
    let now = now_ms();
    let lock = app.state::<ReminderLock>();

    let due: Vec<Reminder> = {
        let Ok(_guard) = lock.0.lock() else { return };
        let Ok(reminders) = read_reminders(app) else { return };
        let (due, pending): (Vec<Reminder>, Vec<Reminder>) =
            reminders.into_iter().partition(|r| r.due_ms <= now);
        if due.is_empty() {
            return;
        }
        if write_reminders(app, &pending).is_err() {
            return;
        }
        due
    };

    for r in due {
        let missed = now - r.due_ms > 120_000;
        let title = if missed { "Doo - missed reminder" } else { "Doo reminder" };
        let _ = app
            .notification()
            .builder()
            .title(title)
            .body(r.text.clone())
            .show();
       
        let _ = app.emit("reminder-due", r.clone()); // The frontend listens for this so Doo can also say it out loud

    }
}


// Starts a background thread that checks for due reminders every 5 seconds
pub fn start_scheduler(app: AppHandle) {
    std::thread::spawn(move || loop {
        fire_due_reminders(&app);
        std::thread::sleep(Duration::from_secs(5));
    });
}