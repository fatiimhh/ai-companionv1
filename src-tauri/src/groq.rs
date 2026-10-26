use std::fs;
use std::path::PathBuf;
use std::time::Duration;
use tauri::{AppHandle, Manager};

const SETTINGS_FILE: &str = "doo-settings.json";
const CHAT_URL: &str = "https://api.groq.com/openai/v1/chat/completions";
const TRANSCRIBE_URL: &str = "https://api.groq.com/openai/v1/audio/transcriptions";
const TRANSCRIBE_MODEL: &str = "whisper-large-v3-turbo";
const NO_KEY: &str = "NO_API_KEY";

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("could not resolve app data dir: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("could not create app data dir: {e}"))?;
    Ok(dir.join(SETTINGS_FILE))
}


// reads the saved API key from the settings file if it exists
fn read_saved_key(app: &AppHandle) -> Option<String> {
    let raw = fs::read_to_string(settings_path(app).ok()?).ok()?;
    let value: serde_json::Value = serde_json::from_str(&raw).ok()?;
    let key = value.get("groqApiKey")?.as_str()?.trim().to_string();
    if key.is_empty() {
        None
    } else {
        Some(key)
    }
}


// returns the API key to use, either from the saved settings or from the environment variable
fn resolve_key(app: &AppHandle) -> Option<String> {
    read_saved_key(app).or_else(|| {
        option_env!("GROQ_API_KEY")
            .map(|k| k.trim().to_string())
            .filter(|k| !k.is_empty())
    })
}

fn http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| format!("could not create HTTP client: {e}"))
}

#[tauri::command]
pub fn has_api_key(app: AppHandle) -> bool {
    resolve_key(&app).is_some()
}

#[tauri::command]
pub fn set_api_key(app: AppHandle, key: String) -> Result<(), String> {
    let key = key.trim().to_string();
    if !key.starts_with("gsk_") {
        return Err("That doesn't look like a Groq key (they start with gsk_).".to_string());
    }
    let path = settings_path(&app)?;
    let json = serde_json::json!({ "groqApiKey": key });
    fs::write(&path, json.to_string()).map_err(|e| format!("could not save key: {e}"))
}


// makes a chat request to Groq and returns the raw response
#[tauri::command]
pub async fn groq_chat(app: AppHandle, body: String) -> Result<String, String> {
    let key = resolve_key(&app).ok_or_else(|| NO_KEY.to_string())?;

    let response = http_client()?
        .post(CHAT_URL)
        .bearer_auth(key)
        .header("Content-Type", "application/json")
        .body(body)
        .send()
        .await
        .map_err(|e| format!("request failed: {e}"))?;

    let status = response.status();
    let text = response
        .text()
        .await
        .map_err(|e| format!("could not read response: {e}"))?;

    if !status.is_success() {
        return Err(format!("Groq returned {status}: {text}"));
    }
    Ok(text)
}

// makes a transcription request to Groq and returns the raw response
#[tauri::command]
pub async fn groq_transcribe(app: AppHandle, audio: Vec<u8>, mime: String) -> Result<String, String> {
    let key = resolve_key(&app).ok_or_else(|| NO_KEY.to_string())?;


// Windows records WebM; macOS (Safari/WebKit) records MP4
    let (file_name, mime_type) = if mime.contains("mp4") || mime.contains("aac") {
        ("recording.mp4", "audio/mp4")
    } else if mime.contains("ogg") {
        ("recording.ogg", "audio/ogg")
    } else if mime.contains("wav") {
        ("recording.wav", "audio/wav")
    } else {
        ("recording.webm", "audio/webm")
    };

    let part = reqwest::multipart::Part::bytes(audio)
        .file_name(file_name)
        .mime_str(mime_type)
        .map_err(|e| format!("invalid audio type: {e}"))?;
    let form = reqwest::multipart::Form::new()
        .part("file", part)
        .text("model", TRANSCRIBE_MODEL);

    let response = http_client()?
        .post(TRANSCRIBE_URL)
        .bearer_auth(key)
        .multipart(form)
        .send()
        .await
        .map_err(|e| format!("request failed: {e}"))?;

    let status = response.status();
    let text = response
        .text()
        .await
        .map_err(|e| format!("could not read response: {e}"))?;

    if !status.is_success() {
        return Err(format!("Groq returned {status}: {text}"));
    }
    Ok(text)
}